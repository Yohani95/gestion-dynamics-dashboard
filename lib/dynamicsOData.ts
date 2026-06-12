import { query } from "@/lib/db";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

/** bc-api = API v2.0 (Ges_EnviaVenta_Dyn), bc-odata = ODataV4 Company(...), fo = Finance & Operations */
export type DynamicsODataMode = "bc-api" | "bc-odata" | "fo";

export type DynamicsODataConfig = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  baseUrl: string;
  mode: DynamicsODataMode;
  salesEntity: string;
  creditEntity: string;
  salesFilterField: string;
};

export type BcLineaDetalle = {
  secuencia: number | string;
  producto?: string;
  descripcion?: string;
  cantidad?: number;
  precioUnitario?: number;
  monto?: number;
};

export type BcDocumentoVista = {
  numeroBc: string;
  estado: string;
  estadoLabel: string;
  cliente?: string;
  rutCliente?: string;
  fecha?: string;
  montoTotal?: number;
  moneda?: string;
  cantidadLineas: number;
  lineas: BcLineaDetalle[];
};

export type DynamicsODataVerificacion = {
  configurado: boolean;
  tokenOk: boolean;
  consultado: boolean;
  encontrado: boolean;
  error?: string;
  odataUrl?: string;
  registro?: Record<string, unknown>;
  resumen?: string;
  vista?: BcDocumentoVista;
};

const BC_STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Open: "Abierto",
  Paid: "Pagado",
  Canceled: "Anulado",
  Corrective: "Correctivo",
};

function trimEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function isPlaceholderDynamicsUrl(value: string): boolean {
  const v = value.toLowerCase();
  return (
    !value ||
    v.includes("tu-entorno") ||
    v.includes("tu_entorno") ||
    v.includes("your-environment") ||
    v.includes("example.com") ||
    v.includes("reemplazar") ||
    v.includes("pendiente")
  );
}

function extractTenantFromTokenUrl(): string {
  const url = trimEnv("DYNAMICS_TOKEN_URL");
  const match = url.match(/login\.microsoftonline\.com\/([0-9a-f-]+)\//i);
  return match?.[1] ?? "";
}

function resolveODataBaseUrl(): string {
  const explicit = trimEnv("DYNAMICS_ODATA_BASE_URL").replace(/\/$/, "");
  if (explicit) return explicit;

  const tenant = trimEnv("DYNAMICS_BC_TENANT_ID") || extractTenantFromTokenUrl();
  const environment = trimEnv("DYNAMICS_BC_ENVIRONMENT") || "Production";
  if (tenant) {
    return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/api/v2.0`;
  }

  const company = trimEnv("DYNAMICS_BC_COMPANY");
  if (company) {
    const companySegment = `Company('${company.replace(/'/g, "''")}')`;
    return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/ODataV4/${companySegment}`;
  }

  return "";
}

function detectODataMode(baseUrl: string, scope: string): DynamicsODataMode {
  const hint = `${baseUrl} ${scope}`.toLowerCase();
  if (!hint.includes("businesscentral")) return "fo";
  if (baseUrl.includes("/api/v2.0")) return "bc-api";
  return "bc-odata";
}

export function getDynamicsODataConfig(): DynamicsODataConfig | null {
  const tokenUrl = trimEnv("DYNAMICS_TOKEN_URL");
  const clientId = trimEnv("DYNAMICS_CLIENT_ID");
  const clientSecret = trimEnv("DYNAMICS_CLIENT_SECRET");
  const scope = trimEnv("DYNAMICS_SCOPE");
  const baseUrl = resolveODataBaseUrl();
  const mode = detectODataMode(baseUrl, scope);

  const salesEntity =
    trimEnv("DYNAMICS_ODATA_SALES_ENTITY") ||
    (mode === "bc-api" ? "salesInvoices" : mode === "bc-odata" ? "Sales_Invoice_Excel" : "SalesInvoiceHeadersV2");
  const creditEntity =
    trimEnv("DYNAMICS_ODATA_CREDIT_ENTITY") ||
    (mode === "bc-api" ? "salesCreditMemos" : mode === "bc-odata" ? "Posted_Sales_Credit_Memo_Excel" : "SalesInvoiceHeadersV2");
  const salesFilterField =
    trimEnv("DYNAMICS_ODATA_SALES_FILTER_FIELD") ||
    (mode === "fo" ? "InvoiceId" : mode === "bc-api" ? "number" : "No");

  if (
    !tokenUrl ||
    !clientId ||
    !clientSecret ||
    !scope ||
    !baseUrl ||
    isPlaceholderDynamicsUrl(scope) ||
    isPlaceholderDynamicsUrl(baseUrl)
  ) {
    return null;
  }

  return {
    tokenUrl,
    clientId,
    clientSecret,
    scope,
    baseUrl,
    mode,
    salesEntity,
    creditEntity,
    salesFilterField,
  };
}

export function isDynamicsODataConfigured(): boolean {
  return getDynamicsODataConfig() != null;
}

/** Mismo formato que Ges_EnviaVenta_Dyn: 39-BLE, 33-FCV, 61-NCV */
export function formatBcDocumentNumber(tipo: string | undefined, numero: string): string {
  const n = String(numero ?? "").trim();
  const t = (tipo ?? "").trim().toUpperCase();
  if (t === "BLE") return `39-${n}`;
  if (t === "FCV") return `33-${n}`;
  if (t === "NCV") return `61-${n}`;
  return n;
}

async function resolveBcCompanyId(codEmpresa: string | undefined, instance?: string): Promise<string | null> {
  const cod = (codEmpresa ?? "").trim();
  if (!cod) return trimEnv("DYNAMICS_BC_COMPANY_ID") || null;

  const rows = await query<{ Id_Dynamics: string | null }[]>(
    `SELECT TOP 1 Id_Dynamics
     FROM Ges_Empresas WITH (NOLOCK)
     WHERE Cod_Empresa = TRY_CAST(@cod AS uniqueidentifier)`,
    { cod },
    instance,
  );

  const id = rows[0]?.Id_Dynamics?.trim();
  return id || trimEnv("DYNAMICS_BC_COMPANY_ID") || null;
}

async function fetchAccessToken(config: DynamicsODataConfig): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: config.scope,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const raw = await response.text();
  let json: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Token Dynamics: respuesta no JSON (${response.status}).`);
  }

  if (!response.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? raw.slice(0, 300);
    throw new Error(`Token Dynamics fallo (${response.status}): ${detail}`);
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3599;
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return json.access_token;
}

