-- AYNI · Migración aditiva 03: Modelo reajustado MVP (organizaciones, catálogo, órdenes,
-- solicitudes, ofertas bancarias, créditos vinculados, cronogramas, reportes/confirmaciones,
-- reversos, consentimientos, comisiones separadas, soporte y auditoría de dominio).
-- NO re-ejecutar 01_schema.sql. Esta migración conserva profiles, user_audit y usuarios existentes.

begin;

-- =========================================================
-- 1. TIPOS ENUMERADOS DEL DOMINIO
-- =========================================================
create type public.organization_type as enum ('comercio', 'entidad_financiera');
create type public.organization_status as enum ('activa', 'inactiva', 'suspendida');
create type public.org_member_role as enum ('admin_org', 'operador', 'evaluador', 'tesoreria');
create type public.membership_status as enum ('activa', 'inactiva');

create type public.order_status as enum (
  'creada',
  'pendiente_financiamiento',
  'financiada',
  'pendiente_entrega',
  'entregada',
  'cancelada',
  'devolucion_en_proceso',
  'devuelta'
);

create type public.application_status as enum (
  'borrador',
  'enviada',
  'en_revision_bancaria',
  'requiere_informacion',
  'rechazada',
  'oferta_emitida',
  'cancelada'
);

create type public.offer_status as enum (
  'vigente',
  'aceptada',
  'rechazada_por_cliente',
  'vencida',
  'sustituida'
);

create type public.credit_status as enum (
  'pendiente_formalizacion',
  'formalizado',
  'desembolsado',
  'cancelado',
  'cerrado'
);

create type public.installment_status as enum (
  'pendiente',
  'parcial',
  'pagada',
  'atrasada',
  'pendiente_informacion'
);

create type public.payment_report_status as enum (
  'pendiente_verificacion',
  'vinculado_confirmacion',
  'observado',
  'rechazado'
);

create type public.payment_event_type as enum ('confirmacion', 'reverso');
create type public.consent_status as enum ('vigente', 'revocado', 'vencido');
create type public.commission_calc_type as enum ('fija', 'porcentaje');
create type public.commission_status as enum ('pendiente_condicion', 'devengada', 'anulada', 'liquidada');
create type public.support_status as enum ('abierto', 'en_proceso', 'resuelto', 'cerrado');

-- =========================================================
-- 2. TABLAS DEL DOMINIO
-- =========================================================

-- Organizaciones (comercios y entidades financieras aisladas)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  org_type public.organization_type not null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  tax_id text not null default '' check (char_length(tax_id) <= 40),
  contact_email text not null default '' check (char_length(contact_email) <= 254),
  contact_phone text not null default '' check (char_length(contact_phone) <= 25),
  status public.organization_status not null default 'activa',
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.org_member_role not null default 'operador',
  status public.membership_status not null default 'activa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

-- Auditoría inmutable de acciones del dominio
create table public.domain_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Catálogo de productos por comercio
create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 140),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default 'General' check (char_length(category) <= 60),
  price_minor bigint not null check (price_minor > 0),
  currency char(3) not null default 'BOB' check (currency ~ '^[A-Z]{3}$'),
  stock integer not null default 0 check (stock >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Órdenes de compra e ítems con copia inmutable de precio/descripción
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  client_id uuid not null references public.profiles(id),
  client_name_snapshot text not null,
  merchant_org_id uuid not null references public.organizations(id),
  status public.order_status not null default 'creada',
  currency char(3) not null default 'BOB',
  total_minor bigint not null check (total_minor > 0),
  delivery_notes text not null default '',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  product_description_snapshot text not null default '',
  unit_price_minor bigint not null check (unit_price_minor > 0),
  quantity integer not null check (quantity > 0),
  subtotal_minor bigint not null check (subtotal_minor > 0)
);

-- Solicitudes de financiamiento dirigidas a una entidad financiera concreta
create table public.financing_applications (
  id uuid primary key default gen_random_uuid(),
  application_code text not null unique,
  order_id uuid not null references public.purchase_orders(id),
  client_id uuid not null references public.profiles(id),
  client_name_snapshot text not null,
  bank_org_id uuid not null references public.organizations(id),
  requested_amount_minor bigint not null check (requested_amount_minor > 0),
  currency char(3) not null default 'BOB',
  requested_installments integer not null check (requested_installments between 1 and 60),
  client_notes text not null default '' check (char_length(client_notes) <= 1000),
  status public.application_status not null default 'enviada',
  bank_notes text not null default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  from_status public.application_status,
  to_status public.application_status not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- Ofertas bancarias versionadas con vigencia
create table public.financing_offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.financing_applications(id) on delete cascade,
  bank_org_id uuid not null references public.organizations(id),
  version_number integer not null check (version_number >= 1),
  principal_minor bigint not null check (principal_minor > 0),
  total_payable_minor bigint not null check (total_payable_minor >= principal_minor),
  currency char(3) not null default 'BOB',
  installment_count integer not null check (installment_count between 1 and 60),
  installment_amount_minor bigint not null check (installment_amount_minor > 0),
  annual_rate_bps integer not null default 0 check (annual_rate_bps >= 0),
  conditions_text text not null default '',
  expires_at timestamptz not null,
  status public.offer_status not null default 'vigente',
  is_demo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (application_id, version_number)
);

-- Evidencia de aceptación (vinculada al procedimiento del banco, no sustituye contrato bancario)
create table public.offer_acceptances (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.financing_offers(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  acceptance_note text not null default '',
  bank_procedure_ref text not null default 'PENDIENTE_FORMALIZACION_BANCARIA',
  accepted_at timestamptz not null default now()
);

-- Créditos vinculados otorgados por el banco
create table public.linked_credits (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.financing_applications(id),
  offer_id uuid not null unique references public.financing_offers(id),
  order_id uuid not null references public.purchase_orders(id),
  client_id uuid not null references public.profiles(id),
  bank_org_id uuid not null references public.organizations(id),
  external_credit_ref text,
  currency char(3) not null default 'BOB',
  principal_minor bigint not null check (principal_minor > 0),
  total_payable_minor bigint not null check (total_payable_minor >= principal_minor),
  status public.credit_status not null default 'pendiente_formalizacion',
  formalized_at timestamptz,
  disbursed_at timestamptz,
  closed_at timestamptz,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_org_id, external_credit_ref)
);

-- Confirmaciones de desembolso del banco (idempotentes)
create table public.disbursement_confirmations (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.linked_credits(id),
  order_id uuid not null references public.purchase_orders(id),
  bank_org_id uuid not null references public.organizations(id),
  external_event_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'BOB',
  recipient_type text not null default 'comercio' check (recipient_type in ('comercio', 'cliente', 'acordado')),
  disbursed_at timestamptz not null,
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (bank_org_id, external_event_id)
);

-- Versiones de cronograma bancario (conserva historial y última sincronización)
create table public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.linked_credits(id) on delete cascade,
  bank_org_id uuid not null references public.organizations(id),
  version_number integer not null check (version_number >= 1),
  source_label text not null default 'Cronograma bancario (simulación demo)',
  is_current boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (credit_id, version_number)
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  schedule_version_id uuid not null references public.schedule_versions(id) on delete cascade,
  credit_id uuid not null references public.linked_credits(id) on delete cascade,
  installment_number integer not null check (installment_number >= 1),
  due_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  paid_minor bigint not null default 0 check (paid_minor >= 0),
  currency char(3) not null default 'BOB',
  status public.installment_status not null default 'pendiente',
  paid_at timestamptz,
  last_confirmed_at timestamptz,
  unique (schedule_version_id, installment_number)
);

-- Confirmaciones bancarias de pago y reversos (idempotentes, nunca se borran)
create table public.bank_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.linked_credits(id),
  bank_org_id uuid not null references public.organizations(id),
  client_id uuid not null references public.profiles(id),
  external_event_id text not null,
  event_type public.payment_event_type not null default 'confirmacion',
  reversal_of_id uuid references public.bank_payment_confirmations(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'BOB',
  operation_date timestamptz not null,
  received_at timestamptz not null default now(),
  source_channel text not null default 'panel_bancario_simulado',
  notes text not null default '',
  confirmed_by uuid references public.profiles(id),
  unique (bank_org_id, external_event_id)
);

