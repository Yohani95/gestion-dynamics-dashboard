# Instala la app como servicio de Windows usando NSSM
# Requiere: descargar NSSM de https://nssm.cc/download
# O instalar con: winget install NSSM (si está disponible)
# O usar: choco install nssm

param(
    [string]$ServiceName = "GestionDynamicsDashboard",
    [int]$Port = 3000,
    [string]$NssmPath = "C:\nssm\nssm.exe"  # Ajustar ruta de NSSM
)

$AppDir = Split-Path -Parent $PSScriptRoot
$NodePath = (Get-Command node).Source
$NextPath = Join-Path $AppDir "node_modules\.bin\next.cmd"

if (-not (Test-Path $NssmPath)) {
    Write-Host "NSSM no encontrado en $NssmPath"
    Write-Host "Opciones para instalar NSSM:"
    Write-Host "  1. Descargar de https://nssm.cc/download y extraer a C:\nssm"
    Write-Host "  2. Chocolatey: choco install nssm"
    Write-Host "  3. O ejecutar la app con scripts/start-app.ps1 (sin servicio)"
    exit 1
}

# Eliminar servicio si ya existe
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    & $NssmPath stop $ServiceName
    & $NssmPath remove $ServiceName confirm
}

# Crear servicio
& $NssmPath install $ServiceName $NextPath "start -p $Port"
& $NssmPath set $ServiceName AppDirectory $AppDir
& $NssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production"
& $NssmPath set $ServiceName Description "Dashboard Gestión Dynamics - TheLineGroup"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START

Write-Host "Servicio '$ServiceName' instalado. Iniciando..."
Start-Service $ServiceName

Write-Host "Listo. La app estará en http://localhost:$Port"
