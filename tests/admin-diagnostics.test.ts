import { test, expect } from '@playwright/test';
import { logAdminAuthFailure } from '../src/lib/supabase/admin-diagnostics';

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
