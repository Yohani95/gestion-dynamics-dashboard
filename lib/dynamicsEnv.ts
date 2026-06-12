/** Chequeo de env sin dependencias de SQL (seguro para API liviana). */

function trim(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function isPlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  return (
    !value ||
    v.includes("tu-entorno") ||
    v.includes("your-environment") ||
    v.includes("example.com") ||
    v.includes("reemplazar") ||
    v.includes("pendiente")
  );
}

function resolveBaseUrl(): string {
  const explicit = trim("DYNAMICS_ODATA_BASE_URL").replace(/\/$/, "");
  if (explicit) return explicit;

  const tenant = trim("DYNAMICS_BC_TENANT_ID");
  const tokenUrl = trim("DYNAMICS_TOKEN_URL");
  const tenantFromToken = tokenUrl.match(/login\.microsoftonline\.com\/([0-9a-f-]+)\//i)?.[1] ?? "";
  const resolvedTenant = tenant || tenantFromToken;
  const environment = trim("DYNAMICS_BC_ENVIRONMENT") || "Production";

  if (resolvedTenant) {
    return `https://api.businesscentral.dynamics.com/v2.0/${resolvedTenant}/${environment}/api/v2.0`;
  }
  return "";
}

export function getDynamicsEnvStatus(): { configurado: boolean; detalle?: string } {
  const tokenUrl = trim("DYNAMICS_TOKEN_URL");
  const clientId = trim("DYNAMICS_CLIENT_ID");
  const clientSecret = trim("DYNAMICS_CLIENT_SECRET");
  const scope = trim("DYNAMICS_SCOPE");
  const baseUrl = resolveBaseUrl();

  const faltantes: string[] = [];
  if (!tokenUrl) faltantes.push("DYNAMICS_TOKEN_URL");
  if (!clientId) faltantes.push("DYNAMICS_CLIENT_ID");
  if (!clientSecret) faltantes.push("DYNAMICS_CLIENT_SECRET");
  if (!scope) faltantes.push("DYNAMICS_SCOPE");
  if (!baseUrl) faltantes.push("DYNAMICS_BC_TENANT_ID o DYNAMICS_ODATA_BASE_URL");
  if (isPlaceholder(scope)) faltantes.push("DYNAMICS_SCOPE (placeholder)");
  if (isPlaceholder(baseUrl)) faltantes.push("DYNAMICS_ODATA_BASE_URL (placeholder)");

  if (faltantes.length) {
    return {
      configurado: false,
      detalle: `Faltan o son inválidas: ${faltantes.join(", ")}`,
    };
  }

  return { configurado: true };
}
