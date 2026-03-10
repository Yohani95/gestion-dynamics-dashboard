# Script de deploy para servidor Windows
# Ejecuta la app Next.js en modo producción

param(
    [int]$Port = 80  # Puerto 80 = sin :puerto en la URL (requiere ejecutar como admin)
)

$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

# Puerto 80 requiere permisos de administrador en Windows
if ($Port -eq 80) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Error "El puerto 80 requiere ejecutar como administrador. Ejecuta deploy.bat con clic derecho -> Ejecutar como administrador."
        exit 1
    }
}

# Detener proceso anterior si existe (por nombre de directorio en la ruta)
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
foreach ($proc in $nodeProcesses) {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -like "*gestion-dynamics-dashboard*" -or $cmdLine -like "*next*start*") {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "Proceso anterior detenido (PID: $($proc.Id))"
            Start-Sleep -Seconds 2
        }
    } catch { }
}

$env:NODE_ENV = "production"
$nextPath = Join-Path $AppDir "node_modules\.bin\next.cmd"

if (-not (Test-Path $nextPath)) {
    Write-Error "Next.js no encontrado. Ejecuta 'npm install' primero."
    exit 1
}

# Iniciar en background
Start-Process -FilePath $nextPath -ArgumentList "start", "-p", $Port -WorkingDirectory $AppDir -WindowStyle Hidden

Write-Host "Deploy completado. App disponible en http://localhost$(if($Port -ne 80){":$Port"} else {''})"
Write-Host "URL amigable: http://diagnostico-dynamics.local (agregar en hosts)"
