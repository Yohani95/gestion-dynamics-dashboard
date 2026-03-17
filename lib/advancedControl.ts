import sql from "mssql";

export type AdvancedTargetType = "JOB" | "SP";
export type AdvancedResult = "SUCCESS" | "FAILED" | "DENIED";

export function resolveInstanceKey(instanceHeader?: string | null) {
  return instanceHeader === "andpac" ? "andpac" : "default";
}

export async function ensureAdvancedTables(pool: sql.ConnectionPool) {
  await pool
    .request()
    .query(`
      IF OBJECT_ID('dbo.Ges_AdvancedWhitelist', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Ges_AdvancedWhitelist (
          Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Instancia NVARCHAR(30) NOT NULL,
          TipoObjetivo NVARCHAR(10) NOT NULL,
          NombreObjetivo NVARCHAR(256) NOT NULL,
          PermiteStart BIT NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_PermiteStart DEFAULT (0),
          PermiteStop BIT NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_PermiteStop DEFAULT (0),
          PermiteEnable BIT NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_PermiteEnable DEFAULT (0),
          PermiteDisable BIT NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_PermiteDisable DEFAULT (0),
          Activo BIT NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_Activo DEFAULT (1),
          UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_GesAdvancedWhitelist_UpdatedAt DEFAULT (SYSUTCDATETIME())
        );

        CREATE UNIQUE INDEX IX_GesAdvancedWhitelist_InstanceTypeName
          ON dbo.Ges_AdvancedWhitelist (Instancia, TipoObjetivo, NombreObjetivo);
      END;

      IF OBJECT_ID('dbo.Ges_AdvancedWhitelist', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.Ges_AdvancedWhitelist', 'PermiteEnable') IS NULL
        BEGIN
          ALTER TABLE dbo.Ges_AdvancedWhitelist
          ADD PermiteEnable BIT NOT NULL
          CONSTRAINT DF_GesAdvancedWhitelist_PermiteEnable DEFAULT (0);
        END;

        IF COL_LENGTH('dbo.Ges_AdvancedWhitelist', 'PermiteDisable') IS NULL
        BEGIN
          ALTER TABLE dbo.Ges_AdvancedWhitelist
          ADD PermiteDisable BIT NOT NULL
          CONSTRAINT DF_GesAdvancedWhitelist_PermiteDisable DEFAULT (0);
        END;
      END;

      IF OBJECT_ID('dbo.Ges_AdvancedAudit', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Ges_AdvancedAudit (
          Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_GesAdvancedAudit_Fecha DEFAULT (SYSUTCDATETIME()),
          Instancia NVARCHAR(30) NOT NULL,
          UsuarioApp NVARCHAR(120) NULL,
          Accion NVARCHAR(20) NOT NULL,
          TipoObjetivo NVARCHAR(10) NOT NULL,
          NombreObjetivo NVARCHAR(256) NOT NULL,
          Resultado NVARCHAR(20) NOT NULL,
          DetalleError NVARCHAR(2000) NULL
        );

        CREATE INDEX IX_GesAdvancedAudit_Fecha
          ON dbo.Ges_AdvancedAudit (Fecha DESC);
      END;
    `);
}

export async function getWhitelistMap(
  pool: sql.ConnectionPool,
  instance: string,
  targetType: AdvancedTargetType,
) {
  const result = await pool
    .request()
    .input("Instancia", sql.NVarChar(30), instance)
    .input("TipoObjetivo", sql.NVarChar(10), targetType)
    .query<{
      NombreObjetivo: string;
      PermiteStart: boolean;
      PermiteStop: boolean;
      PermiteEnable: boolean;
      PermiteDisable: boolean;
    }>(`
      SELECT NombreObjetivo, PermiteStart, PermiteStop, PermiteEnable, PermiteDisable
      FROM dbo.Ges_AdvancedWhitelist WITH (NOLOCK)
      WHERE Instancia = @Instancia
        AND TipoObjetivo = @TipoObjetivo
        AND Activo = 1;
    `);

  const map = new Map<
    string,
    { canStart: boolean; canStop: boolean; canEnable: boolean; canDisable: boolean }
  >();

  for (const row of result.recordset) {
    map.set(row.NombreObjetivo.toLowerCase(), {
      canStart: Boolean(row.PermiteStart),
      canStop: Boolean(row.PermiteStop),
      canEnable: Boolean(row.PermiteEnable),
      canDisable: Boolean(row.PermiteDisable),
    });
  }

  return map;
}

export async function insertAdvancedAudit(
  pool: sql.ConnectionPool,
  payload: {
    instance: string;
    userApp?: string | null;
    action: string;
    targetType: AdvancedTargetType;
    targetName: string;
    result: AdvancedResult;
    detail?: string | null;
  },
) {
  const detail = payload.detail?.slice(0, 2000) ?? null;

  const insertResult = await pool
    .request()
    .input("Instancia", sql.NVarChar(30), payload.instance)
    .input("UsuarioApp", sql.NVarChar(120), payload.userApp ?? null)
    .input("Accion", sql.NVarChar(20), payload.action)
    .input("TipoObjetivo", sql.NVarChar(10), payload.targetType)
    .input("NombreObjetivo", sql.NVarChar(256), payload.targetName)
    .input("Resultado", sql.NVarChar(20), payload.result)
    .input("DetalleError", sql.NVarChar(2000), detail)
    .query<{ Id: number }>(`
      INSERT INTO dbo.Ges_AdvancedAudit
      (
        Instancia,
        UsuarioApp,
        Accion,
        TipoObjetivo,
        NombreObjetivo,
        Resultado,
        DetalleError
      )
      OUTPUT INSERTED.Id
      VALUES
      (
        @Instancia,
        @UsuarioApp,
        @Accion,
        @TipoObjetivo,
        @NombreObjetivo,
        @Resultado,
        @DetalleError
      );
    `);

  return Number(insertResult.recordset[0]?.Id ?? 0);
}
