/**
 * CaribClear — ASYCUDA portal response simulator (test harness).
 *
 * Simulates everything a real ASYCUDA World portal (or the proxies,
 * load balancers and error pages in between) can throw at the CUSRES
 * recorder: valid acceptances, rejections, truncated responses, HTML error
 * pages, binary garbage, hostile XML (entity-expansion attacks), locale
 * variants and proxy JSON errors.
 *
 * The contract under test lives in src/lib/engine/asycuda.ts#parseCusres:
 *   1. NEVER crash on any input.
 *   2. NEVER invent a number — extraction is regex-on-exact-tags only;
 *      anything it cannot positively match comes back absent/undefined.
 *   3. Honest degradation: an unparseable response returns recognized:false
 *      so the operator records the response manually.
 */

export interface SimResult {
  name: string;
  description: string;
  payload: string;
  /** what a CORRECT parser must extract from this payload (reg no. etc.) */
  expect: {
    recognized?: boolean;
    registrationNumber?: string;
    assessmentNumber?: string;
    receiptNumber?: string;
    totalAssessed?: number;
    status?: string;
    /** max number of numeric fields that may appear — the "no invention" bound */
  };
}

const ok = (name: string, description: string, payload: string, expect: SimResult['expect']): SimResult =>
  ({ name, description, payload, expect });

// ── 1. Happy paths (real CUSRES shapes) ─────────────────────────────────────

export const SIM_REGISTRATION_TT = ok(
  'registration-tt',
  'T&T style acceptance: CUSRES assigns registration "C 427" on validation',
  `<?xml version="1.0" encoding="UTF-8"?>
<CUSRES xmlns="http://www.asycuda.org/CUSRES">
  <DeclarationHeader>
    <RegistrationNumber>C 427</RegistrationNumber>
    <RegistrationDate>2026-09-10</RegistrationDate>
    <Status>REGISTERED</Status>
  </DeclarationHeader>
</CUSRES>`,
  { recognized: true, registrationNumber: 'C 427', status: 'registered' },
);

export const SIM_ASSESSMENT = ok(
  'assessment',
  'Box B accounting: assessment number + total payable in national currency',
  `<?xml version="1.0"?>
<CUSRES>
  <AssessmentNumber>A-9911</AssessmentNumber>
  <TotalAssessment>158442.50</TotalAssessment>
  <Status>ASSESSED</Status>
</CUSRES>`,
  { recognized: true, assessmentNumber: 'A-9911', totalAssessed: 158442.5, status: 'assessed' },
);

export const SIM_PAYMENT = ok(
  'payment-receipt',
  'Payment acknowledged: receipt number → filing can be cleared',
  `<?xml version="1.0"?>
<CUSRES>
  <RegistrationNumber>C 427</RegistrationNumber>
  <ReceiptNumber>R-2026-77120</ReceiptNumber>
  <Status>CLEARED</Status>
</CUSRES>`,
  { recognized: true, receiptNumber: 'R-2026-77120', status: 'cleared' },
);

export const SIM_REGISTRATION_JM = ok(
  'registration-jm',
  'Jamaica variant: EntryNumber/EntryDate tag family',
  `<?xml version="1.0"?>
<CUSRES>
  <EntryNumber>E 8812</EntryNumber>
  <EntryDate>10/09/2026</EntryDate>
</CUSRES>`,
  { recognized: true, registrationNumber: 'E 8812' },
);

// ── 2. Rejection ────────────────────────────────────────────────────────────

export const SIM_REJECTION = ok(
  'rejection',
  'Portal rejects the declaration — must surface the status, invent NO numbers',
  `<?xml version="1.0"?>
<CUSRES>
  <Status>REJECTED</Status>
  <ReasonCode>B17</ReasonCode>
  <Reason>Consignee TIN not on file</Reason>
</CUSRES>`,
  { recognized: true, status: 'rejected' },
);

// ── 3. Network / infrastructure failures ───────────────────────────────────

export const SIM_TRUNCATED = ok(
  'network-truncation',
  'Connection died mid-response (half a tag) — the honest outcome is NOTHING: no half-invented numbers, operator records manually',
  `<?xml version="1.0"?>
<CUSRES>
  <RegistrationNumber>C 4
  <RegistrationDate>2026-09-`,
  { recognized: false },
);

