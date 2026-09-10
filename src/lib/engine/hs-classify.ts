/**
 * CaribClear — HS classifier engine (pure, testable).
 *
 * Two stages, both real:
 *  1. LEXICAL: deterministic scoring of the tenant's HsCode table against the
 *     product description (token overlap + bigrams + keyword boosts). This
 *     grounds the AI: it can ONLY choose among codes that exist in the table.
 *  2. LLM (optional, in the route): re-ranks the lexical candidates and adds
 *     confidence + reasoning. If the AI service is down, the lexical ranking
 *     is returned as-is — the feature never blocks on the SDK.
 *
 * The engine NEVER invents codes: every candidate comes from the provided
 * tariff rows. Confidence is a bounded score, not a probability claim.
 */

export interface TariffRow {
  code: string;
  description: string;
  chapter: string;
  cetRate: number;
  vatExempt?: boolean;
  notes?: string | null;
}

export interface ClassifiedCandidate {
  code: string;
  description: string;
  cetRate: number;
  vatExempt: boolean;
  score: number;          // 0-100 lexical/combined score
  reason?: string;        // LLM explanation (stage 2)
  source: 'lexical' | 'llm';
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'of', 'de', 'la', 'el', 'y', 'en', 'un', 'una',
  'other', 'otros', 'otro', 'otra', 'parts', 'used', 'new', 'para', 'con', 'del', 'los', 'las',
  'productos', 'product', 'general', 'various', 'kit', 'set', 'type', 'kind',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: distribución → distribucion
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t))
    .map(t => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t)); // crude plural fold: cars→car, tyres→tyre
}

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) out.add(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/** Normalized similarity between the description and a tariff row (0-100). */
export function lexicalScore(queryTokens: string[], queryBigrams: Set<string>, row: TariffRow): number {
  const rowText = `${row.code} ${row.description} ${row.notes ?? ''}`;
  const rowTokens = new Set(tokenize(rowText));
  if (rowTokens.size === 0 || queryTokens.length === 0) return 0;

  let hits = 0;
  let rareBonus = 0;
  for (const t of queryTokens) {
    if (rowTokens.has(t)) {
      hits++;
      // rarer tokens are stronger signals (e.g. "cemento" > "unit")
      rareBonus += t.length >= 6 ? 1.5 : 1;
    } else if (t.length > 4 && rowText.toLowerCase().includes(t.slice(0, t.length - 1))) {
      hits += 0.5; // crude stem match: "batteries" → "battery"
    }
  }
  const rowBigrams = bigrams([...rowTokens]);
  let biHits = 0;
  for (const b of queryBigrams) if (rowBigrams.has(b)) biHits += 2;

  const raw = hits + rareBonus * 0.3 + biHits;
  const maxPossible = queryTokens.length * 1.6 + (queryBigrams.size * 2) * 0.3 + queryTokens.length * 0.45;
  return Math.max(0, Math.min(100, Math.round((raw / Math.max(maxPossible, 1)) * 100)));
}

export interface ClassifyResult {
  candidates: ClassifiedCandidate[];
  engine: 'lexical' | 'llm+lexical';
  lexicalTokens: string[];
}

/** Stage 1 — rank the tariff table lexically and keep the top N. */
export function classifyLexical(description: string, table: TariffRow[], topN = 8): ClassifyResult {
  const tokens = tokenize(description);
  const qBigrams = bigrams(tokens);
  const scored = table
    .map(row => ({ row, score: lexicalScore(tokens, qBigrams, row) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return {
    candidates: scored.map(({ row, score }) => ({
      code: row.code,
      description: row.description,
      cetRate: row.cetRate,
      vatExempt: !!row.vatExempt,
      score,
      source: 'lexical' as const,
    })),
    engine: 'lexical',
    lexicalTokens: tokens,
  };
}

/** Build the compact prompt block the LLM must choose from (stage 2 helper). */
export function candidatesPromptBlock(candidates: ClassifiedCandidate[]): string {
  return candidates
    .map((c, i) => `${i + 1}. code=${c.code} | desc="${c.description}" | CET=${c.cetRate}%${c.vatExempt ? ' | VAT exempt' : ''}`)
    .join('\n');
}

export const HS_LLM_SYSTEM = `You are a Trinidad & Tobago customs tariff classifier (Cap 78:01, CARICOM CET).
You will receive a product description and a numbered list of CANDIDATE HS codes from the broker's tariff table.

Rules:
- Choose ONLY among the candidate codes — never invent a code that is not listed.
- If two codes are plausible, rank the more specific/better fit first.
- confidence: 0-100, your honest certainty. Below 40 means "verify with the broker".
- reason: ONE short sentence (max 160 chars) in the same language as the product description, explaining the fit.
- If NO candidate fits at all, return an empty rankings array — do not force a match.

Return ONLY JSON: {"rankings":[{"index":<1-based candidate number>,"confidence":<0-100>,"reason":"..."}]}
Give at most 5 rankings, best first.`;
