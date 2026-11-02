/**
 * Emissão de nota fiscal de serviço (NFS-e) da Vetta para o personal.
 * Implementação NFE.io; sem chave configurada, a emissão fica PENDING_CONFIG.
 */

export interface FiscalBorrower {
  name: string;
  federalTaxNumber: string;
  email: string;
  address?: {
    postalCode: string;
    street?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
}

export interface IssueInput {
  /** Id idempotente (nossa fatura). */
  externalId: string;
  amountCents: number;
  description: string;
  borrower: FiscalBorrower;
}

export type FiscalStatus = 'PROCESSING' | 'ISSUED' | 'FAILED' | 'CANCELED';

export interface FiscalResult {
  externalId: string;
  status: FiscalStatus;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  error: string | null;
}

export interface InvoiceIssuer {
  readonly configured: boolean;
  issue(input: IssueInput): Promise<FiscalResult>;
  get(externalId: string): Promise<FiscalResult>;
}

export class UnconfiguredInvoiceIssuer implements InvoiceIssuer {
  readonly configured = false;
  issue(): Promise<FiscalResult> {
    throw new Error('Emissor de NFS-e não configurado (NFEIO_API_KEY e NFEIO_COMPANY_ID).');
  }
  get(): Promise<FiscalResult> {
    throw new Error('Emissor de NFS-e não configurado.');
  }
}

export interface NfeIoConfig {
  apiKey: string;
  companyId: string;
  /** Código do serviço na prefeitura (LC 116), definido com a contabilidade. */
  cityServiceCode: string;
  baseUrl?: string;
}

const FLOW: Record<string, FiscalStatus> = {
  Issued: 'ISSUED',
  IssueFailed: 'FAILED',
  Cancelled: 'CANCELED',
  CancelFailed: 'ISSUED',
};

interface NfeIoInvoice {
  id: string;
  flowStatus?: string;
  flowMessage?: string;
  number?: number | string | null;
}

export class NfeIoInvoiceIssuer implements InvoiceIssuer {
  readonly configured = true;
  private readonly base: string;

  constructor(private readonly config: NfeIoConfig) {
    this.base = `${config.baseUrl ?? 'https://api.nfe.io/v1'}/companies/${config.companyId}/serviceinvoices`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: this.config.apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`NFE.io respondeu ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  private map(n: NfeIoInvoice): FiscalResult {
    const status = FLOW[n.flowStatus ?? ''] ?? 'PROCESSING';
    return {
      externalId: n.id,
      status,
      number: n.number ? String(n.number) : null,
      pdfUrl: status === 'ISSUED' ? `${this.base}/${n.id}/pdf` : null,
      xmlUrl: status === 'ISSUED' ? `${this.base}/${n.id}/xml` : null,
      error: status === 'FAILED' ? (n.flowMessage ?? 'Falha na emissão') : null,
    };
  }

  async issue(input: IssueInput) {
    const n = await this.call<NfeIoInvoice>('POST', '', {
      cityServiceCode: this.config.cityServiceCode,
      description: input.description,
      servicesAmount: Number((input.amountCents / 100).toFixed(2)),
      externalId: input.externalId,
      borrower: {
        name: input.borrower.name,
        federalTaxNumber: Number(input.borrower.federalTaxNumber),
        email: input.borrower.email,
        address: input.borrower.address
          ? {
              country: 'BRA',
              postalCode: input.borrower.address.postalCode,
              street: input.borrower.address.street,
              number: input.borrower.address.number,
              district: input.borrower.address.district,
              city: { name: input.borrower.address.city },
              state: input.borrower.address.state,
            }
          : undefined,
      },
    });
    return this.map(n);
  }

  async get(externalId: string) {
    return this.map(await this.call<NfeIoInvoice>('GET', `/${externalId}`));
  }
}
