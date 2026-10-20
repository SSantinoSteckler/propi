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
async function command(args:string[]) {
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://billing-test.supabase.co',SUPABASE_SECRET_KEY:'test-secret-not-real',MERCADOPAGO_ACCESS_TOKEN:'test-token-not-real',NEXT_PUBLIC_SITE_URL:'https://propi.example',MERCADOPAGO_PRO_PLAN_ID:'',BILLING_PLAN_TEST_STATE:join(folder,'state.json')};
 try {const result=await exec(process.execPath,['--import',pathToFileURL(resolve('tests/fixtures/billing-plan-provider.mjs')).href,'scripts/billing-plan.mjs',...args],{env});return {...result,code:0};}
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
