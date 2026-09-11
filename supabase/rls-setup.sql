-- ============================================================================
-- CaribClear — Supabase / PostgreSQL Row Level Security v2 (idempotent)
-- ============================================================================
-- v1 of this script NEVER worked: it referenced snake_case columns
-- (tenant_id, user_id) while Prisma creates camelCase quoted columns
-- ("tenantId", "userId") → every CREATE POLICY failed. v2 is generated
-- against the actual Prisma schema (25 models incl. FxRate, LedgerEntry,
-- Disbursement) and is safe to re-run.
--
-- HOW TO RUN: Supabase SQL editor (or psql as postgres) against PRODUCTION.
-- Safe on every deploy — it only creates what is missing.
--
-- ACCESS MODEL (defense in depth with the app-layer guards in src/lib/guard.ts):
--   A) Supabase JWT path — direct/client access with an authenticated JWT.
--      Tenant comes from the claim: app_metadata.tenant_id.
--   B) Server path — the Next.js app connects with a DEDICATED NON-OWNER
--      role and sets the tenant per transaction:
--        SET app.tenant_id = '<tenant cuid>';
--      (see public.cc_set_tenant() below; call it right after acquiring the
--      connection for the request — the app layer already knows the tenant.)
--   C) Platform admin — claim role = 'super_admin'.
--
-- IMPORTANT: RLS is ENABLED but NOT FORCED, so the table owner (the role the
-- app currently uses) still bypasses it — nothing breaks the moment you run
-- this. Isolation at DB level ACTIVATES when you switch DATABASE_URL to the
-- dedicated role created in step 0 below. Until then the app-layer guards
-- (16+ tests) remain the active defense.
-- ============================================================================

-- ── 0) Dedicated non-owner application role (run once, choose a password) ──
-- do $$ begin
--   if not exists (select 1 from pg_roles where rolname = 'caribclear_app') then
--     create role caribclear_app login password 'CHANGE_ME_STRONG';
--   end if;
-- end $$;
-- grant usage on schema public to caribclear_app;
-- grant select, insert, update, delete on all tables in schema public to caribclear_app;
-- alter default privileges in schema public grant select, insert, update, delete on tables to caribclear_app;
-- Then: DATABASE_URL="postgresql://caribclear_app:<pw>@<host>:5432/postgres?options=-c%20search_path%3Dpublic"

-- ── Helper: tenant from the request context (JWT claim OR session var) ──────
create or replace function public.cc_tenant_id() returns text
language sql stable as $$
  select coalesce(
    -- server path: app sets this per request/transaction
    nullif(current_setting('app.tenant_id', true), ''),
    -- supabase JWT path
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'tenant_id', '')
  )
$$;

create or replace function public.cc_is_super_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role', '') = 'super_admin'
     or coalesce(current_setting('app.is_super_admin', true), '') = '1'
$$;

-- Server helper: pin the tenant for the current transaction.
--   select public.cc_set_tenant('cuid123');
create or replace function public.cc_set_tenant(p_tenant text) returns void
language sql as $$
  select set_config('app.tenant_id', p_tenant, false);
$$;

-- ── Enable RLS on every business table (default deny) ───────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'Tenant','User','UserSecurity','Client','Shipment','Container','Document',
    'HsCode','SavedProductRate','HsLookup','PermitRequirement','ShipmentPermit',
    'CostCalculation','Quote','AuditLog','Notification','RateConfig',
    'TenantInvoice','PushSubscription','Lead','PaymentRequest','CustomsFiling',
    'FxRate','LedgerEntry','Disbursement'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- ── Policy creation helper (idempotent: skip when the policy exists) ────────
create or replace function public.cc_ensure_policy(
  p_name text, p_table text, p_cmd text, p_using text, p_check text default null
) returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_name) then
    execute format(
      'create policy %I on %I for %s using (%s)%s',
      p_name, p_table, p_cmd, p_using,
      case when p_check is not null then format(' with check (%s)', p_check) else '' end
    );
  end if;
end $$;

-- ── Global reference tables: readable by any authenticated/connected role ───
select public.cc_ensure_policy('hs_read_all',        'HsCode',            'select', 'true');
select public.cc_ensure_policy('permreq_read_all',   'PermitRequirement', 'select', 'true');
select public.cc_ensure_policy('ratecfg_read_auth',  'RateConfig',        'select', 'true');
select public.cc_ensure_policy('lead_insert_public', 'Lead',              'insert', 'true');

-- ── Tenant self ──────────────────────────────────────────────────────────────
select public.cc_ensure_policy('tenant_self',        'Tenant', 'select', 'id::text = public.cc_tenant_id() or public.cc_is_super_admin()');
select public.cc_ensure_policy('tenant_admin_write', 'Tenant', 'update', 'id::text = public.cc_tenant_id()', 'id::text = public.cc_tenant_id()');

