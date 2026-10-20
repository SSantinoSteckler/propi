import { test, expect } from '@playwright/test';
import { logAdminAuthFailure, databaseFailureDiagnostic } from '../src/lib/supabase/admin-diagnostics';
import { createAdminFetch } from '../src/lib/supabase/admin-transport';
import { BillingError } from '../src/lib/billing/domain';
import { billingFailure } from '../src/lib/billing/http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const key = 'sb_secret_fixture_not_real';
const headers = new Headers({apikey:key,'user-agent':'propi-billing-server/1.0 Node.js/test'});

test('401 registra categoría y transporte sin datos privados ni consumir respuesta',async()=>{
 const lines:string[]=[];
 const body={message:`Invalid API key: ${key}`,email:'private@example.invalid',token:'private-token'};
 const response=Response.json(body,{status:401});
 await logAdminAuthFailure(response,key,headers,'/rest/v1/rpc/billing_is_test_owner',line=>{lines.push(line);});
 expect(JSON.parse(lines[0])).toEqual({stage:'supabase_admin_auth',operation:'billing_is_test_owner',http:401,category:'API_KEY_REJECTED',keyType:'secret',apiKeyHeaderMatchesConfigured:true,authorizationHeaderPresent:false,secretKeyUsedAsBearer:false,serverUserAgent:true});
 for (const value of [key,body.email,body.token,body.message]) expect(lines[0]).not.toContain(value);
 expect(await response.json()).toEqual(body);
});

test('clasifica navegador, JWT, permisos y rechazo desconocido sin imprimir mensajes arbitrarios',async()=>{
 for(const [body,status,category] of [
  [{message:'Forbidden use of secret API key in browser'},401,'BROWSER_CONTEXT_REJECTED'],
  [{code:'PGRST301',message:'private provider details'},401,'JWT_REJECTED'],
  [{code:'42501',message:'private database details'},403,'INSUFFICIENT_PERMISSIONS'],
  [{message:'private unrecognized rejection'},401,'AUTH_REJECTION_UNSPECIFIED'],
 ] as const) {
  const lines:string[]=[];
  await logAdminAuthFailure(Response.json(body,{status}),key,headers,'/rest/v1/private-resource?owner=private',line=>{lines.push(line);});
  expect(JSON.parse(lines[0]).category).toBe(category);
  expect(JSON.parse(lines[0]).operation).toBe('other_admin_request');
  expect(lines[0]).not.toContain('private');
 }
});

test('ignora otras respuestas y el logger no altera la respuesta original',async()=>{
 const lines:string[]=[];
 for(const status of [200,400,404,500]) await logAdminAuthFailure(Response.json({},{status}),key,headers,'/',line=>{lines.push(line);});
 expect(lines).toEqual([]);
 const response=Response.json({message:'Invalid API key'},{status:401});
 await logAdminAuthFailure(response,key,headers,'/',()=>{throw new Error('logger failed');});
 expect(await response.json()).toEqual({message:'Invalid API key'});
});

test('cuerpo excesivo se omite sin registrar contenido y conserva respuesta',async()=>{
 const response=Response.json({message:key.repeat(600)},{status:401});
 const lines:string[]=[];
 await logAdminAuthFailure(response,key,headers,'/',line=>{lines.push(line);});
 expect(JSON.parse(lines[0]).category).toBe('ERROR_BODY_TOO_LARGE');
 expect(lines[0]).not.toContain(key);
 expect((await response.json()).message).toBe(key.repeat(600));
});

