# Detener la app Next.js en producción
# Ejecutar en la PC donde corre la app (local o remota)
# Desde PC local para detener en remota: .\stop.ps1 -ComputerName NOMBRE-PC

param(
    [string]$ComputerName = $null  # Opcional: para ejecutar en PC remota
)

$scriptBlock = {
    $stopped = 0
    Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmd -like "*gestion-dynamics-dashboard*" -or $cmd -like "*next*start*") {
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
                Write-Host "Detenido PID $($_.Id)"
                $stopped++
            }
        } catch { }
    }
    if ($stopped -eq 0) { Write-Host "No hay proceso de la app en ejecución." }
    else { Write-Host "Proceso(s) detenido(s)." }
}

if ($ComputerName) {
    Invoke-Command -ComputerName $ComputerName -ScriptBlock $scriptBlock
} else {
    & $scriptBlock
}
