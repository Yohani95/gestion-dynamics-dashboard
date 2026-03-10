# Inicia la app manualmente (para pruebas o sin servicio)
# Uso: .\scripts\start-app.ps1

param([int]$Port = 3000)

$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir

$env:NODE_ENV = "production"
npm run start -- -p $Port
