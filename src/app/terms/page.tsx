import Link from 'next/link';

export const metadata = { title: 'Terms of Service — CaribClear' };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="text-sm text-teal-600 hover:underline">← CaribClear</Link>
        <h1 className="text-3xl font-bold mt-4">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: September 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="font-semibold text-lg text-foreground">1. The service</h2>
            <p className="mt-2">CaribClear is a multi-tenant software-as-a-service platform for managing foreign trade operations: shipment tracking, document custody, landed-cost calculation, permit checklists and client billing. Access is provided on a freemium basis (Free/Pro plans; plan limits are enforced via feature flags).</p>
          </section>
          <section>
            <h2 className="font-semibold text-lg text-foreground">2. You are not exempt from licensing</h2>
            <p className="mt-2"><strong className="text-foreground">CaribClear is a software tool, not a licensed customs agent or broker.</strong> Legal responsibility before the Trinidad &amp; Tobago Customs &amp; Excise Division — including the accuracy of declarations, classification and valuation — remains exclusively with the licensed broker of record and the importer. Tax and duty figures produced by the engine are reference estimates computed from versioned legal schedules; the operator must confirm the current Legal Notice / tariff before filing.</p>
          </section>
          <section>
            <h2 className="font-semibold text-lg text-foreground">3. Tax rate configuration</h2>
            <p className="mt-2">All rates (CET bands, Motor Vehicle Tax brackets, VAT 12.5%, customs fees) live in a versioned rate-configuration table with effective dates. When legislation changes, the configuration is updated — historical calculations keep the snapshot that was used, which is part of the audit trail.</p>
          </section>
          <section>
            <h2 className="font-semibold text-lg text-foreground">4. Acceptable use</h2>
            <p className="mt-2">Do not upload unlawful content, attempt to access other tenants&apos; data, or reverse-engineer the platform. Rate limits and bot protections are enforced on public endpoints. Accounts may be suspended for abuse (see Privacy Policy).</p>
          </section>
          <section>
            <h2 className="font-semibold text-lg text-foreground">5. Billing & plans</h2>
            <p className="mt-2">Free plan limits (1 user, 3 active shipments, basic vault) and Pro plan (unlimited) are enforced in real time. Upgrades are instant feature-flag flips; no data migration occurs. Payment processing (Stripe international; WiPay/PayWise local) integrates behind a payment abstraction layer in phase 2.</p>
          </section>
          <section>
            <h2 className="font-semibold text-lg text-foreground">6. Data & availability</h2>
            <p className="mt-2">Target availability 99.5% monthly. Backups and point-in-time recovery run on the managed database. The 5-year document retention aligns with Customs Act Chap. 78:01. This agreement is governed by the laws of Trinidad &amp; Tobago.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