function entityForTipo(config: DynamicsODataConfig, tipo?: string): string {
  const t = (tipo ?? "").trim().toUpperCase();
  if (t === "NCV") return config.creditEntity;
  return config.salesEntity;
}

const BC_LINE_SELECT =
  "sequence,lineObjectNumber,description,quantity,unitPrice,amountIncludingTax,lineType";

function expandForBcApi(config: DynamicsODataConfig, entity: string): string | undefined {
  if (config.mode !== "bc-api") return undefined;
  if (entity === "salesInvoices") return `salesInvoiceLines($select=${BC_LINE_SELECT})`;
  if (entity === "salesCreditMemos") return `salesCreditMemoLines($select=${BC_LINE_SELECT})`;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function mapBcLineas(registro: Record<string, unknown>): BcLineaDetalle[] {
  const raw =
    (registro.salesInvoiceLines as { value?: Record<string, unknown>[] } | undefined)?.value ??
    (registro.salesCreditMemoLines as { value?: Record<string, unknown>[] } | undefined)?.value ??
    (Array.isArray(registro.salesInvoiceLines) ? registro.salesInvoiceLines : null) ??
    (Array.isArray(registro.salesCreditMemoLines) ? registro.salesCreditMemoLines : null) ??
    [];

  return raw.map((linea, index) => ({
    secuencia: asNumber(linea.sequence) ?? index + 1,
    producto: String(linea.lineObjectNumber ?? linea.itemId ?? "").trim() || undefined,
    descripcion: String(linea.description ?? "").trim() || undefined,
    cantidad: asNumber(linea.quantity),
    precioUnitario: asNumber(linea.unitPrice),
    monto: asNumber(linea.amountIncludingTax) ?? asNumber(linea.lineAmount),
  }));
}

export function mapRegistroToVista(registro: Record<string, unknown>): BcDocumentoVista {
  const lineas = mapBcLineas(registro);
  const status = String(registro.status ?? "").trim();
  const monto = asNumber(registro.totalAmountIncludingTax) ?? asNumber(registro.Amount);

  return {
    numeroBc: String(registro.number ?? registro.No ?? "").trim(),
    estado: status,
    estadoLabel: BC_STATUS_LABEL[status] ?? (status || "Sin estado"),
    cliente: String(registro.customerName ?? registro.billToName ?? "").trim() || undefined,
    rutCliente: String(registro.customerNumber ?? registro.billToCustomerNumber ?? "").trim() || undefined,
    fecha: String(registro.invoiceDate ?? registro.postingDate ?? registro.Posting_Date ?? "").slice(0, 10) || undefined,
    montoTotal: monto,
    moneda: String(registro.currencyCode ?? "CLP").trim() || "CLP",
    cantidadLineas: lineas.length,
    lineas,
  };
}

function buildODataUrl(
  config: DynamicsODataConfig,
  entity: string,
  filter: string,
  companyId?: string,
): string {
  const params = new URLSearchParams({ $filter: filter, $top: "1" });
  const expand = expandForBcApi(config, entity);
  if (expand) params.set("$expand", expand);

  if (config.mode === "fo") {
    params.set("cross-company", "true");
    return `${config.baseUrl}/${entity}?${params.toString()}`;
  }

  if (config.mode === "bc-api") {
    const id = (companyId ?? "").trim();
    if (!id) throw new Error("Falta Id_Dynamics de la empresa (Ges_Empresas o DYNAMICS_BC_COMPANY_ID).");
    return `${config.baseUrl}/companies(${id})/${entity}?${params.toString()}`;
  }

  return `${config.baseUrl}/${entity}?${params.toString()}`;
}

function pickResumenRegistro(registro: Record<string, unknown>): string {
  const campos = [
    "number",
    "No",
    "Document_No",
    "status",
    "externalDocumentNumber",
    "id",
    "InvoiceId",
    "SalesId",
    "InvoiceAccount",
    "Bill_to_Customer_No",
    "InvoiceDate",
    "Posting_Date",
    "InvoiceAmount",
    "Amount",
    "SalesBalance",
    "dataAreaId",
    "RecId",
  ];
  const partes = campos
    .filter((k) => registro[k] != null && registro[k] !== "")
    .map((k) => `${k}=${String(registro[k])}`);
  return partes.length ? partes.join(" · ") : "Registro OData sin campos resumibles.";
}

export async function buscarDocumentoEnOData(
  numero: string,
  tipo?: string,
  codEmpresa?: string,
  instance?: string,
): Promise<DynamicsODataVerificacion> {
  const config = getDynamicsODataConfig();
  if (!config) {
    return {
      configurado: false,
      tokenOk: false,
      consultado: false,
      encontrado: false,
      error: "OData Dynamics no configurado en .env.local.",
    };
  }

  const folio = String(numero ?? "").trim();
  if (!folio) {
    return {
      configurado: true,
      tokenOk: false,
      consultado: false,
      encontrado: false,
      error: "Folio vacio para consulta OData.",
    };
  }

  try {
    const numeroBc = config.mode === "bc-api" ? formatBcDocumentNumber(tipo, folio) : folio;
    const companyId = config.mode === "bc-api" ? await resolveBcCompanyId(codEmpresa, instance) : undefined;

    const token = await fetchAccessToken(config);
    const entity = entityForTipo(config, tipo);
    const filterValue = numeroBc.replace(/'/g, "''");
    const filter = `${config.salesFilterField} eq '${filterValue}'`;
    const odataUrl = buildODataUrl(config, entity, filter, companyId ?? undefined);

    const response = await fetch(odataUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
      },
      cache: "no-store",
    });

    const raw = await response.text();
    let json: { value?: Record<string, unknown>[]; error?: { message?: string } } = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`OData Dynamics: respuesta no JSON (${response.status}).`);
    }

    if (!response.ok) {
      const detail = json.error?.message ?? raw.slice(0, 300);
      return {
        configurado: true,
        tokenOk: true,
        consultado: true,
        encontrado: false,
        odataUrl,
        error: `Consulta OData fallo (${response.status}): ${detail}`,
      };
    }

    const registro = json.value?.[0];
    if (!registro) {
      return {
        configurado: true,
        tokenOk: true,
        consultado: true,
        encontrado: false,
        odataUrl,
        resumen: `No se encontro ${numeroBc} en ${entity}.`,
      };
    }

    const vista = config.mode === "bc-api" ? mapRegistroToVista(registro) : undefined;

    return {
      configurado: true,
      tokenOk: true,
      consultado: true,
      encontrado: true,
      odataUrl,
      registro,
      vista,
      resumen: vista
        ? `${vista.numeroBc} · ${vista.estadoLabel} · ${vista.cantidadLineas} línea(s)`
        : pickResumenRegistro(registro),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tokenOk = !/Token Dynamics fallo/i.test(message);
    return {
      configurado: true,
      tokenOk,
      consultado: false,
      encontrado: false,
      error: message,
    };
  }
}
