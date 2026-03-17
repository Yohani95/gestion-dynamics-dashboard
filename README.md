# Diagnostico Dynamics - TheLineGroup

Landing de consulta de documentos (BLE, FCV, NCV) para revisar estado en SII, envio a Dynamics 365 y errores registrados.

## Requisitos

- Node.js 18+
- SQL Server (Gestion) accesible con credenciales configuradas.

## Configuracion

1. Copia el archivo de ejemplo y completa credenciales SQL:

   ```bash
   cp .env.example .env.local
   ```

2. Edita `.env.local`:

   ```env
   SQL_SERVER=192.30.1.26
   SQL_DATABASE=Gestion
   SQL_USER=tu_usuario
   SQL_PASSWORD=tu_password
   ```

3. Configura seguridad de acciones admin (V1):

   ```env
   AUTH_PROVIDER=local
   AUTH_SESSION_SECRET=un_secreto_largo_y_unico
   ADMIN_USERS_JSON=[{"username":"admin1","passwordHash":"$2b$12$...","role":"ADMIN"}]
   ```

   Para generar hash bcrypt:

   ```bash
   node -e "const b=require('bcryptjs'); b.hash('TuClaveSegura123!',12).then(console.log)"
   ```

   Compatibilidad futura con Windows/IIS:

   ```env
   # AUTH_PROVIDER=windows
   # WINDOWS_ADMIN_USERS=DOMINIO\\usuario1,DOMINIO\\usuario2
   ```

No subas `.env.local` al control de versiones.

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), ingresa un numero de documento y revisa el diagnostico.

## Produccion

```bash
npm run build
npm start
```

## Modulo Avanzados

Incluye:

- Control de SQL Agent Jobs (`/advanced/jobs`).
- Monitoreo de SP activos (`/advanced/sps`).
- Pestaña de ayuda en Jobs.

En el dashboard principal, el bloque de Jobs se muestra en una seccion aparte para no saturar las cards operativas.

Documentacion detallada: `docs/ADVANCED-MODULE.md`.