create unique index bank_payment_confirmations_single_reversal
  on public.bank_payment_confirmations(reversal_of_id)
  where reversal_of_id is not null;

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.bank_payment_confirmations(id) on delete cascade,
  installment_id uuid not null references public.installments(id),
  amount_minor bigint not null check (amount_minor > 0)
);

-- Reportes de pago del cliente (NUNCA marcan cuotas como pagadas por sí solos)
create table public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.linked_credits(id),
  installment_id uuid references public.installments(id),
  client_id uuid not null references public.profiles(id),
  bank_org_id uuid not null references public.organizations(id),
  reported_amount_minor bigint not null check (reported_amount_minor > 0),
  currency char(3) not null default 'BOB',
  payment_date date not null,
  reference_code text not null default '' check (char_length(reference_code) <= 80),
  notes text not null default '' check (char_length(notes) <= 500),
  status public.payment_report_status not null default 'pendiente_verificacion',
  linked_confirmation_id uuid references public.bank_payment_confirmations(id),
  review_notes text not null default '',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Consentimientos versionados y auditoría de acceso a datos sensibles
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  target_org_id uuid not null references public.organizations(id),
  purpose text not null check (purpose in ('evaluacion_solicitud', 'consulta_cumplimiento_nueva_oportunidad')),
  data_categories text[] not null default array['identificacion_basica', 'indicadores_cumplimiento'],
  text_version text not null default 'v1.0-demo',
  status public.consent_status not null default 'vigente',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table public.data_access_audit (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles(id),
  accessed_by_profile_id uuid not null references public.profiles(id),
  accessor_org_id uuid references public.organizations(id),
  consent_id uuid references public.consents(id),
  purpose text not null,
  created_at timestamptz not null default now()
);

-- Comisiones propias de AYNI (separadas del flujo de cuotas del cliente)
create table public.commission_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version_label text not null default 'v1-demo',
  service_description text not null default 'Servicio tecnológico y captación por financiamiento concretado (parámetro ficticio demo)',
  trigger_event text not null default 'desembolso_confirmado' check (trigger_event in ('desembolso_confirmado')),
  calc_type public.commission_calc_type not null default 'porcentaje',
  fixed_minor bigint not null default 0 check (fixed_minor >= 0),
  rate_bps integer not null default 200 check (rate_bps between 0 and 5000),
  currency char(3) not null default 'BOB',
  is_demo boolean not null default true,
  status text not null default 'activo' check (status in ('activo', 'inactivo')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.commission_agreements(id),
  organization_id uuid not null references public.organizations(id),
  credit_id uuid not null references public.linked_credits(id),
  source_disbursement_id uuid not null references public.disbursement_confirmations(id),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  commission_minor bigint not null check (commission_minor >= 0),
  currency char(3) not null default 'BOB',
  status public.commission_status not null default 'devengada',
  settlement_ref text not null default '',
  notes text not null default '',
  accrued_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (agreement_id, source_disbursement_id)
);

-- Casos de soporte e incidencias técnicas
create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id),
  related_credit_id uuid references public.linked_credits(id),
  related_order_id uuid references public.purchase_orders(id),
  category text not null check (category in ('tecnico', 'entrega_comercial', 'credito_pagos', 'datos_consentimiento')),
  subject text not null check (char_length(trim(subject)) between 3 and 140),
  description text not null check (char_length(trim(description)) between 5 and 1500),
  status public.support_status not null default 'abierto',
  resolution_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices clave
create index idx_org_members_profile on public.organization_members(profile_id, status);
create index idx_products_merchant on public.products(merchant_org_id, is_available);
create index idx_orders_client on public.purchase_orders(client_id, created_at desc);
create index idx_orders_merchant on public.purchase_orders(merchant_org_id, created_at desc);
create index idx_apps_bank on public.financing_applications(bank_org_id, status, submitted_at desc);
create index idx_apps_client on public.financing_applications(client_id, submitted_at desc);
create index idx_credits_bank on public.linked_credits(bank_org_id, status);
create index idx_credits_client on public.linked_credits(client_id, status);
create index idx_installments_credit on public.installments(credit_id, due_date);
create index idx_reports_bank on public.payment_reports(bank_org_id, status);
create index idx_consents_client_target on public.consents(client_id, target_org_id, status);

-- =========================================================
-- 3. FUNCIONES HELPER DE AUTORIZACIÓN (SIN RECURSIÓN RLS)
-- =========================================================

create function public.is_org_member(
  p_org_id uuid,
  p_org_type public.organization_type default null
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_org_id
      and m.profile_id = (select auth.uid())
      and m.status = 'activa'
      and o.status = 'activa'
      and p.status = 'activo'
      and (p_org_type is null or o.org_type = p_org_type)
      and (
        (o.org_type = 'comercio' and p.role = 'comercio')
        or (o.org_type = 'entidad_financiera' and p.role = 'entidad_financiera')
      )
  );
$$;

create function public.is_bank_member_of_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.financing_applications a
    where a.order_id = p_order_id
      and public.is_org_member(a.bank_org_id, 'entidad_financiera')
  );
$$;

create function public.is_merchant_of_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.purchase_orders o
    where o.id = p_order_id
      and public.is_org_member(o.merchant_org_id, 'comercio')
  );
$$;

create function public.is_client_of_order(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.purchase_orders o
    where o.id = p_order_id
      and o.client_id = (select auth.uid())
  );
$$;

create function public.is_owner_or_bank_of_credit(p_credit_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.linked_credits c
    where c.id = p_credit_id
      and (
        c.client_id = (select auth.uid())
        or public.is_org_member(c.bank_org_id, 'entidad_financiera')
        or public.is_admin()
      )
  );
$$;

revoke all on function public.is_org_member(uuid, public.organization_type) from public, anon;
revoke all on function public.is_bank_member_of_order(uuid) from public, anon;
revoke all on function public.is_merchant_of_order(uuid) from public, anon;
revoke all on function public.is_client_of_order(uuid) from public, anon;
revoke all on function public.is_owner_or_bank_of_credit(uuid) from public, anon;

grant execute on function public.is_org_member(uuid, public.organization_type) to authenticated;
grant execute on function public.is_bank_member_of_order(uuid) to authenticated;
grant execute on function public.is_merchant_of_order(uuid) to authenticated;
grant execute on function public.is_client_of_order(uuid) to authenticated;
grant execute on function public.is_owner_or_bank_of_credit(uuid) to authenticated;

-- =========================================================
-- 4. RLS Y PRIVILEGIOS ESTRICTOS POR TABLA
-- =========================================================

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.domain_audit enable row level security;
alter table public.products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.financing_applications enable row level security;
alter table public.application_events enable row level security;
alter table public.financing_offers enable row level security;
alter table public.offer_acceptances enable row level security;
alter table public.linked_credits enable row level security;
alter table public.disbursement_confirmations enable row level security;
alter table public.schedule_versions enable row level security;
alter table public.installments enable row level security;
alter table public.bank_payment_confirmations enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_reports enable row level security;
alter table public.consents enable row level security;
alter table public.data_access_audit enable row level security;
alter table public.commission_agreements enable row level security;
alter table public.commission_entries enable row level security;
alter table public.support_cases enable row level security;

-- Revocar acceso global y conceder solo lectura filtrada por RLS (escrituras vía RPC o RLS controlado)
revoke all on
  public.organizations,
  public.organization_members,
  public.domain_audit,
  public.products,
  public.purchase_orders,
  public.purchase_order_items,
  public.financing_applications,
  public.application_events,
  public.financing_offers,
  public.offer_acceptances,
  public.linked_credits,
  public.disbursement_confirmations,
  public.schedule_versions,
  public.installments,
  public.bank_payment_confirmations,
  public.payment_allocations,
  public.payment_reports,
  public.consents,
  public.data_access_audit,
  public.commission_agreements,
  public.commission_entries,
  public.support_cases