test('clasificación para la respuesta distingue auth, RPC, permisos y red sin mensajes originales',()=>{
 for(const [status,error,category] of [
  [401,{message:`Invalid API key: ${key}`},'API_KEY_REJECTED'],
  [401,{message:'Invalid JWT',code:'PGRST301'},'JWT_REJECTED'],
  [401,{message:'Unknown unauthorized response'},'AUTH_REJECTION_UNSPECIFIED'],
  [403,{message:'private database details',code:'42501'},'INSUFFICIENT_PERMISSIONS'],
  [404,{message:'private schema details',code:'PGRST202'},'RPC_NOT_AVAILABLE'],
  [404,{message:'private schema details',code:'PGRST205'},'TABLE_NOT_AVAILABLE'],
  [0,{message:'fetch failed with private connection details'},'CONNECTION_FAILED'],
  [503,{message:'private provider details'},'UPSTREAM_UNAVAILABLE'],
 ] as const) {
  const diagnostic=databaseFailureDiagnostic({status,error},'billing_is_test_owner',key);
  expect(diagnostic.category).toBe(category);expect(diagnostic.upstreamStatus).toBe(status);
  expect(JSON.stringify(diagnostic)).not.toContain(key);expect(JSON.stringify(diagnostic)).not.toContain('private');
 }
 const arbitrary=databaseFailureDiagnostic({status:401,error:{code:key,message:key}},'billing_query',key);
 expect(arbitrary.upstreamCode).toBe(null);expect(arbitrary.category).toBe('AUTH_REJECTION_UNSPECIFIED');
});

test('respuesta 503 publica solo diagnóstico sanitizado y versión desplegada; 403 mantiene aislamiento',async()=>{
 const names=['VERCEL_GIT_COMMIT_SHA','VERCEL_ENV','SUPABASE_SECRET_KEY'];
 const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 try {
  process.env.VERCEL_GIT_COMMIT_SHA='a'.repeat(40);process.env.VERCEL_ENV='production';process.env.SUPABASE_SECRET_KEY=key;
  const diagnostic=databaseFailureDiagnostic({status:401,error:{message:`Invalid API key ${key}`,hint:'private hint'}},'billing_is_test_owner',key);
  const response=billingFailure(new BillingError('DATABASE_UNAVAILABLE',503,diagnostic),true);
  expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('no-store');
  const body=await response.json();
  expect(body).toMatchObject({code:'DATABASE_UNAVAILABLE',diagnostic:{version:'billing-db-v2',deploymentCommit:'a'.repeat(40),deploymentEnvironment:'production',adminKeyConfigured:true,configuredKeyType:'secret',operation:'billing_is_test_owner',upstreamStatus:401,category:'API_KEY_REJECTED'}});
  expect(JSON.stringify(body)).not.toContain(key);expect(JSON.stringify(body)).not.toContain('private hint');
  const scope=billingFailure(new BillingError('BILLING_SCOPE_MISMATCH',403),true);
  expect(scope.status).toBe(403);expect(await scope.json()).toMatchObject({code:'BILLING_SCOPE_MISMATCH',diagnostic:{version:'billing-db-v2'}});
  process.env.VERCEL_GIT_COMMIT_SHA='private-invalid-value';process.env.VERCEL_ENV='private-invalid-value';delete process.env.SUPABASE_SECRET_KEY;
  expect((await billingFailure(new BillingError('BILLING_NOT_CONFIGURED',503),true).json()).diagnostic).toMatchObject({deploymentCommit:null,deploymentEnvironment:'local_or_unknown',adminKeyConfigured:false});
  expect(await billingFailure(new BillingError('DATABASE_UNAVAILABLE',503,diagnostic)).json()).not.toHaveProperty('diagnostic');
  expect(await billingFailure(new BillingError('UNAUTHENTICATED',401)).json()).not.toHaveProperty('diagnostic');
 } finally { for(const name of names) { if(before[name]===undefined) delete process.env[name]; else process.env[name]=before[name]; } }
});

test('SDK oficial invoca RPC con sb_secret solo en apikey y sin JWT de usuario',async()=>{
 const result=await promisify(execFile)(process.execPath,[resolve('tests/fixtures/admin-sdk-probe.mjs')]);
 expect(JSON.parse(result.stdout)).toEqual({sdkRpcPassed:true,requests:1});
});

test('transporte legacy reemplaza Bearer heredado y Request no puede inyectar otra credencial',async()=>{
 const legacy='header.payload.signature';
 const send:typeof fetch=async(_input,options)=>{
  const actual=new Headers(options?.headers);
  expect(actual.get('apikey')).toBe(legacy);expect(actual.get('authorization')).toBe(`Bearer ${legacy}`);
  return Response.json(true);
 };
 const request=new Request('https://database.example/rest/v1/rpc/billing_is_test_owner',{method:'POST',headers:{Authorization:'Bearer private-user-session',apikey:'wrong-key'}});
 await createAdminFetch('https://database.example',legacy,send)(request);
});
