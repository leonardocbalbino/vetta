import type { SharedEnv } from '../env';
import { AsaasPaymentProvider } from './asaas';
import {
  NfeIoInvoiceIssuer,
  UnconfiguredInvoiceIssuer,
  type InvoiceIssuer,
} from './invoice-issuer';

/** Gateway configurado pelo ambiente, ou null (rotas de pagamento respondem 503). */
export function createPaymentProvider(env: SharedEnv): AsaasPaymentProvider | null {
  if (!env.ASAAS_API_KEY || !env.ASAAS_WEBHOOK_TOKEN) return null;
  return new AsaasPaymentProvider({
    baseUrl: env.ASAAS_BASE_URL,
    apiKey: env.ASAAS_API_KEY,
    webhookToken: env.ASAAS_WEBHOOK_TOKEN,
    platformWalletId: env.ASAAS_PLATFORM_WALLET_ID,
    allowProduction: env.NODE_ENV === 'production',
  });
}

export function createInvoiceIssuer(env: SharedEnv): InvoiceIssuer {
  if (!env.NFEIO_API_KEY || !env.NFEIO_COMPANY_ID) return new UnconfiguredInvoiceIssuer();
  return new NfeIoInvoiceIssuer({
    apiKey: env.NFEIO_API_KEY,
    companyId: env.NFEIO_COMPANY_ID,
    cityServiceCode: env.NFEIO_CITY_SERVICE_CODE,
  });
}
