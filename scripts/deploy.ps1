# Script de deploy para servidor Windows
# Ejecuta la app Next.js en modo producción

param(
    [int]$Port = 3000
)

$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

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

Write-Host "Deploy completado. App disponible en http://localhost:$Port"
Write-Host "URL amigable: http://diagnostico-dynamics.local:$Port (agregar en hosts)"
