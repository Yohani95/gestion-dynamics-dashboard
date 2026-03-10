@echo off
:: Puerto 80 requiere permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permisos de administrador para usar puerto 80...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
pause
