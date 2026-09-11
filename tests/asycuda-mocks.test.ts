/**
 * CaribClear — ASYCUDA portal mock suite (parseCusres under fire).
 * Run: bun tests/asycuda-mocks.test.ts
 *
 * Contract under test (src/lib/engine/asycuda.ts#parseCusres):
 *   1. NEVER crashes — any payload produces a CusresResult.
 *   2. NEVER invents numbers — extraction is exact-tag regex; anything
 *      unsafe (entities, control bytes, markup) is dropped, not guessed.
 *   3. Honest degradation — unparseable → recognized:false → the ack route
 *      falls back to manual recording, never fabrication.
 * Plus: the filing state machine accepts only the real ASYCUDA flow even
 * when the portal "would say" otherwise.
 */
import { parseCusres, canTransition } from '../src/lib/engine/asycuda';
import {
  ALL_SCENARIOS, SIM_REGISTRATION_TT, SIM_ASSESSMENT, SIM_PAYMENT, SIM_REGISTRATION_JM,
  SIM_REJECTION, SIM_TRUNCATED, SIM_HTML_503, SIM_BINARY, SIM_XXE, SIM_FRENCH,
  SIM_EMPTY, SIM_WHITESPACE, SIM_PROXY_JSON, SIM_HUGE, SIM_ATTRIBUTE_INJECTION,
} from './mocks/asyportal-sim';

let passed = 0; let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}

console.log('\n── 1. Happy paths extract EXACTLY the portal numbers ──');
const r1 = parseCusres(SIM_REGISTRATION_TT.payload);
ok(r1.recognized && r1.registrationNumber === 'C 427', 'TT acceptance → "C 427" verbatim');
ok(r1.registrationDate === '2026-09-10', 'registration date normalized to ISO');
ok(r1.status === 'registered', 'status REGISTERED → registered');
const r2 = parseCusres(SIM_ASSESSMENT.payload);
ok(r2.assessmentNumber === 'A-9911' && r2.totalAssessed === 158442.5, 'assessment → number + total verbatim');
const r3 = parseCusres(SIM_PAYMENT.payload);
ok(r3.receiptNumber === 'R-2026-77120' && r3.status === 'cleared', 'payment receipt + cleared');
const r4 = parseCusres(SIM_REGISTRATION_JM.payload);
ok(r4.recognized && r4.registrationNumber === 'E 8812', 'JM EntryNumber variant → "E 8812"');

console.log('\n── 2. Rejection surfaces status, invents nothing ──');
const rj = parseCusres(SIM_REJECTION.payload);
ok(rj.recognized && rj.status === 'rejected', 'rejection status recognized');
ok(rj.registrationNumber === undefined && rj.totalAssessed === undefined, 'no numbers fabricated on a rejection');

console.log('\n── 3. Hostile / broken infrastructure: no crash, no invention ──');
const rt = parseCusres(SIM_TRUNCATED.payload);
ok(!rt.recognized && rt.registrationNumber === undefined, 'truncated response → NOTHING (no half number)');
const rh = parseCusres(SIM_HTML_503.payload);
ok(!rh.recognized, 'HTML 503 error page → not recognized (load balancer ≠ customs)');
ok(rh.totalAssessed === undefined, 'the "TotalAmount 99999" inside the HTML was NOT extracted');
const rb = parseCusres(SIM_BINARY.payload);
ok(rb.recognized && rb.registrationNumber === 'C 427', 'binary garbage around a clean tag → control bytes stripped, real number survives');
const rx = parseCusres(SIM_XXE.payload);
ok(!rx.recognized && rx.registrationNumber === undefined, 'XXE attack → entity values dropped: /etc/passwd can never reach the filing');
const rf = parseCusres(SIM_FRENCH.payload);
ok(!rf.recognized && rf.registrationNumber === undefined, 'French locale tags → honestly unrecognized (manual recording path)');
const rj2 = parseCusres(SIM_PROXY_JSON.payload);
ok(!rj2.recognized && rj2.totalAssessed === undefined, 'proxy JSON error → nothing extracted (null is not a number)');

console.log('\n── 4. Empty / degenerate ──');
ok(!parseCusres(SIM_EMPTY.payload).recognized, 'empty body → not recognized');
ok(!parseCusres(SIM_WHITESPACE.payload).recognized, 'whitespace body → not recognized');

console.log('\n── 5. Scale and decoys ──');
const rg = parseCusres(SIM_HUGE.payload);
ok(rg.recognized && rg.registrationNumber === 'C 427' && rg.totalAssessed === 1000, '1 MB consolidated message → real answer found, no timeout');
ok(rg.registrationNumber === 'C 427' && rg.totalAssessed === 1000, 'huge payload values verbatim');
const ra = parseCusres(SIM_ATTRIBUTE_INJECTION.payload);
ok(ra.recognized && ra.registrationNumber === 'C 427', 'attribute/comment decoys ignored — exact tag content only');
ok(!ra.registrationNumber || ra.registrationNumber !== 'XX-1', 'lookalike text in an attribute was NOT extracted');

console.log('\n── 6. Full sweep: every scenario returns a result, never throws ──');
let threw = false;
let allShapes = true;
for (const sc of ALL_SCENARIOS) {
  try {
    const r = parseCusres(sc.payload);
    if (typeof r.recognized !== 'boolean') allShapes = false;
  } catch { threw = true; }
}
ok(!threw, `parser never throws across ${ALL_SCENARIOS.length} scenarios`);
ok(allShapes, 'every response is a well-formed CusresResult');
// Re-run the whole sweep against concatenated chaos: all payloads at once.
try {
  const mega = parseCusres(ALL_SCENARIOS.map(s => s.payload).join('\n'));
  ok(typeof mega.recognized === 'boolean' && mega.registrationNumber === 'C 427', 'all payloads concatenated → still extracts only the first exact-tag number');
} catch { ok(false, 'all payloads concatenated → still extracts only the first exact-tag number'); }

console.log('\n── 7. The workflow stays legal even when the portal jumps ahead ──');
// The ack route derives the target status from what arrived; the state
// machine is the last line of defense against out-of-order CUSRES messages.
ok(canTransition('filed', 'registered'), 'filed → registered (normal acceptance)');
ok(!canTransition('filed', 'assessed'), 'filed → assessed BLOCKED (assessment cannot precede registration)');
ok(!canTransition('draft', 'registered'), 'draft → registered BLOCKED (not even filed yet)');
ok(!canTransition('rejected', 'cleared'), 'rejected → cleared BLOCKED (a rejection is not a payment)');
ok(canTransition('registered', 'assessed') && canTransition('assessed', 'cleared'), 'registered → assessed → cleared (the real chain)');

console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
if (failed > 0) process.exit(1);
