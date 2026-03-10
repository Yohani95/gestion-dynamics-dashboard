# Despliegue en servidor Windows (uso interno)

Guía para ejecutar el Dashboard de Gestión Dynamics en un servidor Windows, con URL fácil y despliegue automático vía GitHub Actions.

---

## Resumen rápido

1. **Servidor Windows** con Node.js 20+ y un **GitHub Actions self-hosted runner**
2. **URL fácil**: `http://dashboard` o `http://nombre-servidor` (configurando hosts o usando el nombre del equipo)
3. **Deploy automático** al hacer push a `main`

---

## 1. Preparar el servidor Windows

### 1.1 Instalar Node.js

```powershell
# Con winget
winget install OpenJS.NodeJS.LTS

# O descargar de https://nodejs.org (versión LTS)
```

### 1.2 Instalar GitHub Actions Runner (self-hosted)

1. En GitHub: **Settings** → **Actions** → **Runners** → **New self-hosted runner**
2. Selecciona **Windows** y sigue las instrucciones
3. Ejemplo de comandos que te dará GitHub:

```powershell
# Crear carpeta
mkdir C:\actions-runner
cd C:\actions-runner

# Descargar (usa el .zip que te indica GitHub)
# Extraer y ejecutar:
.\config.cmd --url https://github.com/TU-USUARIO/gestion-dynamics-dashboard --token TU_TOKEN

# Instalar como servicio (para que inicie con Windows)
.\svc.cmd install
.\svc.cmd start
```

4. En la configuración del runner, añade la etiqueta `windows` si no la tiene.

### 1.3 Variables de entorno

Crea `.env.local` en la raíz del proyecto con las variables que necesite tu app (por ejemplo, conexión a SQL Server):

```env
# Ejemplo - ajustar según tu app
# DATABASE_SERVER=...
# DATABASE_USER=...
# DATABASE_PASSWORD=...
```

---

## 2. URL fácil (solo red interna)

### Opción A: Nombre del servidor

Si tu servidor se llama `SRV-DASHBOARD`, los usuarios pueden acceder a:

```
http://SRV-DASHBOARD:3000
```

### Opción B: Archivo hosts (URL más corta)

En cada PC que vaya a usar la app, edita `C:\Windows\System32\drivers\etc\hosts` como administrador y añade:

```
192.168.1.100   dashboard
```

(Sustituye `192.168.1.100` por la IP de tu servidor)

Luego se accede a: **http://dashboard:3000**

### Opción C: IIS como reverse proxy (sin puerto en la URL)

Para usar `http://dashboard` sin `:3000`:

1. Instalar **IIS** y el módulo **URL Rewrite** + **ARR** (Application Request Routing)
2. Crear un sitio en IIS que escuche en el puerto 80 y redirija a `http://localhost:3000`

---

## 3. Ejecutar la app

### Sin servicio (pruebas)

```powershell
cd C:\ruta\gestion-dynamics-dashboard
npm ci
npm run build
.\scripts\start-app.ps1
```

### Como servicio de Windows (producción)

1. Instalar **NSSM**: https://nssm.cc/download → extraer a `C:\nssm`
2. Ejecutar:

```powershell
.\scripts\install-service.ps1 -NssmPath "C:\nssm\win64\nssm.exe"
```

La app se iniciará automáticamente con Windows.

---

## 4. GitHub Actions (deploy automático)

El workflow `.github/workflows/deploy-windows.yml` se ejecuta:

- Al hacer **push a `main`**
- O **manualmente** desde la pestaña Actions

**Requisitos:**

- El **self-hosted runner** debe estar instalado y en línea
- El runner debe tener las etiquetas `self-hosted` y `windows`

**Flujo del deploy:**

1. Checkout del código
2. `npm ci` y `npm run build`
3. Detener proceso anterior (si existe)
4. Iniciar la app con `scripts/deploy.ps1`

---

## 5. Estructura de scripts

| Script | Uso |
|--------|-----|
| `scripts/deploy.ps1` | Deploy desde GitHub Actions (detiene e inicia) |
| `scripts/start-app.ps1` | Iniciar manualmente en primer plano |
| `scripts/install-service.ps1` | Instalar como servicio de Windows con NSSM |

---

## 6. Firewall (red interna)

Si no se puede acceder desde otras PCs:

```powershell
# Permitir puerto 3000 en el firewall
New-NetFirewallRule -DisplayName "Dashboard Dynamics" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## 7. Comprobar que todo funciona

1. **Runner**: En GitHub → Actions → Runners debe aparecer como "Idle" o "Active"
2. **App**: Abrir `http://localhost:3000` en el servidor
3. **Red interna**: Abrir `http://NOMBRE-SERVIDOR:3000` desde otra PC de la red