from anon, authenticated;

grant select on
  public.organizations,
  public.organization_members,
  public.domain_audit,
  public.products,
  public.purchase_orders,
  public.purchase_order_items,
  public.financing_applications,
  public.application_events,
  public.financing_offers,
  public.offer_acceptances,
  public.linked_credits,
  public.disbursement_confirmations,
  public.schedule_versions,
  public.installments,
  public.bank_payment_confirmations,
  public.payment_allocations,
  public.payment_reports,
  public.consents,
  public.data_access_audit,
  public.commission_agreements,
  public.commission_entries,
  public.support_cases
to authenticated;

-- Escritura directa controlada solo en catálogo (comercio propio) y casos de soporte
grant insert, update on public.products to authenticated;
grant insert, update on public.support_cases to authenticated;

-- Políticas RLS
create policy orgs_read on public.organizations
  for select to authenticated
  using ((status = 'activa' and public.is_active()) or public.is_admin() or public.is_org_member(id));

create policy org_members_read on public.organization_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.is_admin()
    or public.is_org_member(organization_id)
  );

create policy domain_audit_read on public.domain_audit
  for select to authenticated
  using (public.is_admin());

create policy products_read on public.products
  for select to authenticated
  using (
    (is_available = true and public.is_active())
    or public.is_org_member(merchant_org_id, 'comercio')
    or public.is_admin()
  );

create policy products_merchant_insert on public.products
  for insert to authenticated
  with check (public.is_org_member(merchant_org_id, 'comercio'));

create policy products_merchant_update on public.products
  for update to authenticated
  using (public.is_org_member(merchant_org_id, 'comercio'))
  with check (public.is_org_member(merchant_org_id, 'comercio'));

create policy orders_read on public.purchase_orders
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(merchant_org_id, 'comercio')
    or public.is_bank_member_of_order(id)
    or public.is_admin()
  );

create policy order_items_read on public.purchase_order_items
  for select to authenticated
  using (
    public.is_client_of_order(order_id)
    or public.is_merchant_of_order(order_id)
    or public.is_bank_member_of_order(order_id)
    or public.is_admin()
  );

create policy applications_read on public.financing_applications
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_admin()
  );

create policy app_events_read on public.application_events
  for select to authenticated
  using (
    exists (
      select 1 from public.financing_applications a
      where a.id = application_id
        and (
          a.client_id = (select auth.uid())
          or public.is_org_member(a.bank_org_id, 'entidad_financiera')
          or public.is_admin()
        )
    )
  );

create policy offers_read on public.financing_offers
  for select to authenticated
  using (
    public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_admin()
    or exists (
      select 1 from public.financing_applications a
      where a.id = application_id and a.client_id = (select auth.uid())
    )
  );

create policy acceptances_read on public.offer_acceptances
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.financing_offers f
      where f.id = offer_id and public.is_org_member(f.bank_org_id, 'entidad_financiera')
    )
  );

create policy credits_read on public.linked_credits
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_admin()
  );

create policy disbursements_read on public.disbursement_confirmations
  for select to authenticated
  using (
    public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_merchant_of_order(order_id)
    or public.is_client_of_order(order_id)
    or public.is_admin()
  );

create policy schedules_read on public.schedule_versions
  for select to authenticated
  using (public.is_owner_or_bank_of_credit(credit_id));

create policy installments_read on public.installments
  for select to authenticated
  using (public.is_owner_or_bank_of_credit(credit_id));

create policy bank_confirmations_read on public.bank_payment_confirmations
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_admin()
  );

create policy allocations_read on public.payment_allocations
  for select to authenticated
  using (
    exists (
      select 1 from public.bank_payment_confirmations c
      where c.id = confirmation_id
        and (
          c.client_id = (select auth.uid())
          or public.is_org_member(c.bank_org_id, 'entidad_financiera')
          or public.is_admin()
        )
    )
  );

create policy reports_read on public.payment_reports
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(bank_org_id, 'entidad_financiera')
    or public.is_admin()
  );

create policy consents_read on public.consents
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or public.is_org_member(target_org_id)
    or public.is_admin()
  );

create policy data_access_audit_read on public.data_access_audit
  for select to authenticated
  using (client_id = (select auth.uid()) or public.is_admin());

create policy commission_agreements_read on public.commission_agreements
  for select to authenticated
  using (public.is_admin() or public.is_org_member(organization_id));

create policy commission_entries_read on public.commission_entries
  for select to authenticated
  using (public.is_admin() or public.is_org_member(organization_id));

create policy support_cases_read on public.support_cases
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_admin()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

create policy support_cases_insert on public.support_cases
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.is_active());

create policy support_cases_update on public.support_cases
  for update to authenticated
  using (
    public.is_admin()
    or (organization_id is not null and public.is_org_member(organization_id))
  )
  with check (
    public.is_admin()
    or (organization_id is not null and public.is_org_member(organization_id))
  );

-- =========================================================
-- 5. FUNCIONES TRANSACCIONALES Y REGLAS DE NEGOCIO (RPC)
-- =========================================================

