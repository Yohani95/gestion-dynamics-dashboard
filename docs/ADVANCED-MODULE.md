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

### Carga masiva (ultimos jobs ejecutados)

Para habilitar permisos masivos (START/STOP/ENABLE/DISABLE) sobre los ultimos jobs ejecutados, usa:

- `scripts/sql/seed_advanced_whitelist_recent_jobs.sql`

Parametros del script:

- `@Instancia`: `default` | `andpac` | `tecnobuy` | `dwhdev2`
- `@DaysBack`: ventana de dias hacia atras (default `7`)
- `@TopJobs`: cantidad de jobs a permitir (default `20`)

## Scripts utiles

- `scripts/sql/seed_advanced_whitelist_recent_jobs.sql`
  - Carga permisos de Jobs (START/STOP/ENABLE/DISABLE) para los ultimos jobs ejecutados.
- `scripts/sql/sync_estado_sii_timbrado_from_folios.sql`
  - Sincroniza `Ges_EleDocSii.Estado = 2` para folios ya confirmados como timbrados en Folder.
  - Incluye modo `preview` (`@ApplyChanges = 0`) y modo `apply` (`@ApplyChanges = 1`).

## Endpoints

- `GET /api/advanced/jobs`
- `POST /api/advanced/jobs/action` (`START`, `STOP`, `RETRY`, `ENABLE`, `DISABLE`)
- `GET /api/advanced/sps/running`
- `GET /api/advanced/alerts/summary`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

Todos respetan la cabecera `x-instance` (`default`, `andpac`, `tecnobuy`, `dwhdev2`).

## Seguridad de acciones (V1)

- La visualizacion se mantiene publica.
- Las acciones mutables requieren sesion de administrador:
  - `POST /api/advanced/jobs/action`
  - `POST /api/transferencias/estados/accion`
  - `POST /api/documento/reprocesar`
  - `POST /api/documento/localizar`
  - `POST /api/documento/registrar`
  - `POST /api/documento/enviar-sii`
- Respuestas esperadas:
  - `401` cuando no existe sesion admin.
  - `403` cuando el usuario no tiene rol/permiso.
  - `403` adicional en Jobs cuando whitelist no permite la accion.
- Todas las acciones quedan auditadas en `dbo.Ges_AdvancedAudit` (exito, denegado o fallo), incluyendo usuario cuando existe sesion.

### Variables de entorno para auth

```env
AUTH_PROVIDER=local
AUTH_SESSION_SECRET=CAMBIAR_ESTE_SECRETO_LARGO_Y_UNICO
ADMIN_USERS_JSON=[{"username":"admin1","passwordHash":"$2b$12$...","role":"ADMIN"}]
```

Generar hash bcrypt:

```bash
node -e "const b=require('bcryptjs'); b.hash('TuClaveSegura123!',12).then(console.log)"
```

Compatibilidad futura con Windows/IIS (no activa en V1):

```env
# AUTH_PROVIDER=windows
# WINDOWS_ADMIN_USERS=DOMINIO\\usuario1,DOMINIO\\usuario2,DOMINIO\\usuario3
```

## Instancias y alcance

- `default` (TL Group): modulo completo.
- `andpac` (AndPac): modulo completo.
- `tecnobuy` (TecnoBuy): sin modulo `Transferencias`.
- `dwhdev2` (Data Warehouse Dev2): solo `Avanzados > Jobs`.

En dashboard principal (`/`), cuando la instancia no soporta transferencias (por ejemplo `tecnobuy`):

- No se muestran cards ni boton de `Transferencias`.
- No se muestra la tabla de incidencias de transferencias.

Variables esperadas en `.env.local`:

- `SQL_SERVER_tecnobuy`, `SQL_DATABASE_tecnobuy`, `SQL_USER_tecnobuy`, `SQL_PASSWORD_tecnobuy`
- `SQL_SERVER_dwhdev2`, `SQL_DATABASE_dwhdev2`, `SQL_USER_dwhdev2`, `SQL_PASSWORD_dwhdev2`

## Vista UI

- `Avanzados > Jobs` incluye:
  - Tabla de jobs con menu de acciones en tres puntos (`...`) por fila.
  - Acciones habilitadas por whitelist (`Iniciar`, `Detener`, `Reintentar`, `Habilitar`, `Deshabilitar`).
  - Pestaña `Ayuda` con guia operativa.
- `Avanzados > SP Activos` mantiene monitoreo solo lectura.

### Notificaciones navegador

- El header principal tiene boton de campana para activar/desactivar alertas del browser.
- Requiere permiso de notificaciones del navegador.
- La app notifica cuando suben los `failedJobs24h` o `longRunningJobs`.
- Al hacer click en la notificacion, abre `/advanced/jobs`.
- El boton `Probar alerta` queda visible en desarrollo y en produccion solo para usuarios admin autenticados.
- Se muestra estado operativo en header (permiso del navegador + estado de ultimo poll).

## Resumen en Inicio

- El dashboard principal mantiene arriba las cards operativas de ventas y transferencias.
- El resumen de jobs se muestra en un bloque aparte al final:
  - Chips de `Corriendo` y `Fallidos 24h`.
  - Tabla compacta con jobs caidos recientes.
  - Acceso directo a `/advanced/jobs`.
