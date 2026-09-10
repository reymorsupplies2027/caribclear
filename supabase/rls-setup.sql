-- ============================================================================
-- CaribClear — Supabase / PostgreSQL production setup
-- ============================================================================
-- Run this in the Supabase SQL editor (or via migration) when deploying the
-- production database. The sandbox/dev build uses SQLite + app-layer guards;
-- production MUST enable RLS so tenant isolation is enforced BY THE DATABASE.
--
-- Principle: default-deny. Every business table carries tenant_id; policies
-- allow access only when the row's tenant matches the caller's JWT claim
-- (app_metadata.tenant_id) or when the caller is the platform super_admin.
--
-- 1) Set the claim at sign-in (Supabase Auth hook or your session function):
--      app_metadata = { "tenant_id": "<tenant uuid>", "role": "broker_admin" }
--    super_admins get: app_metadata = { "role": "super_admin" }
--
-- 2) The Next.js app talks to Postgres with a service role for trusted
--    server-side flows; RLS protects direct/client access and any future
--    client-side usage. Defense in depth: app guards + RLS.
-- ============================================================================

-- ── Helper: current user's tenant from JWT ──────────────────────────────────
create or replace function public.cc_tenant_id() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id', '')
$$;

create or replace function public.cc_is_super_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role', '') = 'super_admin'
$$;

-- ── Enable RLS everywhere (default deny) ────────────────────────────────────
alter table "Tenant"             enable row level security;
alter table "User"               enable row level security;
alter table "UserSecurity"       enable row level security;
alter table "Client"             enable row level security;
alter table "Shipment"           enable row level security;
alter table "Container"          enable row level security;
alter table "Document"           enable row level security;
alter table "HsCode"             enable row level security;
alter table "SavedProductRate"   enable row level security;
alter table "HsLookup"           enable row level security;
alter table "PermitRequirement"  enable row level security;
alter table "ShipmentPermit"     enable row level security;
alter table "CostCalculation"    enable row level security;
alter table "Quote"              enable row level security;
alter table "AuditLog"           enable row level security;
alter table "Notification"       enable row level security;
alter table "RateConfig"         enable row level security;
alter table "TenantInvoice"      enable row level security;
alter table "CustomsFiling"      enable row level security;

-- ── Shared read tables (tariff + permit matrix: same for every tenant) ──────
create policy "hs_read_all"        on "HsCode"            for select using (true);
create policy "permreq_read_all"   on "PermitRequirement" for select using (true);
create policy "ratecfg_read_auth"  on "RateConfig"        for select using (auth.role() = 'authenticated');

-- ── Tenant-scoped tables ─────────────────────────────────────────────────────
create policy "tenant_self"        on "Tenant"            for select using (id::text = public.cc_tenant_id() or public.cc_is_super_admin());
create policy "tenant_admin_write" on "Tenant"            for update using (id::text = public.cc_tenant_id()) with check (id::text = public.cc_tenant_id());

create policy "user_tenant"        on "User"              for all using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "usersec_self"       on "UserSecurity"      for all using (user_id::text = auth.uid()::text) with check (user_id::text = auth.uid()::text);

create policy "client_tenant"      on "Client"            for all using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "shipment_tenant"    on "Shipment"          for all using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "container_tenant"   on "Container"         for all using (exists (select 1 from "Shipment" s where s.id = shipment_id and s.tenant_id::text = public.cc_tenant_id()))
                                                          with check (exists (select 1 from "Shipment" s where s.id = shipment_id and s.tenant_id::text = public.cc_tenant_id()));
create policy "document_tenant"    on "Document"          for all using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "savedrate_tenant"   on "SavedProductRate"  for all using (tenant_id::text = public.cc_tenant_id())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "hslookup_tenant"    on "HsLookup"          for all using (tenant_id::text = public.cc_tenant_id())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "shippermit_tenant"  on "ShipmentPermit"    for all using (exists (select 1 from "Shipment" s where s.id = shipment_id and s.tenant_id::text = public.cc_tenant_id()))
                                                          with check (exists (select 1 from "Shipment" s where s.id = shipment_id and s.tenant_id::text = public.cc_tenant_id()));
create policy "costcalc_tenant"    on "CostCalculation"   for all using (tenant_id::text = public.cc_tenant_id())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "quote_tenant"       on "Quote"             for all using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "audit_tenant_ro"    on "AuditLog"          for select using (tenant_id::text = public.cc_tenant_id() or public.cc_is_super_admin());
-- No insert/update/delete policies on AuditLog for tenants: append-only happens
-- via the trusted server (service role). Clients can read their own chain.
create policy "notification_tenant" on "Notification"     for all using (tenant_id::text = public.cc_tenant_id())
                                                          with check (tenant_id::text = public.cc_tenant_id());
create policy "tenantinvoice_admin" on "TenantInvoice"    for all using (public.cc_is_super_admin()) with check (public.cc_is_super_admin());
create policy "filing_tenant"      on "CustomsFiling"     for all using (tenant_id::text = public.cc_tenant_id())
                                                          with check (tenant_id::text = public.cc_tenant_id());

-- ── Immutability hard guard (defense against accidental UPDATE/DELETE) ──────
create or replace function public.cc_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'AuditLog is append-only (WORM). Blocked % on %', tg_op, tg_table_name;
end $$;

create trigger audit_worm_update before update on "AuditLog"
  for each row execute function public.cc_audit_immutable();
create trigger audit_worm_delete before delete on "AuditLog"
  for each row execute function public.cc_audit_immutable();

-- ── pg_cron: daily retention + SLA escalation pings (09:00/09:30 AST) ───────
-- select cron.schedule('cc-sla-escalation', '0 9 * * *', $$ select net.http_get('https://<your-app>/api/cron/sla-escalation') $$);
-- select cron.schedule('cc-retention',      '30 9 * * *', $$ select net.http_get('https://<your-app>/api/cron/retention') $$);
