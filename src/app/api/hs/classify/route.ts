/**
 * CaribClear — AI HS Classifier route (POST /api/hs/classify).
 *
 * Stage 1 (always): lexical ranking of the tenant's REAL HsCode table.
 * Stage 2 (when the AI service is up): LLM re-ranks the lexical candidates
 * under a strict "choose only from the list" contract, adds confidence and a
 * one-line reason. Every answer is recorded in HsLookup for the audit trail
 * and future calibration. If the AI is down the lexical ranking is returned
 * unchanged — the feature degrades, it never fabricates.
 */
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { checkRate, getIp } from '@/lib/rate-limit';
import { getAi, extractJson, TEXT_MODEL } from '@/lib/ai';
import {
  classifyLexical, candidatesPromptBlock, HS_LLM_SYSTEM,
  type ClassifiedCandidate, type TariffRow,
} from '@/lib/engine/hs-classify';

export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);
    const rl = checkRate(`hs-classify:${getIp(req)}`, 20, 60_000);
    if (rl.limited) return fail(429, 'RATE_LIMITED', `Too many classifications. Retry in ${rl.retryAfter}s.`);

    const body = await req.json().catch(() => ({}));
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length < 3) return fail(400, 'BAD_DESCRIPTION', 'Describe the product (min 3 characters).');
    if (description.length > 500) return fail(400, 'BAD_DESCRIPTION', 'Description too long (max 500 characters).');

    // The REAL tariff table — candidates can only come from here
    const rows = await db.hsCode.findMany({
      select: { code: true, description: true, chapter: true, cetRate: true, vatExempt: true, notes: true },
    });
    if (rows.length === 0) return fail(404, 'EMPTY_TARIFF', 'The tariff table is empty. Import codes first.');

    const table: TariffRow[] = rows;
    const lexical = classifyLexical(description, table, 8);

    let candidates: ClassifiedCandidate[] = lexical.candidates;
    let engine: 'lexical' | 'llm+lexical' = 'lexical';
    let fallbackFullTable = false;

    // Cross-language rescue: the lexical stage only matches same-language tokens.
    // When it finds nothing and the AI is up, the LLM sees the whole (capped)
    // table — e.g. "queso cheddar" → 0406 "Cheese and curd".
    if (candidates.length === 0) {
      const aiProbe = await getAi();
      if (aiProbe) {
        candidates = table.slice(0, 40).map(r => ({
          code: r.code, description: r.description, cetRate: r.cetRate,
          vatExempt: !!r.vatExempt, score: 0, source: 'lexical' as const,
        }));
        fallbackFullTable = true;
      }
    }

    if (candidates.length > 0) {
      const ai = await getAi();
      if (ai) {
        try {
          const completion = await ai.chat.completions.create({
            model: TEXT_MODEL,
            messages: [
              { role: 'system', content: HS_LLM_SYSTEM },
              { role: 'user', content: `Product: "${description}"\n\nCandidates:\n${candidatesPromptBlock(candidates)}` },
            ],
            thinking: { type: 'disabled' },
          });
          const raw = completion?.choices?.[0]?.message?.content ?? '';
          const parsed = extractJson<{ rankings?: Array<{ index: number; confidence: number; reason: string }> }>(raw);
          const rankings = parsed?.rankings;
          if (Array.isArray(rankings) && rankings.length > 0) {
            const enriched: ClassifiedCandidate[] = [];
            for (const r of rankings.slice(0, 5)) {
              const idx = Number(r.index);
              if (!Number.isInteger(idx) || idx < 1 || idx > candidates.length) continue;
              const c = candidates[idx - 1];
              const confidence = Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0)));
              enriched.push({
                ...c,
                score: confidence,
                reason: String(r.reason ?? '').slice(0, 200),
                source: 'llm',
              });
            }
            // Dedup by code (keep best rank); in fallback mode drop score-0 noise rows
            const seen = new Set(enriched.map(e => e.code));
            if (!fallbackFullTable) {
              for (const c of candidates) if (!seen.has(c.code)) { enriched.push(c); seen.add(c.code); }
            }
            candidates = enriched.filter(c => c.source === 'llm' || c.score > 0);
            engine = 'llm+lexical';
          } else if (fallbackFullTable) {
            candidates = []; // LLM found nothing in the whole table — honest empty result
          }
        } catch {
          // AI hiccup → lexical result stands (already real and ranked)
        }
      }
    }

    await db.hsLookup.create({
      data: {
        tenantId: s.tenantId,
        userId: s.userId,
        query: description.slice(0, 120),
        hsCode: candidates[0]?.code ?? null,
      },
    }).catch(() => null);

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'hs.classified',
      entityType: 'hs_code', entityId: candidates[0]?.code ?? null,
      metadata: { engine, top: candidates[0]?.code ?? null, description: description.slice(0, 120) },
    });

    return ok({
      candidates: candidates.slice(0, 8),
      engine,
      tariffRows: table.length,
      disclaimer: candidates[0] && candidates[0].score < 40
        ? 'Low confidence — verify this classification with the broker of record before declaring.'
        : 'AI suggestion — the broker of record confirms the final classification.',
    });
  } catch (err) { return guardError(err); }
}
