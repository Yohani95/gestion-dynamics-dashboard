# Diagnóstico Dynamics · TheLineGroup

Landing de consulta de documentos (BLE, FCV, NCV) para ver estado en SII, envío a Dynamics 365 y errores registrados.

## Requisitos

- Node.js 18+
- SQL Server (Gestion) accesible con las credenciales configuradas.

## Configuración

1. Copia el archivo de ejemplo y rellena las credenciales de SQL Server:

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

   No subas `.env.local` a control de versiones.

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), ingresa un número de documento y revisa el diagnóstico (estado SII, estado Dynamics, errores).

## Producción

```bash
npm run build
npm start
```