export const SIM_HTML_503 = ok(
  'html-503',
  'Portal behind an error page — a load balancer spoke, not ASYCUDA',
  `<!DOCTYPE html>
<html lang="en"><head><title>503 Service Unavailable</title></head>
<body><h1>503 Service Unavailable</h1><p>The customs portal is temporarily unable to handle the request. TotalAmount 99999.</p></body></html>`,
  { recognized: false },
);

export const SIM_BINARY = ok(
  'binary-garbage',
  'Binary soup around ONE clean tag (e.g. a misrouted attachment mixed with CUSRES) — control bytes are stripped, the real number survives',
  String.fromCharCode(
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x01, 0x02, 0x03,
    0xff, 0xfe, 0xfd, 0xfc, 0x9c, 0x8e, 0x7f, 0x5a, 0xd1, 0x44, 0x33, 0x22,
  ) + ' \x7f\x1b[2J<CUSRES>\x00<RegistrationNumber>C 427</RegistrationNumber>\x00',
  { recognized: true, registrationNumber: 'C 427' },
);

export const SIM_XXE = ok(
  'hostile-xxe',
  'Entity-expansion + file-disclosure attack (billion laughs / /etc/passwd) — the parser never resolves entities, and since EVERY value is an entity the response yields NOTHING (no /etc/passwd content can ever reach the filing)',
  `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<CUSRES><RegistrationNumber>&xxe;</RegistrationNumber><Status>&lol3;</Status></CUSRES>`,
  { recognized: false },
);

export const SIM_FRENCH = ok(
  'french-tags',
  'Locale variant: French portal tags (some administrations localise) — parser does not recognise them and honestly returns unrecognized, operator records manually',
  `<?xml version="1.0"?>
<CUSRES>
  <NumeroEnregistrement>C 427</NumeroEnregistrement>
  <DateEnregistrement>2026-09-10</DateEnregistrement>
  <Statut>ENREGISTRE</Statut>
</CUSRES>`,
  { recognized: false },
);

export const SIM_EMPTY = ok(
  'empty-response',
  'Portal returned 200 with an empty body',
  '',
  { recognized: false },
);

export const SIM_WHITESPACE = ok(
  'whitespace-only',
  'Portal returned only whitespace',
  '   \n\t  \r\n',
  { recognized: false },
);

export const SIM_PROXY_JSON = ok(
  'proxy-json-error',
  'A gateway/proxy answered with JSON instead of the customs XML',
  `{"error": "gateway_timeout", "message": "upstream ASYCUDA node did not respond", "TotalAssessment": null}`,
  { recognized: false },
);

export const SIM_HUGE = ok(
  'huge-response',
  'Portal dumped a giant consolidated message (1 MB) with the answer buried in it',
  '<CUSRES>' + '<Noise><Filler>x</Filler></Noise>'.repeat(20_000) +
  '<RegistrationNumber>C 427</RegistrationNumber><TotalAssessment>1000</TotalAssessment>' +
  '</CUSRES>',
  { recognized: true, registrationNumber: 'C 427', totalAssessed: 1000 },
);

export const SIM_ATTRIBUTE_INJECTION = ok(
  'attribute-injection',
  'Numbers inside attributes/comments are NOT tag content — parser must not be fooled by lookalike text elsewhere',
  `<?xml version="1.0"?>
<!-- decoy: RegistrationNumber FAKE 999 -->
<CUSRES>
  <Note text="RegistrationNumber XX-1">See printed form</Note>
  <RegistrationNumber>C 427</RegistrationNumber>
</CUSRES>`,
  { recognized: true, registrationNumber: 'C 427' },
);

export const ALL_SCENARIOS: SimResult[] = [
  SIM_REGISTRATION_TT, SIM_ASSESSMENT, SIM_PAYMENT, SIM_REGISTRATION_JM,
  SIM_REJECTION, SIM_TRUNCATED, SIM_HTML_503, SIM_BINARY, SIM_XXE,
  SIM_FRENCH, SIM_EMPTY, SIM_WHITESPACE, SIM_PROXY_JSON, SIM_HUGE,
  SIM_ATTRIBUTE_INJECTION,
];
