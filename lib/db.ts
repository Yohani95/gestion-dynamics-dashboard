import sql from "mssql";

const getConfig = (instance?: string): sql.config => {
  const suffix = instance === "andpac" ? "_andpac" : "";
  return {
    server: process.env[`SQL_SERVER${suffix}`] ?? "",
    database: process.env[`SQL_DATABASE${suffix}`] ?? "",
    user: process.env[`SQL_USER${suffix}`] || undefined,
    password: process.env[`SQL_PASSWORD${suffix}`] || undefined,
    port: process.env[`SQL_PORT${suffix}`] ? parseInt(process.env[`SQL_PORT${suffix}`]!, 10) : 1433,
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
  const key = instance === "andpac" ? "andpac" : "default";
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

