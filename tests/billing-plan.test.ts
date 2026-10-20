import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
let folder:string;
test.beforeEach(async()=>{folder=await mkdtemp(join(tmpdir(),'propi-plan-test-'));await writeFile(join(folder,'state.json'),'{}');});
test.afterEach(async()=>{
 if (!folder) return;
 const target=resolve(folder);
 if (dirname(target)!==resolve(tmpdir()) || !basename(target).startsWith('propi-plan-test-')) throw new Error('Unexpected test cleanup path');
 await rm(target,{recursive:true,force:true});
});
const state = async()=>JSON.parse(await readFile(join(folder,'state.json'),'utf8'));
async function command(args:string[], isolated=true, extraEnv:Record<string,string>={}) {
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://billing-test.supabase.co',SUPABASE_SECRET_KEY:'test-secret-not-real',MERCADOPAGO_ACCESS_TOKEN:'test-token-not-real',NEXT_PUBLIC_SITE_URL:'https://propi.example',MERCADOPAGO_PRO_PLAN_ID:'',BILLING_PLAN_TEST_STATE:join(folder,'state.json'),...extraEnv};
 try {const result=await exec(process.execPath,['--import',pathToFileURL(resolve('tests/fixtures/billing-plan-provider.mjs')).href,resolve('scripts/billing-plan.mjs'),...args],{env,cwd:isolated?folder:process.cwd()});return {...result,code:0};}
 catch(error){const result=error as {stdout:string;stderr:string;code:number};return result;}
}
test('vista previa del plan no hace llamadas externas ni revela el token',async()=>{
 const result=await command(['--dry-run']);expect(result.code).toBe(0);
 const preview=JSON.parse(result.stdout);expect(preview.externalRequests).toBe(0);expect(preview.accessTokenConfigured).toBe(true);
 expect(preview.request.body).toEqual({reason:'Propi Premium',auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:14900,currency_id:'ARS'},back_url:'https://propi.example/dashboard/billing/return'});
 expect(result.stdout).not.toContain('test-token-not-real');expect(await state()).toEqual({});
});
test('crear repetidamente reutiliza el ID y validar sin opciones no escribe',async()=>{
 expect((await command(['--create'])).code).toBe(0);expect((await state()).registry.provider_plan_id).toBe('test-plan-123');
 expect((await command(['--create'])).code).toBe(0);expect((await state()).creates).toBe(1);
 const writes=(await state()).registryWrites;
 const validation=await command([]);expect(validation.code).toBe(0);expect(validation.stdout).toContain('MERCADOPAGO_PRO_PLAN_ID=test-plan-123');expect((await state()).registryWrites).toBe(writes);
});
test('un POST ambiguo no se repite y requiere recuperación explícita',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({scenario:'ambiguous'}));
 expect((await command(['--create'])).code).not.toBe(0);
 const retry=await command(['--create']);expect(retry.code).not.toBe(0);expect(retry.stderr).toContain('--adopt');expect((await state()).creates).toBe(1);
 expect((await command(['--adopt','test-plan-123'])).code).toBe(0);expect((await state()).registry.provider_plan_id).toBe('test-plan-123');
});
test('se guarda el ID antes de verificarlo y una falla del GET no duplica planes',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({scenario:'verification-failure'}));
 expect((await command(['--create'])).code).not.toBe(0);expect((await state()).registry.provider_plan_id).toBe('test-plan-123');
 expect((await command(['--create'])).code).toBe(0);expect((await state()).creates).toBe(1);
});
test('verificar vendedor consulta únicamente su identidad y no crea recursos',async()=>{
 const result=await command(['--verify-seller'],true);expect(result.code).toBe(0);
 expect(JSON.parse(result.stdout)).toMatchObject({id:101,site_id:'MLA',argentineTestAccountConfirmed:true,resourcesCreated:0});
 expect(await state()).toEqual({requests:1});expect(result.stdout).not.toContain('test-token-not-real');
});
test('verificar vendedor no da por ficticia una cuenta sin marcador de prueba',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({scenario:'real-account'}));
 const result=await command(['--verify-seller'],true);expect(result.code).not.toBe(0);
 expect(JSON.parse(result.stdout).argentineTestAccountConfirmed).toBe(false);
 expect((await state()).creates).toBeUndefined();expect((await state()).registryWrites).toBeUndefined();
});
test('un token que reemplaza el de .env.local impide incluso consultar al proveedor',async()=>{
 await writeFile(join(folder,'.env.local'),'MERCADOPAGO_ACCESS_TOKEN=another-test-token-not-real\n');
 const result=await command(['--verify-seller'],true);expect(result.code).not.toBe(0);
 expect(await state()).toEqual({});expect(result.stderr).not.toContain('another-test-token-not-real');
});
test('diagnóstico lee una tabla vacía sin crear filas ni llamar a Mercado Pago',async()=>{
 const result=await command(['--diagnose']);expect(result.code).toBe(0);
 expect(result.stdout).toContain('"registryAccessible": true');expect(result.stdout).toContain('"registryRowExists": false');
 expect(await state()).toEqual({requests:1});expect(result.stdout).not.toContain('test-secret-not-real');
});
test('SDK y transporte envían sb_secret únicamente en apikey durante el diagnóstico',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({captureAuth:true}));
 const key='sb_secret_fixture_not_real';
 const result=await command(['--diagnose'],true,{SUPABASE_SECRET_KEY:key});expect(result.code).toBe(0);
 expect((await state()).requestAuthentication).toEqual([{apiKeyMatchesConfigured:true,authorizationHeaderPresent:false,authorizationMatchesConfiguredBearer:false}]);
 expect(result.stdout).toContain('"projectKeyValidatedByApi": true');expect(result.stdout).toContain('"secretKeyUsedAsBearer": false');
 expect(result.stdout+result.stderr).not.toContain(key);expect((await state()).requests).toBe(1);expect((await state()).registryWrites).toBeUndefined();
});
test('el diagnóstico mantiene apikey y Bearer JWT para service_role legacy',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({captureAuth:true}));
 const key=`header.${Buffer.from(JSON.stringify({role:'service_role',ref:'billing-test'})).toString('base64url')}.signature`;
 const result=await command(['--diagnose'],true,{SUPABASE_SECRET_KEY:key});expect(result.code).toBe(0);
 expect((await state()).requestAuthentication).toEqual([{apiKeyMatchesConfigured:true,authorizationHeaderPresent:true,authorizationMatchesConfiguredBearer:true}]);
 expect(result.stdout+result.stderr).not.toContain(key);
});
test('diagnóstico ejecuta GET desde Node con User-Agent de servidor y ruta REST correcta',async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({captureTransport:true}));
 const result=await command(['--diagnose'],true,{SUPABASE_SECRET_KEY:'sb_secret_fixture_not_real'});expect(result.code).toBe(0);
 const captured=(await state()).transport;
 expect(captured.method).toBe('GET');expect(captured.path).toBe('/rest/v1/billing_plan_registry');expect(captured.userAgent).toMatch(/^propi-billing-admin\/1\.0 Node\.js\//);
 expect(result.stdout).toContain('"engine": "node"');expect(result.stdout).toContain('"browserGlobalsPresent": false');expect(result.stdout).toContain('"restEndpointCorrect": true');expect(result.stdout).toContain('"httpStatus": 200');
 expect((await state()).registryWrites).toBeUndefined();expect((await state()).creates).toBeUndefined();
});
for(const [scenario,category,kind] of [
 ['db-browser','BROWSER_USER_AGENT_BLOCK','BROWSER_USER_AGENT_BLOCK'],
 ['db-invalid-api-key','INVALID_CREDENTIALS','API_KEY_REJECTED'],
 ['db-unknown-401','AUTHENTICATION_REJECTED','AUTHENTICATION_REJECTED_UNSPECIFIED'],
]) test(`HTTP 401 distingue ${kind} conservando el status y sin revelar el cuerpo`,async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({scenario}));
 const key='sb_secret_fixture_not_real';
 const result=await command(['--diagnose'],true,{SUPABASE_SECRET_KEY:key});expect(result.code).not.toBe(0);
 expect(result.stdout).toContain('"httpStatus": 401');expect(result.stdout).toContain(`"authFailureKind": "${kind}"`);expect(result.stderr).toContain(category);
 expect(result.stdout+result.stderr).not.toContain(key);expect(result.stdout+result.stderr).not.toContain('private-provider-detail');
 expect((await state()).registryWrites).toBeUndefined();expect((await state()).creates).toBeUndefined();
});
for (const [scenario,category,code] of [
 ['db-table-missing','TABLE_NOT_FOUND','PGRST205'],
 ['db-function-missing','FUNCTION_NOT_FOUND','PGRST202'],
 ['db-permissions','INSUFFICIENT_PERMISSIONS','42501'],
 ['db-credentials','INVALID_CREDENTIALS','PGRST301'],
 ['db-connection','CONNECTION_ERROR','EACCES'],
 ['db-other','SUPABASE_ERROR','23505'],
]) test(`diagnóstico distingue ${category} sin modificar datos ni revelar errores privados`,async()=>{
 await writeFile(join(folder,'state.json'),JSON.stringify({scenario}));
 const result=await command(['--diagnose']);expect(result.code).not.toBe(0);
 expect(result.stderr).toContain(category);expect(result.stderr).toContain(code);expect(result.stderr).not.toContain('private-provider-detail');
 expect(result.stderr).not.toContain('test-secret-not-real');expect((await state()).registryWrites).toBeUndefined();expect((await state()).creates).toBeUndefined();
});