-- 5.1 Administración de organizaciones y membresías (solo Administrador AYNI)
create function public.admin_upsert_organization(
  p_id uuid,
  p_org_type public.organization_type,
  p_name text,
  p_tax_id text default '',
  p_contact_email text default '',
  p_contact_phone text default '',
  p_status public.organization_status default 'activa',
  p_is_demo boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador activo puede gestionar organizaciones.' using errcode = '42501';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'Nombre de organización inválido.';
  end if;

  if p_id is null then
    insert into public.organizations(org_type, name, tax_id, contact_email, contact_phone, status, is_demo)
    values (p_org_type, trim(p_name), trim(coalesce(p_tax_id, '')), trim(coalesce(p_contact_email, '')), trim(coalesce(p_contact_phone, '')), p_status, p_is_demo)
    returning id into v_id;

    insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
    values (auth.uid(), v_id, 'organization', v_id::text, 'organizacion_creada',
      jsonb_build_object('org_type', p_org_type, 'name', trim(p_name), 'is_demo', p_is_demo));
  else
    update public.organizations
    set name = trim(p_name),
        tax_id = trim(coalesce(p_tax_id, '')),
        contact_email = trim(coalesce(p_contact_email, '')),
        contact_phone = trim(coalesce(p_contact_phone, '')),
        status = p_status,
        is_demo = p_is_demo,
        updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Organización no encontrada.';
    end if;

    insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
    values (auth.uid(), v_id, 'organization', v_id::text, 'organizacion_actualizada',
      jsonb_build_object('status', p_status, 'name', trim(p_name)));
  end if;

  return v_id;
end;
$$;

create function public.admin_set_org_member(
  p_org_id uuid,
  p_profile_id uuid,
  p_member_role public.org_member_role default 'operador',
  p_status public.membership_status default 'activa'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org public.organizations;
  v_prof public.profiles;
  v_mem_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador activo puede asignar miembros.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if not found then raise exception 'Organización no encontrada.'; end if;

  select * into v_prof from public.profiles where id = p_profile_id;
  if not found or v_prof.status = 'eliminado' then
    raise exception 'Perfil no disponible.';
  end if;

  if (v_org.org_type = 'comercio' and v_prof.role <> 'comercio')
     or (v_org.org_type = 'entidad_financiera' and v_prof.role <> 'entidad_financiera') then
    raise exception 'El rol del usuario (%) no coincide con el tipo de organización (%).', v_prof.role, v_org.org_type;
  end if;

  insert into public.organization_members(organization_id, profile_id, member_role, status)
  values (p_org_id, p_profile_id, p_member_role, p_status)
  on conflict (organization_id, profile_id)
  do update set member_role = excluded.member_role, status = excluded.status, updated_at = now()
  returning id into v_mem_id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_org_id, 'organization_member', v_mem_id::text, 'membresia_actualizada',
    jsonb_build_object('profile_id', p_profile_id, 'member_role', p_member_role, 'status', p_status));

  return v_mem_id;
end;
$$;

-- 5.2 Creación de orden de compra con snapshot inmutable de precios (solo Cliente activo)
create function public.create_purchase_order(
  p_merchant_org_id uuid,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prof public.profiles;
  v_org public.organizations;
  v_item jsonb;
  v_prod public.products;
  v_qty integer;
  v_total bigint := 0;
  v_currency char(3) := null;
  v_order_id uuid;
  v_code text;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if not found or v_prof.status <> 'activo' or v_prof.role <> 'cliente' then
    raise exception 'Solo un cliente activo puede crear órdenes de compra.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations
  where id = p_merchant_org_id and org_type = 'comercio' and status = 'activa';
  if not found then raise exception 'Comercio no disponible.'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debes incluir al menos un producto en la orden.';
  end if;

  -- Primera pasada: validar stock, pertenencia y total
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida.';
    end if;

    select * into v_prod from public.products
    where id = (v_item->>'product_id')::uuid
      and merchant_org_id = p_merchant_org_id
      and is_available = true
    for update;

    if not found then
      raise exception 'Producto no disponible en este comercio.';
    end if;
    if v_prod.stock < v_qty then
      raise exception 'Stock insuficiente para %.', v_prod.name;
    end if;

    if v_currency is null then
      v_currency := v_prod.currency;
    elsif v_currency <> v_prod.currency then
      raise exception 'Todos los productos de la orden deben tener la misma moneda.';
    end if;

    v_total := v_total + (v_prod.price_minor * v_qty);
  end loop;

  v_code := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.purchase_orders(order_code, client_id, client_name_snapshot, merchant_org_id, status, currency, total_minor)
  values (v_code, v_prof.id, v_prof.full_name, p_merchant_org_id, 'creada', v_currency, v_total)
  returning id into v_order_id;

  -- Segunda pasada: congelar snapshot inmutable y descontar stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_prod from public.products where id = (v_item->>'product_id')::uuid;

    insert into public.purchase_order_items(
      order_id, product_id, product_name_snapshot, product_description_snapshot,
      unit_price_minor, quantity, subtotal_minor
    ) values (
      v_order_id, v_prod.id, v_prod.name, v_prod.description,
      v_prod.price_minor, v_qty, v_prod.price_minor * v_qty
    );

    update public.products set stock = stock - v_qty, updated_at = now() where id = v_prod.id;
  end loop;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_merchant_org_id, 'purchase_order', v_order_id::text, 'orden_creada',
    jsonb_build_object('order_code', v_code, 'total_minor', v_total, 'currency', v_currency));

  return v_order_id;
end;
$$;

-- 5.3 Gestión comercial de entrega/devolución (solo Comercio; devolución NO cancela deuda bancaria)
create function public.merchant_update_order_status(
  p_order_id uuid,
  p_new_status public.order_status,
  p_note text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders;
  v_has_disbursement boolean;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.'; end if;

  if not public.is_org_member(v_order.merchant_org_id, 'comercio') then
    raise exception 'Solo un miembro activo del comercio puede actualizar esta orden.' using errcode = '42501';
  end if;

  if p_new_status not in ('pendiente_entrega', 'entregada', 'cancelada', 'devolucion_en_proceso', 'devuelta') then
    raise exception 'Estado comercial no permitido.';
  end if;

  select exists(
    select 1 from public.disbursement_confirmations where order_id = p_order_id
  ) into v_has_disbursement;

  if p_new_status = 'entregada' and not v_has_disbursement then
    raise exception 'No se puede registrar la entrega antes de la confirmación bancaria de desembolso.';
  end if;

  if p_new_status = 'cancelada' and v_has_disbursement then
    raise exception 'Una orden con desembolso confirmado debe gestionarse como devolución comercial sin cancelar automáticamente la deuda bancaria.';
  end if;

  update public.purchase_orders
  set status = p_new_status,
      delivery_notes = coalesce(nullif(trim(p_note), ''), delivery_notes),
      delivered_at = case when p_new_status = 'entregada' then now() else delivered_at end,
      updated_at = now()
  where id = p_order_id;

  -- Importante: devolucion_en_proceso / devuelta NO altera linked_credits.
  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_order.merchant_org_id, 'purchase_order', p_order_id::text, 'estado_comercial_actualizado',
    jsonb_build_object('from', v_order.status, 'to', p_new_status, 'note', coalesce(p_note, '')));
end;
$$;

-- 5.4 Enviar solicitud de financiamiento a un banco identificado (registra consentimiento)
create function public.submit_financing_application(
  p_order_id uuid,
  p_bank_org_id uuid,
  p_requested_installments integer,
  p_client_notes text default '',
  p_consent_version text default 'v1.0-demo'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders;
  v_bank public.organizations;
  v_app_id uuid;
  v_code text;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or v_order.client_id <> auth.uid() then
    raise exception 'No tienes acceso a esta orden.' using errcode = '42501';
  end if;
  if not public.is_active() then
    raise exception 'Cuenta inactiva.' using errcode = '42501';
  end if;
  if v_order.status not in ('creada', 'pendiente_financiamiento') then
    raise exception 'La orden no está en un estado válido para solicitar financiamiento.';
  end if;

  select * into v_bank from public.organizations
  where id = p_bank_org_id and org_type = 'entidad_financiera' and status = 'activa';
  if not found then raise exception 'Entidad financiera no disponible.'; end if;

  if p_requested_installments not between 1 and 60 then
    raise exception 'Número de cuotas solicitado fuera de rango (1-60).';
  end if;

  -- Consentimiento específico para evaluación de esta solicitud
  insert into public.consents(client_id, target_org_id, purpose, data_categories, text_version, status, expires_at)
  values (
    auth.uid(),
    p_bank_org_id,
    'evaluacion_solicitud',
    array['identificacion_basica', 'detalle_orden', 'datos_solicitud'],
    coalesce(nullif(trim(p_consent_version), ''), 'v1.0-demo'),
    'vigente',
    now() + interval '90 days'
  );

  v_code := 'SOL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.financing_applications(
    application_code, order_id, client_id, client_name_snapshot,
    bank_org_id, requested_amount_minor, currency, requested_installments, client_notes, status
  ) values (
    v_code, v_order.id, v_order.client_id, v_order.client_name_snapshot,
    p_bank_org_id, v_order.total_minor, v_order.currency, p_requested_installments,
    trim(coalesce(p_client_notes, '')), 'enviada'
  ) returning id into v_app_id;

  update public.purchase_orders
  set status = 'pendiente_financiamiento', updated_at = now()
  where id = v_order.id;

  insert into public.application_events(application_id, actor_id, from_status, to_status, reason)
  values (v_app_id, auth.uid(), null, 'enviada', 'Solicitud presentada con autorización del cliente.');

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_bank_org_id, 'financing_application', v_app_id::text, 'solicitud_enviada',
    jsonb_build_object('application_code', v_code, 'order_id', v_order.id, 'amount_minor', v_order.total_minor));

  return v_app_id;
end;
$$;

