import sql from "mssql";

const config: sql.config = {
  server: process.env.SQL_SERVER ?? "",
  database: process.env.SQL_DATABASE ?? "",
  user: process.env.SQL_USER || undefined,
  password: process.env.SQL_PASSWORD || undefined,
  port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 1433,
  connectionTimeout: 180000, // 3 minutos (consultas pesadas: documentos por fecha)
  requestTimeout: 180000,    // 3 minutos
  pool: { max: 10, min: 0 },
  options: {
    encrypt: process.env.SQL_ENCRYPT === "true",
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    if (!process.env.SQL_SERVER || !process.env.SQL_DATABASE) {
      throw new Error("Faltan variables SQL_SERVER o SQL_DATABASE en .env.local");
    }
    if (!process.env.SQL_USER || !process.env.SQL_PASSWORD) {
      throw new Error("Configura SQL_USER y SQL_PASSWORD en .env.local (autenticación SQL).");
    }
    pool = await sql.connect(config);
  }
  return pool;
}

export async function query<T = unknown[]>(
  queryText: string,
  params?: Record<string, string | number | null>
): Promise<T> {
  const p = await getPool();
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
