import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — CaribClear' };

const SECTIONS = [
  { h: '1. What we collect', p: 'Account data (name, business email), tenant operational data you enter (shipments, documents, clients, cost calculations) and minimal technical logs required to run the service. We never sell data. The importer client portal only exposes the shipments and documents belonging to that client — tenant isolation is enforced at the application layer and in the database (row-level security when deployed on Supabase).' },
  { h: '2. Where data lives', p: 'The production deployment targets Supabase PostgreSQL hosted in AWS us-east-1 with encryption at rest and PITR backups. Trinidad & Tobago\u2019s Data Protection Act 2011 (partially proclaimed) does not mandate local residency; for clients in Jamaica or Barbados we offer contractual safeguards (DPA) on request.' },
  { h: '3. Documents & retention', p: 'Documents uploaded to the vault are retained per the tenant\u2019s retention policy (default 5 years) aligned with the Customs Act Chap. 78:01 record-keeping obligation. After the retention window, a scheduled purge job removes expired business data; the immutable audit trail is retained as required by law.' },
  { h: '4. Your rights (GDPR-lite)', p: 'From Settings → Your data, a broker admin can export a full JSON snapshot of the tenant\u2019s data at any time. Deletion requests can be sent to support: business data is purged, while legally required audit records are retained and anonymized from personal identifiers.' },
  { h: '5. Cookies', p: 'We use a single strictly-necessary, HttpOnly session cookie (cc-session) for authentication. No advertising or third-party tracking cookies are used.' },
  { h: '6. Contact', p: 'Privacy questions: privacy@caribclear.app — DPA requests for Jamaica/Barbados clients: legal@caribclear.app.' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="text-sm text-teal-600 hover:underline">← CaribClear</Link>
        <h1 className="text-3xl font-bold mt-4">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: September 2026</p>
        <div className="mt-8 space-y-6">
          {SECTIONS.map(s => (
            <section key={s.h}>
              <h2 className="font-semibold text-lg">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
