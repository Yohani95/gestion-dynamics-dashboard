# Modulo Avanzados (Jobs y SP)

El modulo Avanzados agrega monitoreo y control operativo para SQL Server Agent Jobs y una vista de procedimientos en ejecucion.

## Requisitos de SQL Server

- SQL Server Agent habilitado en cada instancia.
- Usuario SQL con permisos para:
  - Leer `msdb` (`sysjobs`, `sysjobhistory`, `sysjobactivity`, `sysjobschedules`).
  - Ejecutar `msdb.dbo.sp_start_job` y `msdb.dbo.sp_stop_job`.
  - Ejecutar `msdb.dbo.sp_update_job` (habilitar/deshabilitar jobs).
  - Leer DMVs (`sys.dm_exec_requests`, `sys.dm_exec_sessions`, `sys.dm_exec_sql_text`).

## Tablas de control

Las tablas se crean automaticamente al primer uso de endpoints avanzados:

- `dbo.Ges_AdvancedWhitelist`
- `dbo.Ges_AdvancedAudit`

### Whitelist (ejemplo)

> Sin filas activas en whitelist, los botones de accion quedan bloqueados.

```sql
-- Permitir iniciar y detener un job en instancia default
MERGE dbo.Ges_AdvancedWhitelist AS target
USING (
  SELECT
    N'default' AS Instancia,
    N'JOB' AS TipoObjetivo,
    N'NombreJobEjemplo' AS NombreObjetivo,
    CAST(1 AS bit) AS PermiteStart,
    CAST(1 AS bit) AS PermiteStop,
    CAST(1 AS bit) AS PermiteEnable,
    CAST(1 AS bit) AS PermiteDisable,
    CAST(1 AS bit) AS Activo
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
```

## Endpoints

- `GET /api/advanced/jobs`
- `POST /api/advanced/jobs/action` (`START`, `STOP`, `RETRY`, `ENABLE`, `DISABLE`)
- `GET /api/advanced/sps/running`
- `GET /api/advanced/alerts/summary`

Todos respetan la cabecera `x-instance` (`default` o `andpac`).

## Vista UI

- `Avanzados > Jobs` incluye:
  - Tabla de jobs con menu de acciones en tres puntos (`...`) por fila.
  - Acciones habilitadas por whitelist (`Iniciar`, `Detener`, `Reintentar`, `Habilitar`, `Deshabilitar`).
  - Pestaña `Ayuda` con guia operativa.
- `Avanzados > SP Activos` mantiene monitoreo solo lectura.

## Resumen en Inicio

- El dashboard principal mantiene arriba las cards operativas de ventas y transferencias.
- El resumen de jobs se muestra en un bloque aparte al final:
  - Chips de `Corriendo` y `Fallidos 24h`.
  - Tabla compacta con jobs caidos recientes.
  - Acceso directo a `/advanced/jobs`.
