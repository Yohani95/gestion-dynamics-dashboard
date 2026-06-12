import sql from "mssql";
import { getInstanceMeta, resolveInstanceId } from "@/lib/instances";

/** SQL Server acepta "host,puerto" en cadenas de conexión; tedious/mssql requieren host y port por separado. */
function parseServerHostAndPort(
  serverRaw: string,
  portEnv: string | undefined
): { server: string; port: number } {
  const trimmed = serverRaw.trim();
  const comma = trimmed.lastIndexOf(",");
  if (comma !== -1) {
    const host = trimmed.slice(0, comma).trim();
    const portPart = trimmed.slice(comma + 1).trim();
    const portFromHost = parseInt(portPart, 10);
    if (host && !Number.isNaN(portFromHost)) {
      return { server: host, port: portFromHost };
    }
  }
  const fallback = portEnv ? parseInt(portEnv, 10) : 1433;
  return {
    server: trimmed,
    port: Number.isNaN(fallback) ? 1433 : fallback,
  };
}

const getConfig = (instance?: string): sql.config => {
  const instanceId = resolveInstanceId(instance);
  const suffix = getInstanceMeta(instanceId).envSuffix;

  const serverRaw = process.env[`SQL_SERVER${suffix}`] ?? "";
  const { server, port } = parseServerHostAndPort(
    serverRaw,
    process.env[`SQL_PORT${suffix}`]
  );

  return {
    server,
    database: process.env[`SQL_DATABASE${suffix}`] ?? "",
    user: process.env[`SQL_USER${suffix}`] || undefined,
    password: process.env[`SQL_PASSWORD${suffix}`] || undefined,
    port,
    connectionTimeout: 180000,
    requestTimeout: 180000,
    pool: { max: 10, min: 0 },
    options: {
      encrypt: process.env[`SQL_ENCRYPT${suffix}`] === "true",
      trustServerCertificate: true,
      enableArithAbort: true,
    },
  };
};

const pools = new Map<string, sql.ConnectionPool>();

export async function getPool(instance?: string): Promise<sql.ConnectionPool> {
  const key = resolveInstanceId(instance);
  let pool = pools.get(key);

  if (!pool) {
    const config = getConfig(instance);
    if (!config.server || !config.database) {
      throw new Error(`Faltan variables SQL para la instancia ${key} en .env.local`);
    }
    pool = await new sql.ConnectionPool(config).connect();
    pools.set(key, pool);
  }
  return pool;
}

export async function query<T = unknown[]>(
  queryText: string,
  params?: Record<string, string | number | null>,
  instance?: string
): Promise<T> {
  const p = await getPool(instance);
  const req = p.request();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) req.input(key, sql.NVarChar(50), "");
      else if (typeof value === "number") req.input(key, sql.Int, value);
      else req.input(key, sql.NVarChar(50), String(value));
    }
  }
  const result = await req.query(queryText);
  return result.recordset as T;
}

export { sql };

