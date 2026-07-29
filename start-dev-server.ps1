# Inicia o servidor de desenvolvimento (npm run dev) em background, sem
# janela visível. Usado pela Tarefa Agendada "AcertoComprasDevServer"
# (dispara no login do Windows) enquanto o app ainda roda só localmente,
# antes da migração para uma hospedagem real.
#
# Guarda contra duplicar o processo: se a porta 3000 já estiver ouvindo
# (ex: login/logoff sem reiniciar a máquina, com o servidor anterior ainda
# de pé), não inicia um segundo.

$dir = "c:\Users\alan.rabelo\.copilot\acerto-compras-scaffold\acerto-compras"
$npm = "C:\Users\alan.rabelo\tools\node-v22.14.0-win-x64\npm.cmd"

$alreadyRunning = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($alreadyRunning) {
    exit 0
}

Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$npm`" run dev >> dev-server.log 2>&1" -WindowStyle Hidden -WorkingDirectory $dir
