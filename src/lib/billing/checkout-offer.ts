import catalog from './catalog.json' with { type: 'json' };
import { BillingError } from './domain';

type Configuration = { name: string; amount: number; currency: string; temporaryAmount?: number };

// Global, server-controlled temporary price for new no-plan subscriptions.
// The commercial plan remains unchanged. Remove temporaryAmount to restore it.
export function checkoutOffer(configuration: Configuration = catalog) {
  const amount = configuration.temporaryAmount ?? configuration.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw new BillingError('INVALID_PRICE_CONFIGURATION',503);
  return {
    catalog: { name: configuration.name, amount, currency: configuration.currency },
    temporaryPrice: configuration.temporaryAmount !== undefined,
  };
}
