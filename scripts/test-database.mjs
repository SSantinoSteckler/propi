import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
// Real PostgreSQL engine in WASM. Auth/Storage schemas and random-byte function are
// test doubles only; production migrations use Supabase and pgcrypto unchanged.
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 create table auth.users(id uuid primary key,instance_id uuid,aud text,role text,email text,email_confirmed_at timestamptz,created_at timestamptz,updated_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode(string_agg(md5(random()::text),''),'hex') from generate_series(1,ceil(n/16.0)::int)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
for (const name of (await readdir("supabase/migrations")).sort()) {
  const sql = (await readFile(`supabase/migrations/${name}`, "utf8")).replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  if (name === "202610200002_billing_isolation.sql") {
    const { testBillingMigration } = await import("./test-billing-migration.mjs");
    await testBillingMigration(pg, sql);
  } else await pg.exec(sql);
  console.log(`Migración aplicada: ${name}`);
}
await pg.exec(await readFile("supabase/seed.sql", "utf8"));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
let count = 0;
async function user(id) {
  await pg.exec(
    `reset role;set request.jwt.claim.sub='${id || ""}';set role ${id ? "authenticated" : "anon"};`,
  );
}
async function admin() {
  await pg.exec("reset role;");
}
async function scalar(sql) {
  return Object.values((await pg.query(sql)).rows[0])[0];
}
async function fails(sql, pattern) {
  await pg.exec("savepoint expected_failure");
  try {
    await assert.rejects(() => pg.exec(sql), pattern);
  } finally {
    await pg.exec("rollback to savepoint expected_failure");
    await pg.exec("release savepoint expected_failure");
  }
}
async function test(name, fn) {
  await admin();
  await pg.exec("begin");
  try {
    await fn();
    console.log(`✓ ${name}`);
    count++;
  } finally {
    await pg.exec("rollback");
    await admin();
  }
}
const insert = (i, status = "disponible") =>
  `insert into public.properties(owner_id,slug,title,description,type,operation,price,currency,province,city,total_area,covered_area,status) values('${A}','test-property-${i}','Propiedad de prueba ${i}','Descripción de una propiedad ficticia de pruebas.','casa','venta',100000,'USD','Buenos Aires','CABA',100,80,'${status}')`;
await test("bootstrap de cuenta y suscripción Free", async () => {
  await pg.exec(
    `insert into auth.users(id,email) values('99999999-9999-4999-8999-999999999999','nuevo@example.invalid')`,
  );
  assert.equal(
    await scalar(
      "select plan from subscriptions where owner_id='99999999-9999-4999-8999-999999999999'",
    ),
    "free",
  );
});
await test("RLS aísla perfiles y propiedades entre agentes", async () => {
  await user(A);
  assert.equal(await scalar("select count(*)::int from profiles"), 1);
  assert.equal(await scalar("select count(*)::int from properties"), 4);
  assert.equal(
    await scalar(`select count(*)::int from properties where owner_id='${B}'`),
    0,
  );
  await fails(
    `update profiles set id='${B}' where id='${A}'`,
    /Propietario inválido|duplicate/i,
  );
  await fails(
    `insert into collections(owner_id,name) values('${B}','Colección ajena')`,
    /permisos|row-level security/i,
  );
});
await test("slugs de perfil únicos y rutas reservadas", async () => {
  await user(A);
  await fails("update profiles set username='tomas-demo'", /unique/i);
  await fails("update profiles set username='dashboard'", /check constraint/i);
});
await test("crear y editar propiedad sin acceder a otra cuenta", async () => {
  await user(A);
  await pg.exec(insert(1, "borrador"));
  await pg.exec(
    "update properties set title='Título editado',status='disponible' where slug='test-property-1'",
  );
  assert.equal(
    await scalar("select title from properties where slug='test-property-1'"),
    "Título editado",
  );
  await pg.exec(
    `update properties set title='Intento ajeno' where owner_id='${B}'`,
  );
  await admin();
  assert.equal(
    await scalar(
      `select count(*)::int from properties where owner_id='${B}' and title='Intento ajeno'`,
    ),
    0,
  );
});
await test("límite Free: 5 publicadas, borradores adicionales permitidos", async () => {
  await user(A);
  await pg.exec(insert(1));
  await fails(insert(2), /límite de 5/);
  await pg.exec(insert(3, "borrador"));
  await fails(
    "update properties set status='disponible' where slug='test-property-3'",
    /límite de 5/,
  );
});
await test("suscripción y personalización no se alteran desde el navegador", async () => {
  await user(A);
  await fails("update subscriptions set plan='pro'", /permission denied/i);
  await fails("update profiles set color='#ff0000'", /requiere Pro/i);
});
await test("plan Pro permite más de 5 propiedades", async () => {
  await pg.exec(`update subscriptions set plan='pro' where owner_id='${A}'`);
  await user(A);
  await pg.exec(insert(1));
  await pg.exec(insert(2));
  assert.equal(await scalar("select count(*)::int from properties"), 6);
});
await test("límite de colección y vínculo entre propietarios", async () => {
  await user(A);
  await fails(
    "insert into collections(name) values('Otra colección')",
    /límite de 1/,
  );
  const c = await scalar("select id from collections");
  const other = "33333333-3333-4333-8333-000000000005";
  await fails(
    `select save_collection('${c}','Selección ajena','',array['${other}'::uuid],true)`,
    /Propiedad ajena/,
  );
});
await test("colección transaccional, orden y token no modificable", async () => {
  await user(A);
  const c = await scalar("select id from collections");
  const p = "33333333-3333-4333-8333-000000000001";
  await pg.exec(
    `select save_collection('${c}','Nueva selección','Descripción',array['${p}'::uuid],true)`,
  );
  assert.equal(
    await scalar("select count(*)::int from collection_properties"),
    1,
  );
  assert.equal(await scalar("select position from collection_properties"), 1);
  await fails(
    "update collections set token=repeat('a',64)",
    /token no se puede/i,
  );
});
await test("lectura pública excluye email, owner_id y dirección privada", async () => {
  await pg.exec(
    `update profiles set published=true where id='${A}';update properties set address='DIRECCION SECRETA' where owner_id='${A}'`,
  );
  await user(null);
  await fails("select * from profiles", /permission denied/i);
  const json = await scalar("select get_portfolio('martina-demo')");
  assert.equal(json.properties.length, 4);
  assert.equal(json.properties[0].address, null);
  assert.equal("owner_id" in json.properties[0], false);
  assert.equal("id" in json.profile, false);
  assert.equal("email" in json.profile, false);
  await admin();
  await pg.exec(
    `update properties set show_address=true where owner_id='${A}'`,
  );
  await user(null);
  assert.equal(
    (await scalar("select get_portfolio('martina-demo')")).properties[0]
      .address,
    "DIRECCION SECRETA",
  );
});
await test("publicar, pausar, archivar y despublicar revocan la lectura pública", async () => {
  await pg.exec(
    `update profiles set published=true where id='${A}';update properties set status='pausada' where owner_id='${A}'`,
  );
  await user(null);
  assert.equal(
    (await scalar("select get_portfolio('martina-demo')")).properties.length,
    0,
  );
  await admin();
  await pg.exec(
    `update properties set status='disponible',archived=true where owner_id='${A}'`,
  );
  await user(null);
  assert.equal(
    (await scalar("select get_portfolio('martina-demo')")).properties.length,
    0,
  );
  await admin();
  await pg.exec(`update profiles set published=false where id='${A}'`);
  await user(null);
  assert.equal(await scalar("select get_portfolio('martina-demo')"), null);
});
await test("colección desactivada no devuelve datos públicos", async () => {
  await pg.exec(`update profiles set published=true where id='${A}'`);
  const token = await scalar(
    `select token from collections where owner_id='${A}'`,
  );
  await user(null);
  assert.equal(
    (await scalar(`select get_collection('${token}')`)).properties.length,
    4,
  );
  await admin();
  await pg.exec(`update collections set active=false where owner_id='${A}'`);
  await user(null);
  assert.equal(await scalar(`select get_collection('${token}')`), null);
});
await test("reseña requiere consentimiento, enlace válido y un solo uso", async () => {
  await user(A);
  const token = await scalar("select create_review_request()");
  await user(null);
  await fails(
    `select submit_review('${token}','Cliente',5,'Experiencia comercial de prueba completa.',false,'')`,
    /Consentimiento/,
  );
  await pg.exec(
    `select submit_review('${token}','Cliente',2,'Experiencia comercial de prueba completa.',true,'')`,
  );
  await fails(
    `select submit_review('${token}','Cliente',5,'Experiencia comercial de prueba completa.',true,'')`,
    /expiró o ya fue utilizado/,
  );
  await admin();
  assert.equal(
    await scalar("select verified from reviews where display_name='Cliente'"),
    false,
  );
});
await test("el agente puede responder y reportar, pero no borrar ni alterar reseñas", async () => {
  await user(A);
  const id = await scalar("select id from reviews limit 1");
  await pg.exec(
    `update reviews set response='Gracias por compartir tu experiencia.' where id='${id}'`,
  );
  await fails(
    `update reviews set rating=5 where id='${id}'`,
    /permission denied/i,
  );
  await fails(
    `update reviews set verified=true where id='${id}'`,
    /permission denied/i,
  );
  await fails(`delete from reviews where id='${id}'`, /permission denied/i);
  await pg.exec(
    `insert into review_reports(review_id,reason) values('${id}','Contenido reportado para revisión independiente.')`,
  );
  assert.equal(
    await scalar(`select status from reviews where id='${id}'`),
    "published",
  );
});
await test("rate limit de solicitudes: 10 por hora", async () => {
  await user(A);
  for (let i = 0; i < 9; i++) await pg.exec("select create_review_request()");
  await fails("select create_review_request()", /Límite de 10/);
});
await test("Storage protege borradores y recursos de otros usuarios", async () => {
  const pid = "33333333-3333-4333-8333-000000000001";
  const path = `${A}/${pid}/image.webp`;
  await pg.exec(
    `insert into property_images(owner_id,property_id,path) values('${A}','${pid}','${path}');insert into storage.objects(bucket_id,name) values('media','${path}')`,
  );
  await user(B);
  assert.equal(await scalar("select count(*)::int from storage.objects"), 0);
  await fails(
    `insert into storage.objects(bucket_id,name) values('media','${A}/ajena.webp')`,
    /row-level security/i,
  );
  await user(null);
  assert.equal(await scalar("select count(*)::int from storage.objects"), 0);
  await admin();
  await pg.exec(`update profiles set published=true where id='${A}'`);
  await user(null);
  assert.equal(await scalar("select count(*)::int from storage.objects"), 1);
  await admin();
  await pg.exec(`update properties set status='borrador' where id='${pid}'`);
  await user(null);
  assert.equal(await scalar("select count(*)::int from storage.objects"), 0);
});
await test("límite de 15 imágenes por propiedad y validación de pertenencia", async () => {
  await user(A);
  for (let i = 0; i < 15; i++)
    await pg.exec(
      `insert into property_images(property_id,path,position) values('33333333-3333-4333-8333-000000000001','${A}/images/${i}.webp',${i})`,
    );
  await fails(
    `insert into property_images(property_id,path) values('33333333-3333-4333-8333-000000000001','${A}/images/extra.webp')`,
    /15 imágenes/,
  );
  await fails(
    `insert into property_images(property_id,path) values('33333333-3333-4333-8333-000000000005','${A}/images/ajena.webp')`,
    /foreign key/i,
  );
});
await test("analítica privada y no escribible por clientes", async () => {
  await user(A);
  await fails(
    `insert into analytics_events(owner_id,kind) values('${A}','portfolio')`,
    /permission denied/i,
  );
  await fails(
    "select record_event('martina-demo','portfolio',null,null,'fingerprint')",
    /permission denied/i,
  );
  await user(null);
  await fails("select * from analytics_events", /permission denied/i);
});
const { billingTests } = await import("./test-billing-database.mjs");
await billingTests({pg, A, B, user, admin, scalar, fails, test, insert});
const { isolationTests } = await import("./test-billing-isolation.mjs");
await isolationTests({pg, A, B, user, admin, scalar, fails, test});
const { compatibilityTests, checkoutOfferTests, netlifyMigrationTests } = await import("./test-billing-compatibility.mjs");
await compatibilityTests({pg, A, B, test, scalar});
await checkoutOfferTests({pg, A, B, test, scalar});
await netlifyMigrationTests({pg, A, B, test, scalar});
console.log(
  `\n${count} pruebas de PostgreSQL/RLS aprobadas. Auth y Storage HTTP requieren Supabase real.`,
);
await pg.close();
