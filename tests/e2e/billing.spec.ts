import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { BillingStatus } from '../../src/lib/billing/types';
const free:BillingStatus={catalog:{name:'Propi Premium',amount:14900,currency:'ARS'},available:true,entitlements:{plan:'free',premium:false,access_until:null},agreement:null,payments:[]};
// Network fixtures only in the browser test. Never authenticate or charge a real account.
async function login(page:Page,state:()=>BillingStatus){
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const user={id,aud:'authenticated',role:'authenticated',email:'billing-test@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test-signature`;
 await page.route('**/auth/v1/**',async route=>{
  if(route.request().url().includes('/token'))await route.fulfill({json:{access_token:jwt,token_type:'bearer',expires_in:3600,refresh_token:'test-refresh',user}});
  else await route.fulfill({json:user});
 });
 await page.route('**/rest/v1/**',async route=>{
  const url=route.request().url();
  const body=url.includes('/profiles')?{id,first_name:'Agente',last_name:'Prueba',username:'agente-prueba',onboarding_step:4,avatar_path:null}:url.includes('/rpc/get_user_entitlements')?state().entitlements:[];
  await route.fulfill({json:body});
 });
 await page.route('**/api/billing/status*',route=>route.fulfill({json:state()}));
 await page.goto('/login');
 test.skip(await page.getByRole('button',{name:'Ingresar',exact:true}).isDisabled(),'La configuración pública de Supabase es necesaria para inicializar su SDK; el tráfico se simula en estas pruebas.');
 await page.getByLabel('Email',{exact:true}).fill(user.email);
 await page.getByLabel('Contraseña',{exact:true}).fill('ClavePrueba!2026');
 await page.getByRole('button',{name:'Ingresar',exact:true}).click();
 await expect(page).toHaveURL('/dashboard');
 await page.goto('/dashboard/billing');
 await expect(page.getByRole('heading',{name:'Planes y facturación'})).toBeVisible();
}
test('facturación Free: precio, email explícito y checkout oficial sin duplicar clics',async({page})=>{
 await login(page,()=>free);
 await expect(page.getByRole('heading',{name:'Free',exact:true})).toBeVisible();
 await expect(page.locator('.billing-price')).toContainText('14.900');
 const email=page.getByLabel('Email de tu cuenta de Mercado Pago'); await expect(email).toHaveValue('');
 await email.fill('comprador-prueba@example.invalid');
 let requests=0;
 await page.route('**/api/billing/subscribe',async route=>{
  requests++;expect(route.request().postDataJSON()).toEqual({payer_email:'comprador-prueba@example.invalid'});
  await route.fulfill({json:{checkout_url:'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=test-only'}});
 });
 await page.route('https://www.mercadopago.com.ar/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Checkout simulado exclusivamente en el test</h1>'}));
 await page.getByRole('button',{name:'Contratar Premium'}).click();
 await expect(page).toHaveURL(/mercadopago\.com\.ar\/subscriptions\/checkout/); expect(requests).toBe(1);
});
test('retorno pendiente no activa Premium y cancelación conserva cobertura pagada',async({page})=>{
 let state:BillingStatus={...free,agreement:{id:'agreement',amount:14900,currency:'ARS',status:'authorized',creation_state:'ready',next_payment_date:null,last_synced_at:null,sync_error:false}};
 await login(page,()=>state);
 await page.goto('/dashboard/billing/return');
 await expect(page.getByRole('heading',{name:'Free',exact:true})).toBeVisible();
 await expect(page.getByText('La autorización está registrada.',{exact:false})).toBeVisible();
 state={...state,entitlements:{plan:'pro',premium:true,access_until:'2026-12-01T03:00:00Z'}};
 await page.getByRole('button',{name:'Actualizar estado'}).click();
 await expect(page.getByRole('heading',{name:'Premium',exact:true})).toBeVisible();
 await page.route('**/api/billing/cancel',async route=>{
  expect(route.request().postDataJSON()).toEqual({confirm:true});
  state={...state,agreement:{...state.agreement!,status:'cancelled'}};
  await route.fulfill({json:{canceled:true}});
 });
 await page.getByRole('button',{name:'Cancelar renovación'}).click();
 await page.getByRole('button',{name:'Confirmar cancelación'}).click();
 await expect(page.getByText('La renovación está cancelada.',{exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Premium',exact:true})).toBeVisible();
 await expect(page.getByText('Acceso ya abonado hasta el',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