-- 5.5 Evaluación bancaria y emisión de oferta (EXCLUSIVO entidad_financiera destinataria)
create function public.bank_review_application(
  p_application_id uuid,
  p_action text,
  p_reason text default '',
  p_offer jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.financing_applications;
  v_new_status public.application_status;
  v_next_ver integer;
  v_offer_id uuid := null;
  v_principal bigint;
  v_total_payable bigint;
  v_inst_count integer;
  v_inst_amount bigint;
  v_rate_bps integer;
  v_expires timestamptz;
begin
  select * into v_app from public.financing_applications where id = p_application_id for update;
  if not found then raise exception 'Solicitud no encontrada.'; end if;

  if not public.is_org_member(v_app.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo empleados autorizados de la entidad financiera destinataria pueden evaluar esta solicitud.' using errcode = '42501';
  end if;

  if v_app.status in ('rechazada', 'cancelada') then
    raise exception 'La solicitud ya se encuentra en un estado terminal.';
  end if;

  if p_action = 'en_revision_bancaria' then
    v_new_status := 'en_revision_bancaria';
  elsif p_action = 'requiere_informacion' then
    v_new_status := 'requiere_informacion';
  elsif p_action = 'rechazada' then
    v_new_status := 'rechazada';
  elsif p_action = 'emitir_oferta' then
    v_new_status := 'oferta_emitida';
    if p_offer is null then raise exception 'Faltan los parámetros de la oferta bancaria.'; end if;

    v_principal := coalesce((p_offer->>'principal_minor')::bigint, v_app.requested_amount_minor);
    v_total_payable := (p_offer->>'total_payable_minor')::bigint;
    v_inst_count := (p_offer->>'installment_count')::integer;
    v_inst_amount := (p_offer->>'installment_amount_minor')::bigint;
    v_rate_bps := coalesce((p_offer->>'annual_rate_bps')::integer, 0);
    v_expires := coalesce((p_offer->>'expires_at')::timestamptz, now() + interval '7 days');

    if v_principal <= 0 or v_total_payable is null or v_total_payable < v_principal
       or v_inst_count is null or v_inst_count not between 1 and 60
       or v_inst_amount is null or v_inst_amount <= 0
       or v_expires <= now() then
      raise exception 'Condiciones de oferta inválidas o vigencia expirada.';
    end if;

    -- Sustituir oferta previa vigente si existía
    update public.financing_offers
    set status = 'sustituida'
    where application_id = v_app.id and status = 'vigente';

    select coalesce(max(version_number), 0) + 1 into v_next_ver
    from public.financing_offers where application_id = v_app.id;

    insert into public.financing_offers(
      application_id, bank_org_id, version_number,
      principal_minor, total_payable_minor, currency,
      installment_count, installment_amount_minor, annual_rate_bps,
      conditions_text, expires_at, status, is_demo, created_by
    ) values (
      v_app.id, v_app.bank_org_id, v_next_ver,
      v_principal, v_total_payable, v_app.currency,
      v_inst_count, v_inst_amount, v_rate_bps,
      coalesce(p_offer->>'conditions_text', 'Condiciones definidas por la entidad financiera (simulación demo).'),
      v_expires, 'vigente', coalesce((p_offer->>'is_demo')::boolean, true), auth.uid()
    ) returning id into v_offer_id;
  else
    raise exception 'Acción bancaria no reconocida.';
  end if;

  update public.financing_applications
  set status = v_new_status,
      bank_notes = coalesce(nullif(trim(p_reason), ''), bank_notes),
      updated_at = now()
  where id = v_app.id;

  insert into public.application_events(application_id, actor_id, from_status, to_status, reason)
  values (v_app.id, auth.uid(), v_app.status, v_new_status, coalesce(p_reason, ''));

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_app.bank_org_id, 'financing_application', v_app.id::text, 'evaluacion_bancaria_' || p_action,
    jsonb_build_object('offer_id', v_offer_id, 'reason', coalesce(p_reason, '')));

  return jsonb_build_object(
    'application_id', v_app.id,
    'status', v_new_status,
    'offer_id', v_offer_id
  );
end;
$$;

-- 5.6 Respuesta del cliente a una oferta (rechaza vencidas; aceptar deja crédito en pendiente_formalizacion)
create function public.client_respond_offer(
  p_offer_id uuid,
  p_accept boolean,
  p_acceptance_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_offer public.financing_offers;
  v_app public.financing_applications;
  v_credit_id uuid := null;
begin
  select * into v_offer from public.financing_offers where id = p_offer_id for update;
  if not found then raise exception 'Oferta no encontrada.'; end if;

  select * into v_app from public.financing_applications where id = v_offer.application_id;
  if v_app.client_id <> auth.uid() or not public.is_active() then
    raise exception 'Solo el cliente titular puede responder a esta oferta.' using errcode = '42501';
  end if;

  if v_offer.status <> 'vigente' then
    raise exception 'La oferta no se encuentra vigente (estado actual: %).', v_offer.status;
  end if;

  if v_offer.expires_at <= now() then
    raise exception 'La oferta ha vencido y no puede aceptarse.';
  end if;

  if p_accept then
    update public.financing_offers set status = 'aceptada' where id = v_offer.id;

    insert into public.offer_acceptances(offer_id, client_id, acceptance_note)
    values (v_offer.id, auth.uid(), trim(coalesce(p_acceptance_note, '')));

    insert into public.linked_credits(
      application_id, offer_id, order_id, client_id, bank_org_id,
      currency, principal_minor, total_payable_minor, status, is_demo
    ) values (
      v_app.id, v_offer.id, v_app.order_id, v_app.client_id, v_offer.bank_org_id,
      v_offer.currency, v_offer.principal_minor, v_offer.total_payable_minor,
      'pendiente_formalizacion', v_offer.is_demo
    ) returning id into v_credit_id;

    insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
    values (auth.uid(), v_offer.bank_org_id, 'financing_offer', v_offer.id::text, 'oferta_aceptada_por_cliente',
      jsonb_build_object('credit_id', v_credit_id, 'note', 'Pendiente de formalización por la entidad financiera'));

    return jsonb_build_object('offer_id', v_offer.id, 'status', 'aceptada', 'credit_id', v_credit_id);
  else
    update public.financing_offers set status = 'rechazada_por_cliente' where id = v_offer.id;

    insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
    values (auth.uid(), v_offer.bank_org_id, 'financing_offer', v_offer.id::text, 'oferta_rechazada_por_cliente', '{}'::jsonb);

    return jsonb_build_object('offer_id', v_offer.id, 'status', 'rechazada_por_cliente', 'credit_id', null);
  end if;
end;
$$;

-- 5.7 Formalización y Desembolso Bancario (idempotente + devengo automático de comisión AYNI)
create function public.bank_formalize_credit(
  p_credit_id uuid,
  p_external_credit_ref text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_credit public.linked_credits;
begin
  select * into v_credit from public.linked_credits where id = p_credit_id for update;
  if not found then raise exception 'Crédito no encontrado.'; end if;

  if not public.is_org_member(v_credit.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera originadora puede formalizar el crédito.' using errcode = '42501';
  end if;
  if v_credit.status <> 'pendiente_formalizacion' then
    raise exception 'El crédito no está pendiente de formalización.';
  end if;
  if p_external_credit_ref is null or char_length(trim(p_external_credit_ref)) < 3 then
    raise exception 'Debes indicar la referencia externa bancaria del crédito.';
  end if;

  update public.linked_credits
  set external_credit_ref = trim(p_external_credit_ref),
      status = 'formalizado',
      formalized_at = now(),
      updated_at = now()
  where id = v_credit.id;

  update public.purchase_orders
  set status = 'financiada', updated_at = now()
  where id = v_credit.order_id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_credit.bank_org_id, 'linked_credit', v_credit.id::text, 'credito_formalizado',
    jsonb_build_object('external_credit_ref', trim(p_external_credit_ref)));
end;
$$;

create function public.bank_confirm_disbursement(
  p_credit_id uuid,
  p_external_event_id text,
  p_amount_minor bigint,
  p_recipient_type text default 'comercio',
  p_disbursed_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_credit public.linked_credits;
  v_existing_id uuid;
  v_disb_id uuid;
  v_agr public.commission_agreements;
  v_comm_minor bigint;
  v_comm_id uuid := null;
begin
  select * into v_credit from public.linked_credits where id = p_credit_id for update;
  if not found then raise exception 'Crédito no encontrado.'; end if;

  if not public.is_org_member(v_credit.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera originadora puede confirmar el desembolso.' using errcode = '42501';
  end if;

  if p_external_event_id is null or char_length(trim(p_external_event_id)) < 3 then
    raise exception 'Identificador externo de desembolso requerido.';
  end if;

  -- Idempotencia: no duplicar desembolso ni comisión ante reintento
  select id into v_existing_id
  from public.disbursement_confirmations
  where bank_org_id = v_credit.bank_org_id
    and external_event_id = trim(p_external_event_id);

  if found then
    return jsonb_build_object('disbursement_id', v_existing_id, 'duplicate', true, 'commission_entry_id', null);
  end if;

  if v_credit.status <> 'formalizado' then
    raise exception 'El crédito debe estar formalizado antes de confirmar el desembolso.';
  end if;

  insert into public.disbursement_confirmations(
    credit_id, order_id, bank_org_id, external_event_id,
    amount_minor, currency, recipient_type, disbursed_at, confirmed_by
  ) values (
    v_credit.id, v_credit.order_id, v_credit.bank_org_id, trim(p_external_event_id),
    p_amount_minor, v_credit.currency, p_recipient_type, coalesce(p_disbursed_at, now()), auth.uid()
  ) returning id into v_disb_id;

  update public.linked_credits
  set status = 'desembolsado', disbursed_at = coalesce(p_disbursed_at, now()), updated_at = now()
  where id = v_credit.id;

  update public.purchase_orders
  set status = 'pendiente_entrega', updated_at = now()
  where id = v_credit.order_id;

  -- Devengo separado de comisión AYNI solo si existe acuerdo activo para desembolso_confirmado
  select * into v_agr
  from public.commission_agreements
  where organization_id = v_credit.bank_org_id
    and trigger_event = 'desembolso_confirmado'
    and status = 'activo'
  order by created_at desc
  limit 1;

  if found then
    if v_agr.calc_type = 'fija' then
      v_comm_minor := v_agr.fixed_minor;
    else
      v_comm_minor := ((p_amount_minor * v_agr.rate_bps + 5000) / 10000);
    end if;

    insert into public.commission_entries(
      agreement_id, organization_id, credit_id, source_disbursement_id,
      base_amount_minor, commission_minor, currency, status
    ) values (
      v_agr.id, v_credit.bank_org_id, v_credit.id, v_disb_id,
      p_amount_minor, v_comm_minor, v_agr.currency, 'devengada'
    )
    on conflict (agreement_id, source_disbursement_id) do nothing
    returning id into v_comm_id;
  end if;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_credit.bank_org_id, 'disbursement_confirmation', v_disb_id::text, 'desembolso_confirmado',
    jsonb_build_object('credit_id', v_credit.id, 'external_event_id', trim(p_external_event_id), 'commission_entry_id', v_comm_id));

  return jsonb_build_object('disbursement_id', v_disb_id, 'duplicate', false, 'commission_entry_id', v_comm_id);
end;
$$;

-- 5.8 Publicación versionada del cronograma bancario (conserva versión previa)
create function public.bank_publish_schedule(
  p_credit_id uuid,
  p_source_label text,
  p_installments jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_credit public.linked_credits;
  v_next_ver integer;
  v_sched_id uuid;
  v_row jsonb;
  v_status public.installment_status;
begin
  select * into v_credit from public.linked_credits where id = p_credit_id for update;
  if not found then raise exception 'Crédito no encontrado.'; end if;

  if not public.is_org_member(v_credit.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera puede publicar o actualizar el cronograma.' using errcode = '42501';
  end if;
  if v_credit.status not in ('formalizado', 'desembolsado') then
    raise exception 'El crédito debe estar formalizado o desembolsado para publicar cronograma.';
  end if;
  if p_installments is null or jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) = 0 then
    raise exception 'El cronograma debe contener al menos una cuota.';
  end if;

  update public.schedule_versions
  set is_current = false
  where credit_id = v_credit.id and is_current = true;

  select coalesce(max(version_number), 0) + 1 into v_next_ver
  from public.schedule_versions where credit_id = v_credit.id;

  insert into public.schedule_versions(credit_id, bank_org_id, version_number, source_label, is_current, last_synced_at, created_by)
  values (v_credit.id, v_credit.bank_org_id, v_next_ver, coalesce(nullif(trim(p_source_label), ''), 'Cronograma bancario'), true, now(), auth.uid())
  returning id into v_sched_id;

  for v_row in select * from jsonb_array_elements(p_installments) loop
    v_status := coalesce((v_row->>'status')::public.installment_status, 'pendiente');
    insert into public.installments(
      schedule_version_id, credit_id, installment_number, due_date, amount_minor, currency, status
    ) values (
      v_sched_id,
      v_credit.id,
      (v_row->>'installment_number')::integer,
      (v_row->>'due_date')::date,
      (v_row->>'amount_minor')::bigint,
      v_credit.currency,
      v_status
    );
  end loop;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_credit.bank_org_id, 'schedule_version', v_sched_id::text, 'cronograma_publicado',
    jsonb_build_object('credit_id', v_credit.id, 'version_number', v_next_ver));

  return v_sched_id;
end;
$$;

-- 5.9 Reporte de pago del cliente (NUNCA cambia cuota a pagada)
create function public.client_submit_payment_report(
  p_credit_id uuid,
  p_installment_id uuid,
  p_reported_amount_minor bigint,
  p_payment_date date,
  p_reference_code text default '',
  p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_credit public.linked_credits;
  v_rep_id uuid;
begin
  select * into v_credit from public.linked_credits where id = p_credit_id;
  if not found or v_credit.client_id <> auth.uid() or not public.is_active() then
    raise exception 'No tienes permiso para reportar pagos en este crédito.' using errcode = '42501';
  end if;
  if p_reported_amount_minor is null or p_reported_amount_minor <= 0 then
    raise exception 'Monto reportado inválido.';
  end if;

  if p_installment_id is not null then
    if not exists(select 1 from public.installments where id = p_installment_id and credit_id = v_credit.id) then
      raise exception 'La cuota indicada no pertenece a este crédito.';
    end if;
  end if;

  insert into public.payment_reports(
    credit_id, installment_id, client_id, bank_org_id,
    reported_amount_minor, currency, payment_date, reference_code, notes, status
  ) values (
    v_credit.id, p_installment_id, auth.uid(), v_credit.bank_org_id,
    p_reported_amount_minor, v_credit.currency, p_payment_date,
    trim(coalesce(p_reference_code, '')), trim(coalesce(p_notes, '')),
    'pendiente_verificacion'
  ) returning id into v_rep_id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_credit.bank_org_id, 'payment_report', v_rep_id::text, 'reporte_pago_cliente',
    jsonb_build_object('credit_id', v_credit.id, 'reported_amount_minor', p_reported_amount_minor));

  return v_rep_id;
end;
$$;

-- 5.10 Confirmación bancaria de pago (idempotente) y reverso trazable
create function public.bank_confirm_payment(
  p_credit_id uuid,
  p_external_event_id text,
  p_amount_minor bigint,
  p_operation_date timestamptz,
  p_allocations jsonb,
  p_linked_report_id uuid default null,
  p_notes text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_credit public.linked_credits;
  v_existing_id uuid;
  v_conf_id uuid;
  v_alloc jsonb;
  v_inst public.installments;
  v_alloc_amt bigint;
  v_pending_count integer;
begin
  select * into v_credit from public.linked_credits where id = p_credit_id for update;
  if not found then raise exception 'Crédito no encontrado.'; end if;

  if not public.is_org_member(v_credit.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera originadora puede confirmar pagos.' using errcode = '42501';
  end if;

  if p_external_event_id is null or char_length(trim(p_external_event_id)) < 3 then
    raise exception 'Identificador externo de confirmación requerido.';
  end if;

  -- Idempotencia
  select id into v_existing_id
  from public.bank_payment_confirmations
  where bank_org_id = v_credit.bank_org_id
    and external_event_id = trim(p_external_event_id);

  if found then
    return jsonb_build_object('confirmation_id', v_existing_id, 'duplicate', true);
  end if;

  insert into public.bank_payment_confirmations(
    credit_id, bank_org_id, client_id, external_event_id, event_type,
    amount_minor, currency, operation_date, notes, confirmed_by
  ) values (
    v_credit.id, v_credit.bank_org_id, v_credit.client_id, trim(p_external_event_id), 'confirmacion',
    p_amount_minor, v_credit.currency, coalesce(p_operation_date, now()), trim(coalesce(p_notes, '')), auth.uid()
  ) returning id into v_conf_id;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_alloc_amt := (v_alloc->>'amount_minor')::bigint;
      if v_alloc_amt is null or v_alloc_amt <= 0 then
        raise exception 'Monto de aplicación a cuota inválido.';
      end if;

      select * into v_inst from public.installments
      where id = (v_alloc->>'installment_id')::uuid and credit_id = v_credit.id
      for update;

      if not found then
        raise exception 'La cuota indicada no pertenece al crédito.';
      end if;

      insert into public.payment_allocations(confirmation_id, installment_id, amount_minor)
      values (v_conf_id, v_inst.id, v_alloc_amt);

      update public.installments
      set paid_minor = paid_minor + v_alloc_amt,
          status = case
            when paid_minor + v_alloc_amt >= amount_minor then 'pagada'::public.installment_status
            else 'parcial'::public.installment_status
          end,
          paid_at = case
            when paid_minor + v_alloc_amt >= amount_minor then coalesce(p_operation_date, now())
            else paid_at
          end,
          last_confirmed_at = now()
      where id = v_inst.id;
    end loop;
  end if;

  if p_linked_report_id is not null then
    update public.payment_reports
    set status = 'vinculado_confirmacion',
        linked_confirmation_id = v_conf_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_linked_report_id and credit_id = v_credit.id;
  end if;

  update public.schedule_versions
  set last_synced_at = now()
  where credit_id = v_credit.id and is_current = true;

  -- Si todas las cuotas del cronograma vigente están pagadas, cerrar el crédito
  select count(*) into v_pending_count
  from public.installments i
  join public.schedule_versions s on s.id = i.schedule_version_id
  where s.credit_id = v_credit.id and s.is_current = true and i.status <> 'pagada';

  if v_pending_count = 0 and exists(
    select 1 from public.schedule_versions where credit_id = v_credit.id and is_current = true
  ) then
    update public.linked_credits
    set status = 'cerrado', closed_at = now(), updated_at = now()
    where id = v_credit.id and status = 'desembolsado';
  end if;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_credit.bank_org_id, 'bank_payment_confirmation', v_conf_id::text, 'pago_confirmado_banco',
    jsonb_build_object('credit_id', v_credit.id, 'external_event_id', trim(p_external_event_id), 'amount_minor', p_amount_minor));

  return jsonb_build_object('confirmation_id', v_conf_id, 'duplicate', false);
end;
$$;

create function public.bank_reverse_payment(
  p_original_confirmation_id uuid,
  p_external_event_id text,
  p_reason text default 'Reverso informado por la entidad financiera'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_orig public.bank_payment_confirmations;
  v_existing_id uuid;
  v_rev_id uuid;
  v_alloc record;
  v_new_paid bigint;
begin
  select * into v_orig from public.bank_payment_confirmations where id = p_original_confirmation_id for update;
  if not found then raise exception 'Confirmación original no encontrada.'; end if;

  if not public.is_org_member(v_orig.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera originadora puede registrar reversos.' using errcode = '42501';
  end if;
  if v_orig.event_type <> 'confirmacion' then
    raise exception 'Solo se puede revertir una confirmación de pago.';
  end if;

  select id into v_existing_id
  from public.bank_payment_confirmations
  where bank_org_id = v_orig.bank_org_id
    and external_event_id = trim(p_external_event_id);

  if found then
    return jsonb_build_object('reversal_id', v_existing_id, 'duplicate', true);
  end if;

  if exists(select 1 from public.bank_payment_confirmations where reversal_of_id = v_orig.id) then
    raise exception 'Esta confirmación ya fue revertida previamente.';
  end if;

  insert into public.bank_payment_confirmations(
    credit_id, bank_org_id, client_id, external_event_id, event_type,
    reversal_of_id, amount_minor, currency, operation_date, notes, confirmed_by
  ) values (
    v_orig.credit_id, v_orig.bank_org_id, v_orig.client_id, trim(p_external_event_id), 'reverso',
    v_orig.id, v_orig.amount_minor, v_orig.currency, now(), trim(coalesce(p_reason, '')), auth.uid()
  ) returning id into v_rev_id;

  -- Revertir impacto en cuotas preservando el evento original intacto
  for v_alloc in
    select pa.installment_id, pa.amount_minor, i.paid_minor, i.amount_minor as inst_total
    from public.payment_allocations pa
    join public.installments i on i.id = pa.installment_id
    where pa.confirmation_id = v_orig.id
  loop
    v_new_paid := greatest(0, v_alloc.paid_minor - v_alloc.amount_minor);
    update public.installments
    set paid_minor = v_new_paid,
        status = case
          when v_new_paid = 0 then 'pendiente'::public.installment_status
          when v_new_paid < v_alloc.inst_total then 'parcial'::public.installment_status
          else 'pagada'::public.installment_status
        end,
        paid_at = case when v_new_paid < v_alloc.inst_total then null else paid_at end,
        last_confirmed_at = now()
    where id = v_alloc.installment_id;
  end loop;

  update public.linked_credits
  set status = 'desembolsado', closed_at = null, updated_at = now()
  where id = v_orig.credit_id and status = 'cerrado';

  update public.schedule_versions
  set last_synced_at = now()
  where credit_id = v_orig.credit_id and is_current = true;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_orig.bank_org_id, 'bank_payment_confirmation', v_rev_id::text, 'pago_revertido_banco',
    jsonb_build_object('original_confirmation_id', v_orig.id, 'reason', coalesce(p_reason, '')));

  return jsonb_build_object('reversal_id', v_rev_id, 'duplicate', false);
end;
$$;

create function public.bank_review_payment_report(
  p_report_id uuid,
  p_status public.payment_report_status,
  p_review_notes text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rep public.payment_reports;
begin
  select * into v_rep from public.payment_reports where id = p_report_id for update;
  if not found then raise exception 'Reporte no encontrado.'; end if;

  if not public.is_org_member(v_rep.bank_org_id, 'entidad_financiera') then
    raise exception 'Solo la entidad financiera puede observar o rechazar reportes.' using errcode = '42501';
  end if;
  if p_status not in ('observado', 'rechazado') then
    raise exception 'Usa bank_confirm_payment para vincular una confirmación bancaria.';
  end if;

  update public.payment_reports
  set status = p_status,
      review_notes = trim(coalesce(p_review_notes, '')),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = v_rep.id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_rep.bank_org_id, 'payment_report', v_rep.id::text, 'reporte_' || p_status::text,
    jsonb_build_object('review_notes', coalesce(p_review_notes, '')));
end;
$$;

-- 5.11 Consentimientos e indicadores descriptivos de cumplimiento (sin scoring arbitrario)
create function public.client_manage_consent(
  p_target_org_id uuid,
  p_purpose text,
  p_days_valid integer default 30,
  p_revoke_consent_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_active() then
    raise exception 'Cuenta inactiva.' using errcode = '42501';
  end if;

  if p_revoke_consent_id is not null then
    update public.consents
    set status = 'revocado', revoked_at = now()
    where id = p_revoke_consent_id and client_id = auth.uid() and status = 'vigente'
    returning id into v_id;

    if v_id is null then raise exception 'Consentimiento no encontrado o ya inactivo.'; end if;

    insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
    values (auth.uid(), p_target_org_id, 'consent', v_id::text, 'consentimiento_revocado', '{}'::jsonb);
    return v_id;
  end if;

  if not exists(select 1 from public.organizations where id = p_target_org_id and org_type = 'entidad_financiera' and status = 'activa') then
    raise exception 'Entidad financiera destinataria no disponible.';
  end if;

  insert into public.consents(client_id, target_org_id, purpose, data_categories, text_version, status, expires_at)
  values (
    auth.uid(),
    p_target_org_id,
    p_purpose,
    array['indicadores_cumplimiento', 'operaciones_completadas'],
    'v1.0-demo',
    'vigente',
    now() + make_interval(days => greatest(1, least(coalesce(p_days_valid, 30), 180)))
  ) returning id into v_id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_target_org_id, 'consent', v_id::text, 'consentimiento_otorgado',
    jsonb_build_object('purpose', p_purpose));

  return v_id;
end;
$$;

create function public.compute_compliance_summary(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with current_insts as (
    select i.*, s.last_synced_at
    from public.installments i
    join public.schedule_versions s on s.id = i.schedule_version_id
    join public.linked_credits c on c.id = i.credit_id
    where c.client_id = p_client_id
      and s.is_current = true
  )
  select jsonb_build_object(
    'confirmed_installments', count(*) filter (where status = 'pagada'),
    'paid_on_time', count(*) filter (where status = 'pagada' and paid_at is not null and paid_at::date <= due_date),
    'confirmed_delays', count(*) filter (where status = 'atrasada' or (status = 'pagada' and paid_at is not null and paid_at::date > due_date)),
    'pending_info_installments', count(*) filter (where status = 'pendiente_informacion'),
    'completed_credits', (select count(*) from public.linked_credits where client_id = p_client_id and status = 'cerrado'),
    'active_credits', (select count(*) from public.linked_credits where client_id = p_client_id and status in ('formalizado', 'desembolsado')),
    'last_synced_at', max(last_synced_at),
    'disclaimer', 'Indicadores descriptivos basados únicamente en confirmaciones bancarias recibidas. No constituyen scoring crediticio ni garantía de aprobación.'
  )
  from current_insts;
$$;

create function public.client_own_compliance()
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Cuenta inactiva.' using errcode = '42501';
  end if;
  return public.compute_compliance_summary(auth.uid());
end;
$$;

create function public.bank_read_authorized_compliance(
  p_client_id uuid,
  p_bank_org_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_consent_id uuid;
begin
  if not public.is_org_member(p_bank_org_id, 'entidad_financiera') then
    raise exception 'Solo empleados activos de la entidad financiera pueden consultar cumplimiento.' using errcode = '42501';
  end if;

  select id into v_consent_id
  from public.consents
  where client_id = p_client_id
    and target_org_id = p_bank_org_id
    and status = 'vigente'
    and expires_at > now()
  order by granted_at desc
  limit 1;

  if v_consent_id is null then
    raise exception 'Se requiere autorización vigente del cliente para consultar su registro de cumplimiento.' using errcode = '42501';
  end if;

  insert into public.data_access_audit(client_id, accessed_by_profile_id, accessor_org_id, consent_id, purpose)
  values (p_client_id, auth.uid(), p_bank_org_id, v_consent_id, 'consulta_cumplimiento_autorizada');

  return public.compute_compliance_summary(p_client_id);
end;
$$;

-- 5.12 Gestión de convenios y liquidación de comisiones AYNI (solo Administrador AYNI)
create function public.admin_upsert_commission_agreement(
  p_org_id uuid,
  p_version_label text,
  p_calc_type public.commission_calc_type,
  p_fixed_minor bigint,
  p_rate_bps integer,
  p_service_description text default 'Servicio tecnológico por financiamiento concretado (demo)',
  p_is_demo boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador activo puede configurar acuerdos de comisión.' using errcode = '42501';
  end if;

  update public.commission_agreements
  set status = 'inactivo'
  where organization_id = p_org_id and trigger_event = 'desembolso_confirmado' and status = 'activo';

  insert into public.commission_agreements(
    organization_id, version_label, service_description, trigger_event,
    calc_type, fixed_minor, rate_bps, is_demo, status, created_by
  ) values (
    p_org_id, coalesce(nullif(trim(p_version_label), ''), 'v1-demo'),
    trim(coalesce(p_service_description, '')), 'desembolso_confirmado',
    p_calc_type, coalesce(p_fixed_minor, 0), coalesce(p_rate_bps, 0), p_is_demo, 'activo', auth.uid()
  ) returning id into v_id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), p_org_id, 'commission_agreement', v_id::text, 'acuerdo_comision_creado',
    jsonb_build_object('calc_type', p_calc_type, 'fixed_minor', p_fixed_minor, 'rate_bps', p_rate_bps, 'is_demo', p_is_demo));

  return v_id;
end;
$$;

create function public.admin_update_commission_entry(
  p_entry_id uuid,
  p_status public.commission_status,
  p_settlement_ref text default '',
  p_notes text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.commission_entries;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador activo puede liquidar o anular comisiones de AYNI.' using errcode = '42501';
  end if;
  if p_status not in ('liquidada', 'anulada') then
    raise exception 'Estado de comisión inválido.';
  end if;

  select * into v_entry from public.commission_entries where id = p_entry_id for update;
  if not found then raise exception 'Registro de comisión no encontrado.'; end if;

  update public.commission_entries
  set status = p_status,
      settlement_ref = coalesce(nullif(trim(p_settlement_ref), ''), settlement_ref),
      notes = trim(coalesce(p_notes, '')),
      settled_at = case when p_status = 'liquidada' then now() else settled_at end
  where id = v_entry.id;

  insert into public.domain_audit(actor_id, organization_id, entity_type, entity_id, action, details)
  values (auth.uid(), v_entry.organization_id, 'commission_entry', v_entry.id::text, 'comision_' || p_status::text,
    jsonb_build_object('settlement_ref', coalesce(p_settlement_ref, ''), 'notes', coalesce(p_notes, '')));
end;
$$;

-- Permisos de ejecución de RPCs (nunca anon, solo authenticated)
revoke all on function
  public.admin_upsert_organization(uuid, public.organization_type, text, text, text, text, public.organization_status, boolean),
  public.admin_set_org_member(uuid, uuid, public.org_member_role, public.membership_status),
  public.create_purchase_order(uuid, jsonb),
  public.merchant_update_order_status(uuid, public.order_status, text),
  public.submit_financing_application(uuid, uuid, integer, text, text),
  public.bank_review_application(uuid, text, text, jsonb),
  public.client_respond_offer(uuid, boolean, text),
  public.bank_formalize_credit(uuid, text),
  public.bank_confirm_disbursement(uuid, text, bigint, text, timestamptz),
  public.bank_publish_schedule(uuid, text, jsonb),
  public.client_submit_payment_report(uuid, uuid, bigint, date, text, text),
  public.bank_confirm_payment(uuid, text, bigint, timestamptz, jsonb, uuid, text),
  public.bank_reverse_payment(uuid, text, text),
  public.bank_review_payment_report(uuid, public.payment_report_status, text),
  public.client_manage_consent(uuid, text, integer, uuid),
  public.compute_compliance_summary(uuid),
  public.client_own_compliance(),
  public.bank_read_authorized_compliance(uuid, uuid),
  public.admin_upsert_commission_agreement(uuid, text, public.commission_calc_type, bigint, integer, text, boolean),
  public.admin_update_commission_entry(uuid, public.commission_status, text, text)
from public, anon;

grant execute on function
  public.admin_upsert_organization(uuid, public.organization_type, text, text, text, text, public.organization_status, boolean),
  public.admin_set_org_member(uuid, uuid, public.org_member_role, public.membership_status),
  public.create_purchase_order(uuid, jsonb),
  public.merchant_update_order_status(uuid, public.order_status, text),
  public.submit_financing_application(uuid, uuid, integer, text, text),
  public.bank_review_application(uuid, text, text, jsonb),
  public.client_respond_offer(uuid, boolean, text),
  public.bank_formalize_credit(uuid, text),
  public.bank_confirm_disbursement(uuid, text, bigint, text, timestamptz),
  public.bank_publish_schedule(uuid, text, jsonb),
  public.client_submit_payment_report(uuid, uuid, bigint, date, text, text),
  public.bank_confirm_payment(uuid, text, bigint, timestamptz, jsonb, uuid, text),
  public.bank_reverse_payment(uuid, text, text),
  public.bank_review_payment_report(uuid, public.payment_report_status, text),
  public.client_manage_consent(uuid, text, integer, uuid),
  public.client_own_compliance(),
  public.bank_read_authorized_compliance(uuid, uuid),
  public.admin_upsert_commission_agreement(uuid, text, public.commission_calc_type, bigint, integer, text, boolean),
  public.admin_update_commission_entry(uuid, public.commission_status, text, text)
to authenticated;

commit;