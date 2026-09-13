import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db;
const admin = "11111111-1111-4111-8111-111111111111";
const client = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
async function as(id, sql) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
const update = (id, role, status = "activo") =>
  `select public.admin_update_user('${id}','Usuario de prueba','','${role}','${status}',false)`;
before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/01_schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values ($1,'admin@example.test','{"full_name":"Admin prueba"}'),($2,'cliente@example.test','{"full_name":"Cliente prueba","role":"administrador","status":"activo"}'),($3,'comercio@example.test','{"full_name":"Comercio prueba"}')`,
    [admin, client, other],
  );
  await db.query(
    "update public.profiles set role='administrador' where id=$1",
    [admin],
  );
});
after(async () => await db.close());
test("Registro ignora el rol administrador inyectado en metadatos", async () => {
  const { rows } = await db.query(
    "select role from public.profiles where id=$1",
    [client],
  );
  assert.equal(rows[0].role, "cliente");
});
test("Cliente solamente puede leer su perfil", async () => {
  const { rows } = await as(client, "select id from public.profiles");
  assert.deepEqual(
    rows.map((x) => x.id),
    [client],
  );
});
test("Cliente no puede promoverse mediante UPDATE directo", async () => {
  await assert.rejects(
    as(
      client,
      `update public.profiles set role='administrador' where id='${client}'`,
    ),
    /permission denied/i,
  );
});
test("Cliente no puede promoverse mediante RPC", async () => {
  await assert.rejects(
    as(client, update(client, "administrador")),
    /Solo un administrador/i,
  );
});
test("Cliente puede editar nombre y teléfono, no otro perfil", async () => {
  await as(
    client,
    `update public.profiles set full_name='Cliente actualizado',phone='71234567' where id='${client}'`,
  );
  const result = await as(
    client,
    `update public.profiles set full_name='Alterado' where id='${admin}' returning id`,
  );
  assert.equal(result.rows.length, 0);
  const { rows } = await db.query(
    "select full_name from public.profiles where id=$1",
    [client],
  );
  assert.equal(rows[0].full_name, "Cliente actualizado");
});
test("Administrador puede leer todas las cuentas y promover roles", async () => {
  const result = await as(admin, "select id from public.profiles");
  assert.equal(result.rows.length, 3);
  await as(admin, update(other, "comercio"));
  await as(admin, update(other, "entidad_financiera"));
  const { rows } = await db.query(
    "select role from public.profiles where id=$1",
    [other],
  );
  assert.equal(rows[0].role, "entidad_financiera");
});
test("Administrador no puede cambiar su rol, desactivarse ni darse de baja", async () => {
  await assert.rejects(as(admin, update(admin, "cliente")), /propio rol/i);
  await assert.rejects(
    as(admin, update(admin, "administrador", "inactivo")),
    /propio rol/i,
  );
  await assert.rejects(
    as(
      admin,
      `select public.admin_update_user('${admin}',null,null,null,null,true)`,
    ),
    /propio rol/i,
  );
});
test("Desactivado pierde facultades administrativas y edición", async () => {
  await as(admin, update(other, "administrador"));
  await as(admin, update(other, "administrador", "inactivo"));
  await assert.rejects(
    as(other, update(client, "comercio")),
    /Solo un administrador/i,
  );
  const { rows } = await as(
    other,
    `update public.profiles set full_name='No permitido' where id='${other}' returning id`,
  );
  assert.equal(rows.length, 0);
});
test("Baja lógica conserva perfil, fecha e historial", async () => {
  await as(
    admin,
    `select public.admin_update_user('${other}',null,null,null,null,true)`,
  );
  const { rows } = await db.query(
    "select status,deleted_at from public.profiles where id=$1",
    [other],
  );
  assert.equal(rows[0].status, "eliminado");
  assert.ok(rows[0].deleted_at);
  const audit = await db.query(
    "select actor_id from public.user_audit where target_id=$1 and action='usuario_dado_de_baja'",
    [other],
  );
  assert.equal(audit.rows[0].actor_id, admin);
});
test("Solo administrador consulta auditoría; nadie la reescribe desde cliente", async () => {
  const clientAudit = await as(client, "select * from public.user_audit");
  assert.equal(clientAudit.rows.length, 0);
  const adminAudit = await as(admin, "select * from public.user_audit");
  assert.ok(adminAudit.rows.length > 0);
  await assert.rejects(
    as(admin, "delete from public.user_audit"),
    /permission denied/i,
  );
});
test("Anónimo no puede leer perfiles ni ejecutar cambios", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.query("select * from public.profiles"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query(update(admin, "cliente")),
      /permission denied/i,
    );
  } finally {
    await db.exec("reset role");
  }
});
