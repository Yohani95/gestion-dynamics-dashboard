/*
  Seed de permisos para Jobs en dbo.Ges_AdvancedWhitelist
  - Inserta/actualiza los ultimos @TopJobs jobs con ejecucion en los ultimos @DaysBack dias.
  - Habilita START/STOP/ENABLE/DISABLE.

  Uso rapido:
    1) Conectate a la BD donde existe dbo.Ges_AdvancedWhitelist.
    2) Ajusta @Instancia:
       - default | andpac | tecnobuy | dwhdev2
    3) Ejecuta el script.
*/

SET NOCOUNT ON;

DECLARE @Instancia NVARCHAR(30) = N'dwhdev2';
DECLARE @DaysBack INT = 7;
DECLARE @TopJobs INT = 20;

IF OBJECT_ID('dbo.Ges_AdvancedWhitelist', 'U') IS NULL
BEGIN
  THROW 50001, 'No existe dbo.Ges_AdvancedWhitelist en la base actual.', 1;
END;

/* Compatibilidad hacia atras por si la tabla venia sin estas columnas */
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

;WITH RecentJobs AS (
  SELECT TOP (@TopJobs)
    j.name AS NombreObjetivo,
    MAX(msdb.dbo.agent_datetime(h.run_date, h.run_time)) AS UltimaEjecucion
  FROM msdb.dbo.sysjobs j
  INNER JOIN msdb.dbo.sysjobhistory h
    ON h.job_id = j.job_id
   AND h.step_id = 0
   AND h.run_date > 0
  WHERE msdb.dbo.agent_datetime(h.run_date, h.run_time) >= DATEADD(DAY, -@DaysBack, GETDATE())
  GROUP BY j.name
  ORDER BY UltimaEjecucion DESC
)
MERGE dbo.Ges_AdvancedWhitelist AS target
USING (
  SELECT
    @Instancia AS Instancia,
    N'JOB' AS TipoObjetivo,
    r.NombreObjetivo,
    CAST(1 AS BIT) AS PermiteStart,
    CAST(1 AS BIT) AS PermiteStop,
    CAST(1 AS BIT) AS PermiteEnable,
    CAST(1 AS BIT) AS PermiteDisable,
    CAST(1 AS BIT) AS Activo
  FROM RecentJobs r
) AS src
ON target.Instancia = src.Instancia
AND target.TipoObjetivo = src.TipoObjetivo
AND target.NombreObjetivo = src.NombreObjetivo
WHEN MATCHED THEN
  UPDATE SET
    PermiteStart = src.PermiteStart,
    PermiteStop = src.PermiteStop,
    PermiteEnable = src.PermiteEnable,
    PermiteDisable = src.PermiteDisable,
    Activo = src.Activo,
    UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT (
    Instancia,
    TipoObjetivo,
    NombreObjetivo,
    PermiteStart,
    PermiteStop,
    PermiteEnable,
    PermiteDisable,
    Activo
  )
  VALUES (
    src.Instancia,
    src.TipoObjetivo,
    src.NombreObjetivo,
    src.PermiteStart,
    src.PermiteStop,
    src.PermiteEnable,
    src.PermiteDisable,
    src.Activo
  );

SELECT
  Instancia,
  TipoObjetivo,
  NombreObjetivo,
  PermiteStart,
  PermiteStop,
  PermiteEnable,
  PermiteDisable,
  Activo,
  UpdatedAt
FROM dbo.Ges_AdvancedWhitelist WITH (NOLOCK)
WHERE Instancia = @Instancia
  AND TipoObjetivo = N'JOB'
ORDER BY UpdatedAt DESC, NombreObjetivo ASC;