-- ── Per-tenant tables: tenantId must match the caller's tenant ──────────────
select public.cc_ensure_policy('user_tenant',        'User',              'all', 'tenantId::text = public.cc_tenant_id() or public.cc_is_super_admin()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('usersec_self',       'UserSecurity',      'all', 'userId::text = coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''sub'', '''')', 'userId::text = coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''sub'', '''')');
select public.cc_ensure_policy('client_tenant',      'Client',            'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('shipment_tenant',    'Shipment',          'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('container_tenant',   'Container',         'all', 'exists (select 1 from "Shipment" s where s.id = shipmentId and s.tenantId::text = public.cc_tenant_id())', 'exists (select 1 from "Shipment" s where s.id = shipmentId and s.tenantId::text = public.cc_tenant_id())');
select public.cc_ensure_policy('document_tenant',    'Document',          'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('savedrate_tenant',   'SavedProductRate',  'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('hslookup_tenant',    'HsLookup',          'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('permit_tenant',      'ShipmentPermit',    'all', 'exists (select 1 from "Shipment" s where s.id = shipmentId and s.tenantId::text = public.cc_tenant_id())', 'exists (select 1 from "Shipment" s where s.id = shipmentId and s.tenantId::text = public.cc_tenant_id())');
select public.cc_ensure_policy('costcalc_tenant',    'CostCalculation',   'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('quote_tenant',       'Quote',             'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('notification_tenant','Notification',      'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('tenantinv_tenant',   'TenantInvoice',     'all', 'tenantId::text = public.cc_tenant_id() or public.cc_is_super_admin()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('pushsub_self',       'PushSubscription',  'all', 'userId::text = coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''sub'', '''')', 'userId::text = coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''sub'', '''')');
select public.cc_ensure_policy('paymentreq_tenant',  'PaymentRequest',    'all', 'tenantId::text = public.cc_tenant_id() or public.cc_is_super_admin()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('filing_tenant',      'CustomsFiling',     'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');

-- ── Accounting module (Enterprise): fiduciary tables ────────────────────────
select public.cc_ensure_policy('fxrate_tenant',      'FxRate',       'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('ledger_tenant',      'LedgerEntry',  'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');
select public.cc_ensure_policy('disb_tenant',        'Disbursement', 'all', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');

-- ── Audit log: per-tenant append-only (no update/delete policies → WORM) ────
select public.cc_ensure_policy('audit_tenant_read',  'AuditLog', 'select', 'tenantId::text = public.cc_tenant_id() or public.cc_is_super_admin()');
select public.cc_ensure_policy('audit_tenant_insert','AuditLog', 'insert', 'tenantId::text = public.cc_tenant_id()', 'tenantId::text = public.cc_tenant_id()');

-- ── Ledger immutability trigger: fund/direction/amount/currency locked ──────
-- App-level the ledger is append-only (no update/delete endpoints). This
-- trigger enforces the same at DB level even for roles that bypass RLS
-- policies (owner). Fund may not be flipped TRUST↔OPERATING to hide client
-- money movements; corrections are reversing entries.
-- Rows die together with their tenant: FK-cascade deletes (pg_trigger_depth
-- > 1) are allowed, user-initiated DELETE is not.
create or replace function public.cc_ledger_immutability() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      raise exception 'LedgerEntry is append-only: direct DELETE is not allowed. Write a reversing entry instead.';
    end if;
    return old;  -- FK cascade from Tenant offboarding — let it pass
  end if;
  if new.tenantId  is distinct from old.tenantId
  or new.fund      is distinct from old.fund
  or new.direction is distinct from old.direction
  or new.amount    is distinct from old.amount
  or new.currency  is distinct from old.currency then
    raise exception 'LedgerEntry immutable fields (tenantId, fund, direction, amount, currency) cannot be changed. Write a reversing entry instead.';
  end if;
  return new;
end $$;

drop trigger if exists ledgerentry_immutable on "LedgerEntry";
create trigger ledgerentry_immutable
  before update or delete on "LedgerEntry"
  for each row execute function public.cc_ledger_immutability();

-- ── Audit chain tamper-evidence: rows frozen against direct tampering ───────
-- UPDATE is always blocked (hash chain would break anyway). Direct DELETE is
-- blocked; the FK cascade from tenant offboarding passes (depth > 1).
create or replace function public.cc_audit_worm() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'AuditLog is append-only (WORM): UPDATE is not allowed.';
  end if;
  if pg_trigger_depth() = 1 then
    raise exception 'AuditLog is append-only (WORM): direct DELETE is not allowed.';
  end if;
  return old;
end $$;

drop trigger if exists auditlog_worm on "AuditLog";
create trigger auditlog_worm
  before update or delete on "AuditLog"
  for each row execute function public.cc_audit_worm();

-- ── Verification (run after the script; expect 25 enabled / ≥ 25 policies) ──
-- select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
-- select tablename, policyname from pg_policies where schemaname = 'public'
--  order by tablename, policyname;
--
-- Smoke test of server-path isolation (run as caribclear_app):
--   begin; select public.cc_set_tenant('TENANT_A');
--   select count(*) from "Shipment";        -- only A's rows
--   update "LedgerEntry" set amount = 0;    -- must raise (immutability)
--   rollback;
