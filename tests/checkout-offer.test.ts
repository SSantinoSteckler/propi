import { test, expect } from '@playwright/test';
import { checkoutOffer } from '../src/lib/billing/checkout-offer';
import catalog from '../src/lib/billing/catalog.json' with { type: 'json' };
import { subscribeSchema } from '../src/lib/billing/http';

test('precio temporal global de AR$ 50 conserva plan comercial de AR$ 14900',()=>{
 expect(checkoutOffer({...catalog,temporaryAmount:50})).toMatchObject({catalog:{amount:50,currency:'ARS'},temporaryPrice:true});
 expect(catalog.amount).toBe(14900);
 expect(checkoutOffer()).toMatchObject({catalog:{amount:14900},temporaryPrice:false});
 expect(catalog).not.toHaveProperty('temporaryAmount');
});

test('importe temporal inválido se rechaza y navegador no puede fijar precio',()=>{
 for(const amount of [0,-1,Infinity,NaN]) expect(()=>checkoutOffer({...catalog,temporaryAmount:amount})).toThrow('INVALID_PRICE_CONFIGURATION');
 for(const payload of [
  {payer_email:'buyer@example.invalid',amount:1},
  {payer_email:'buyer@example.invalid',temporaryAmount:1},
  {payer_email:'buyer@example.invalid',user_id:'11111111-1111-4111-8111-111111111111'},
 ]) expect(subscribeSchema.safeParse(payload).success).toBe(false);
});
