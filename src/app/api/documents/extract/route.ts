/**
 * CaribClear — AI Document Extractor (real OCR → structured trade data).
 *
 * Input (any of):
 *   - image (jpeg/png/webp ≤ 10MB): sent to the vision model as a data URL
 *   - pdf  (≤ 10MB): sent to the vision model as file_url (works for
 *     digital AND scanned PDFs — the model reads the rendered pages)
 *   - pasted text: structured directly (useful when the broker already has
 *     the PDF text layer copied)
 *
 * Output (zod-validated, numbers coerced): document type, supplier, invoice
 * number/date, currency, line items with quantity/unit price/line total,
 * subtotal/freight/insurance/total, and per-line HS-code hints when the
 * description allows it. The AI NEVER finalizes anything: results are
 * returned as a draft for broker review, and the action is audit-logged.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok, fail, guardError } from '@/lib/api';
import { requireTenant } from '@/lib/guard';
import { appendAuditLog } from '@/lib/audit';
import { checkRate, getIp } from '@/lib/rate-limit';
import { getAi, extractJson, VISION_MODEL } from '@/lib/ai';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LINES = 500;

const lineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
  lineTotal: z.number().nonnegative().nullable().optional(),
  hsHint: z.string().max(12).nullable().optional(),
});

const extractionSchema = z.object({
  documentType: z.enum(['commercial_invoice', 'packing_list', 'bill_of_lading', 'manifest', 'other']),
  supplier: z.string().max(200).nullable().optional(),
  importer: z.string().max(200).nullable().optional(),
  invoiceNumber: z.string().max(60).nullable().optional(),
  invoiceDate: z.string().max(20).nullable().optional(),
  currency: z.string().max(6).nullable().optional(),
  lines: z.array(lineSchema).max(MAX_LINES).default([]),
  subtotal: z.number().nonnegative().nullable().optional(),
  freight: z.number().nonnegative().nullable().optional(),
  insurance: z.number().nonnegative().nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  containers: z.array(z.string().max(20)).max(50).default([]),
  weightsKg: z.number().nonnegative().nullable().optional(),
});

export type Extraction = z.infer<typeof extractionSchema>;

const SYSTEM_PROMPT = `You are a customs documentation parser for Trinidad & Tobago brokers.
Extract structured data from the trade document provided (commercial invoice, packing list, bill of lading or manifest).

Rules:
- Return ONLY a JSON object, no prose, no markdown fences.
- Copy values EXACTLY as printed. Never invent, never estimate, never round.
- Numbers: plain JSON numbers (strip currency symbols and thousands separators: "1,250.50" → 1250.50).
- Dates: keep the printed format.
- currency: the ISO code if printed (USD, EUR, CNY...), else the symbol, else null.
- documentType: commercial_invoice | packing_list | bill_of_lading | manifest | other.
- lines: EVERY itemized line with a description (max 500 lines). quantity/unit/unitPrice/lineTotal only when printed.
- hsHint: only if the document itself prints an HS/tariff code for that line (6-10 digits, keep as string), else null.
- containers: container numbers printed on the document.
- weightsKg: total gross weight in KG when printed (convert lb → kg × 0.45359237 ONLY if the doc says lb).
- Missing fields → null (or [] for arrays). Empty document → all null with empty lines.

JSON shape:
{"documentType":"...","supplier":null,"importer":null,"invoiceNumber":null,"invoiceDate":null,"currency":null,"lines":[{"description":"","quantity":null,"unit":null,"unitPrice":null,"lineTotal":null,"hsHint":null}],"subtotal":null,"freight":null,"insurance":null,"total":null,"containers":[],"weightsKg":null}`;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

function buildUserContent(mimeType: string, dataBase64: string): Array<{ type: string } & Record<string, unknown>> {
  if (mimeType === 'application/pdf') {
    return [
      { type: 'text', text: 'Extract the trade document data as JSON per the system rules.' },
      { type: 'file_url', file_url: { url: `data:application/pdf;base64,${dataBase64}` } },
    ];
  }
  return [
    { type: 'text', text: 'Extract the trade document data as JSON per the system rules.' },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${dataBase64}` } },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireTenant(req);

    // Rate limit: AI is expensive — 10 extractions / minute / IP
    const rl = checkRate(`ai-extract:${getIp(req)}`, 10, 60_000);
    if (rl.limited) return fail(429, 'RATE_LIMITED', `Too many extractions. Retry in ${rl.retryAfter}s.`);

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 60_000) : '';
    const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';

    if (!text && !dataBase64) {
      return fail(400, 'NO_INPUT', 'Provide document text or a base64 file (image/PDF).');
    }
    if (!text && dataBase64) {
      if (mimeType !== 'application/pdf' && !IMAGE_MIMES.includes(mimeType)) {
        return fail(415, 'UNSUPPORTED_TYPE', `mimeType must be application/pdf or ${IMAGE_MIMES.join(', ')}.`);
      }
      const bytes = Buffer.byteLength(dataBase64, 'base64');
      if (bytes === 0) return fail(400, 'EMPTY_FILE', 'dataBase64 is not valid base64.');
      if (bytes > MAX_BYTES) return fail(413, 'TOO_LARGE', 'File exceeds the 10MB limit.');
    }

    const ai = await getAi();
    if (!ai) {
      return fail(503, 'AI_UNAVAILABLE', 'AI service is not configured on this deployment. Use manual entry or paste the document text once configured.');
    }

    let raw = '';
    if (text) {
      const completion = await ai.chat.completions.create({
        model: 'glm-4.6',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Document text:\n\n${text}` },
        ],
        thinking: { type: 'disabled' },
      });
      raw = completion?.choices?.[0]?.message?.content ?? '';
    } else {
      const completion = await ai.chat.completions.createVision({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserContent(mimeType, dataBase64) as never },
        ],
      });
      raw = completion?.choices?.[0]?.message?.content ?? '';
    }

    let parsed = extractJson<unknown>(raw);
    if (!parsed) {
      // One strict retry — models occasionally prepend prose
      const retry = text
        ? await ai.chat.completions.create({
            model: 'glm-4.6',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Document text:\n\n${text}\n\nRespond with the JSON object ONLY.` },
            ],
            thinking: { type: 'disabled' },
          })
        : await ai.chat.completions.createVision({
            model: VISION_MODEL,
            messages: [
              { role: 'system', content: `${SYSTEM_PROMPT}\nRespond with the JSON object ONLY — no prose at all.` },
              { role: 'user', content: buildUserContent(mimeType, dataBase64) as never },
            ],
          });
      raw = retry?.choices?.[0]?.message?.content ?? '';
      parsed = extractJson<unknown>(raw);
    }
    if (!parsed) return fail(422, 'EXTRACTION_FAILED', 'The document could not be parsed into structured data. Try a clearer image or paste the text.');

    const check = extractionSchema.safeParse(parsed);
    if (!check.success) {
      return fail(422, 'VALIDATION_FAILED', 'Extraction returned an unexpected shape.');
    }
    const extraction = check.data;

    await appendAuditLog({
      tenantId: s.tenantId, userId: s.userId, action: 'document.ai_extracted',
      entityType: 'document', entityId: null,
      metadata: {
        source: text ? 'text' : mimeType,
        documentType: extraction.documentType,
        lines: extraction.lines.length,
        total: extraction.total ?? null,
      },
    });

    return ok({
      extraction,
      meta: {
        model: text ? 'glm-4.6' : VISION_MODEL,
        source: text ? 'text' : mimeType,
        lineCount: extraction.lines.length,
        reviewed: false, // always a draft until a human confirms
      },
    });
  } catch (err) {
    if (err instanceof Error && /status 4\d\d/.test(err.message)) {
      return fail(502, 'AI_ERROR', 'The AI service rejected this document. Try a smaller/clearer file.');
    }
    return guardError(err);
  }
}
