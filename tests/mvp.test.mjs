import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;

const admin = "11111111-1111-4111-8111-111111111111";
const clientA = "22222222-2222-4222-8222-222222222221";
const clientB = "22222222-2222-4222-8222-222222222222";
const merchantUserA = "33333333-3333-4333-8333-333333333331";
const merchantUserB = "33333333-3333-4333-8333-333333333332";
const bankUserA = "44444444-4444-4444-8444-444444444441";
const bankUserB = "44444444-4444-4444-8444-444444444442";

let orgMerchantA, orgMerchantB, orgBankA, orgBankB;
let productA, orderA, appA, offerExpired, offerValid, creditA, inst1;
let reportA, confPay1;

async function as(id, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  await db.exec(
    await readFile(new URL("../supabase/01_schema.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    await readFile(new URL("../supabase/03_ayni_mvp.sql", import.meta.url), "utf8"),
  );

  await db.query(
    `insert into auth.users(id, email, raw_user_meta_data) values
      ($1,'admin@ayni.test','{"full_name":"Admin AYNI"}'),
      ($2,'clientea@ayni.test','{"full_name":"Cliente Uno"}'),
      ($3,'clienteb@ayni.test','{"full_name":"Cliente Dos"}'),
      ($4,'comercioa@ayni.test','{"full_name":"Comercio Uno"}'),
      ($5,'comerciob@ayni.test','{"full_name":"Comercio Dos"}'),
      ($6,'bancoa@ayni.test','{"full_name":"Analista Banco A"}'),
      ($7,'bancob@ayni.test','{"full_name":"Analista Banco B"}')`,
    [admin, clientA, clientB, merchantUserA, merchantUserB, bankUserA, bankUserB],
  );

  await db.query("update public.profiles set role='administrador' where id=$1", [admin]);
  await db.query("update public.profiles set role='comercio' where id in ($1,$2)", [merchantUserA, merchantUserB]);
  await db.query("update public.profiles set role='entidad_financiera' where id in ($1,$2)", [bankUserA, bankUserB]);

  orgMerchantA = (
    await as(admin, "select public.admin_upsert_organization(null,'comercio','Tienda Norte','1010','a@m.test','7001','activa',true) as id")
  ).rows[0].id;
  orgMerchantB = (
    await as(admin, "select public.admin_upsert_organization(null,'comercio','Tienda Sur','2020','b@m.test','7002','activa',true) as id")
  ).rows[0].id;
  orgBankA = (
    await as(admin, "select public.admin_upsert_organization(null,'entidad_financiera','Banco Demo A','3030','a@b.test','7003','activa',true) as id")
  ).rows[0].id;
  orgBankB = (
    await as(admin, "select public.admin_upsert_organization(null,'entidad_financiera','Banco Demo B','4040','b@b.test','7004','activa',true) as id")
  ).rows[0].id;

  await as(admin, "select public.admin_set_org_member($1,$2,'admin_org','activa')", [orgMerchantA, merchantUserA]);
  await as(admin, "select public.admin_set_org_member($1,$2,'admin_org','activa')", [orgMerchantB, merchantUserB]);
  await as(admin, "select public.admin_set_org_member($1,$2,'evaluador','activa')", [orgBankA, bankUserA]);
  await as(admin, "select public.admin_set_org_member($1,$2,'evaluador','activa')", [orgBankB, bankUserB]);

  await as(
    admin,
    "select public.admin_upsert_commission_agreement($1,'v1-demo','porcentaje',0,250,'Comisión demo 2.5%',true)",
    [orgBankA],
  );
});

after(async () => await db.close());

test("1. Cliente no puede crear organizaciones ni asignarse a un banco", async () => {
  await assert.rejects(
    as(clientA, "select public.admin_upsert_organization(null,'comercio','Fake','','','','activa',true)"),
    /Solo un administrador/i,
  );
});

test("2. Cambiar precio del catálogo no altera una orden ya creada y órdenes están aisladas", async () => {
  productA = (
    await as(
      merchantUserA,
      `insert into public.products(merchant_org_id, name, description, price_minor, currency, stock, is_available)
       values ($1, 'Celular Gamma', 'Modelo base', 100000, 'BOB', 5, true) returning id`,
      [orgMerchantA],
    )
  ).rows[0].id;

  orderA = (
    await as(
      clientA,
      "select public.create_purchase_order($1, $2::jsonb) as id",
      [orgMerchantA, JSON.stringify([{ product_id: productA, quantity: 1 }])],
    )
  ).rows[0].id;

  // Comercio sube precio después de creada la orden
  await as(merchantUserA, "update public.products set price_minor = 150000 where id = $1", [productA]);

  const orderRow = (await as(clientA, "select total_minor from public.purchase_orders where id=$1", [orderA])).rows[0];
  assert.equal(Number(orderRow.total_minor), 100000);

  // Aislamiento: Cliente B y Comercio B no ven la orden
  assert.equal((await as(clientB, "select id from public.purchase_orders")).rows.length, 0);
  assert.equal((await as(merchantUserB, "select id from public.purchase_orders")).rows.length, 0);
});

test("3. Aislamiento entre bancos y bloqueo al administrador para evaluar solicitudes", async () => {
  appA = (
    await as(
      clientA,
      "select public.submit_financing_application($1,$2,3,'Necesito 3 cuotas','v1.0-demo') as id",
      [orderA, orgBankA],
    )
  ).rows[0].id;

  // Banco B no ve ni puede evaluar la solicitud dirigida a Banco A
  assert.equal((await as(bankUserB, "select id from public.financing_applications")).rows.length, 0);
  await assert.rejects(
    as(bankUserB, "select public.bank_review_application($1,'en_revision_bancaria','Intento ajeno',null)", [appA]),
    /Solo empleados autorizados/i,
  );

  // Administrador general NO puede aprobar ni emitir ofertas
  await assert.rejects(
    as(admin, "select public.bank_review_application($1,'en_revision_bancaria','Admin no evalúa',null)", [appA]),
    /Solo empleados autorizados/i,
  );
});

test("4. Oferta vencida no puede aceptarse; oferta nueva sustituye la anterior y crea crédito pendiente de formalización", async () => {
  const res1 = (
    await as(
      bankUserA,
      "select public.bank_review_application($1,'emitir_oferta','Primera oferta',$2::jsonb) as res",
      [
        appA,
        JSON.stringify({
          principal_minor: 100000,
          total_payable_minor: 108000,
          installment_count: 3,
          installment_amount_minor: 36000,
          annual_rate_bps: 1200,
        }),
      ],
    )
  ).rows[0].res;
  offerExpired = res1.offer_id;

  // Simulamos vencimiento en DB
  await db.query("update public.financing_offers set expires_at = now() - interval '1 hour' where id=$1", [offerExpired]);

  await assert.rejects(
    as(clientA, "select public.client_respond_offer($1,true,'Acepto')", [offerExpired]),
    /vencido/i,
  );

  // Banco emite nueva oferta vigente (la previa pasa a sustituida)
  const res2 = (
    await as(
      bankUserA,
      "select public.bank_review_application($1,'emitir_oferta','Segunda oferta vigente',$2::jsonb) as res",
      [
        appA,
        JSON.stringify({
          principal_minor: 100000,
          total_payable_minor: 106000,
          installment_count: 2,
          installment_amount_minor: 53000,
          annual_rate_bps: 1000,
        }),
      ],
    )
  ).rows[0].res;
  offerValid = res2.offer_id;

  const oldStatus = (await db.query("select status from public.financing_offers where id=$1", [offerExpired])).rows[0].status;
  assert.equal(oldStatus, "sustituida");

  const acc = (await as(clientA, "select public.client_respond_offer($1,true,'Acepto condiciones') as res", [offerValid])).rows[0].res;
  creditA = acc.credit_id;

  const creditRow = (await as(bankUserA, "select status from public.linked_credits where id=$1", [creditA])).rows[0];
  assert.equal(creditRow.status, "pendiente_formalizacion");
});

test("5. Entrega requiere desembolso; desembolso es idempotente y devenga una sola comisión AYNI", async () => {
  await assert.rejects(
    as(merchantUserA, "select public.merchant_update_order_status($1,'entregada','Antes de desembolso')", [orderA]),
    /desembolso/i,
  );

  await as(bankUserA, "select public.bank_formalize_credit($1,'CRED-DEMO-001')", [creditA]);

  const d1 = (
    await as(bankUserA, "select public.bank_confirm_disbursement($1,'DISB-001',100000,'comercio',now()) as res", [creditA])
  ).rows[0].res;
  assert.equal(d1.duplicate, false);
  assert.ok(d1.commission_entry_id);

  // Repetir el mismo evento externo no duplica desembolso ni comisión
  const d2 = (
    await as(bankUserA, "select public.bank_confirm_disbursement($1,'DISB-001',100000,'comercio',now()) as res", [creditA])
  ).rows[0].res;
  assert.equal(d2.duplicate, true);

  const commRows = (await as(admin, "select commission_minor, status from public.commission_entries where credit_id=$1", [creditA])).rows;
  assert.equal(commRows.length, 1);
  assert.equal(Number(commRows[0].commission_minor), 2500);
  assert.equal(commRows[0].status, "devengada");

  // Comercio puede entregar, y una devolución comercial NO cancela automáticamente la deuda bancaria
  await as(merchantUserA, "select public.merchant_update_order_status($1,'entregada','Entregado con acta')", [orderA]);
  await as(merchantUserA, "select public.merchant_update_order_status($1,'devuelta','Devolución por garantía')", [orderA]);
  const creditStatus = (await as(bankUserA, "select status from public.linked_credits where id=$1", [creditA])).rows[0].status;
  assert.equal(creditStatus, "desembolsado");
});

test("6. Cronograma versionado, separación reporte vs confirmación, idempotencia y reversos", async () => {
  await as(
    bankUserA,
    "select public.bank_publish_schedule($1,'Cronograma v1',$2::jsonb)",
    [creditA, JSON.stringify([{ installment_number: 1, due_date: "2026-12-20", amount_minor: 53000 }])],
  );
  const sched2 = (
    await as(
      bankUserA,
      "select public.bank_publish_schedule($1,'Cronograma v2',$2::jsonb) as id",
      [
        creditA,
        JSON.stringify([
          { installment_number: 1, due_date: "2026-12-20", amount_minor: 53000 },
          { installment_number: 2, due_date: "2027-01-20", amount_minor: 53000 },
        ]),
      ],
    )
  ).rows[0].id;

  // Se conservan ambas versiones
  const versions = (await as(bankUserA, "select version_number, is_current from public.schedule_versions where credit_id=$1 order by version_number", [creditA])).rows;
  assert.equal(versions.length, 2);
  assert.equal(versions[0].is_current, false);
  assert.equal(versions[1].is_current, true);

  inst1 = (await as(clientA, "select id from public.installments where schedule_version_id=$1 and installment_number=1", [sched2])).rows[0].id;

  // Reporte del cliente NO marca la cuota como pagada
  reportA = (
    await as(clientA, "select public.client_submit_payment_report($1,$2,53000,'2026-12-18','COMP-99','Pagué por QR bancario') as id", [creditA, inst1])
  ).rows[0].id;
  assert.equal((await as(clientA, "select status from public.installments where id=$1", [inst1])).rows[0].status, "pendiente");

  // Administrador general NO puede confirmar pagos bancarios
  await assert.rejects(
    as(admin, "select public.bank_confirm_payment($1,'PAY-ADMIN',53000,now(),$2::jsonb,$3,'')", [
      creditA,
      JSON.stringify([{ installment_id: inst1, amount_minor: 53000 }]),
      reportA,
    ]),
    /Solo la entidad financiera/i,
  );

  // Banco confirma pago (y repetir el mismo evento externo es idempotente)
  const p1 = (
    await as(bankUserA, "select public.bank_confirm_payment($1,'PAY-001',53000,'2026-12-18T12:00:00Z',$2::jsonb,$3,'OK') as res", [
      creditA,
      JSON.stringify([{ installment_id: inst1, amount_minor: 53000 }]),
      reportA,
    ])
  ).rows[0].res;
  confPay1 = p1.confirmation_id;
  assert.equal(p1.duplicate, false);

  const p2 = (
    await as(bankUserA, "select public.bank_confirm_payment($1,'PAY-001',53000,'2026-12-18T12:00:00Z',$2::jsonb,$3,'Reintento') as res", [
      creditA,
      JSON.stringify([{ installment_id: inst1, amount_minor: 53000 }]),
      reportA,
    ])
  ).rows[0].res;
  assert.equal(p2.duplicate, true);

  const instPaid = (await as(clientA, "select paid_minor, status from public.installments where id=$1", [inst1])).rows[0];
  assert.equal(Number(instPaid.paid_minor), 53000);
  assert.equal(instPaid.status, "pagada");

  // Reverso preserva original y actualiza cuota
  await as(bankUserA, "select public.bank_reverse_payment($1,'REV-001','Error de conciliación')", [confPay1]);
  const instAfterRev = (await as(clientA, "select paid_minor, status from public.installments where id=$1", [inst1])).rows[0];
  assert.equal(Number(instAfterRev.paid_minor), 0);
  assert.equal(instAfterRev.status, "pendiente");
  assert.equal((await as(bankUserA, "select id from public.bank_payment_confirmations where credit_id=$1", [creditA])).rows.length, 2);

  // Comercio NO puede leer cuotas ni confirmaciones bancarias del cliente
  assert.equal((await as(merchantUserA, "select id from public.installments")).rows.length, 0);
  assert.equal((await as(merchantUserA, "select id from public.bank_payment_confirmations")).rows.length, 0);
});

test("7. Compartir cumplimiento con otra entidad exige consentimiento vigente y deja auditoría de acceso", async () => {
  await assert.rejects(
    as(bankUserB, "select public.bank_read_authorized_compliance($1,$2)", [clientA, orgBankB]),
    /autorización vigente/i,
  );

  await as(clientA, "select public.client_manage_consent($1,'consulta_cumplimiento_nueva_oportunidad',30,null)", [orgBankB]);

  const summary = (
    await as(bankUserB, "select public.bank_read_authorized_compliance($1,$2) as s", [clientA, orgBankB])
  ).rows[0].s;
  assert.equal(typeof summary.confirmed_installments, "number");
  assert.match(summary.disclaimer, /No constituyen scoring/i);

  const accessAudit = (await as(clientA, "select id from public.data_access_audit where accessor_org_id=$1", [orgBankB])).rows;
  assert.equal(accessAudit.length, 1);
});