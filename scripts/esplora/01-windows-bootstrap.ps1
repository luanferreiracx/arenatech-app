<#
.SYNOPSIS
  Bootstrap do host Windows que hospeda a Esplora Liquid (ADR 0059).

.DESCRIPTION
  Rode UMA VEZ, como Administrador, num Windows recem-formatado. Deixa a maquina
  acessivel por SSH e com WSL2 pronto; o resto (Docker, elements, waterfalls,
  cloudflared) roda dentro do WSL2 via 02-wsl-provision.sh.

  IDEMPOTENTE: pode rodar de novo sem quebrar nada.

.NOTES
  Por que cada passo existe (aprendido na montagem de 2026-07, refeita apos
  formatacao em 2026-07-28):

  - CHAVE EM administrators_authorized_keys: no OpenSSH do Windows, usuario do
    grupo Administradores NAO le ~/.ssh/authorized_keys. Ele le
    C:\ProgramData\ssh\administrators_authorized_keys, com ACL restrita a
    Administrators+SYSTEM. Chave no lugar errado = login falha em silencio.

  - WSLEsploraKeepAlive: o WSL2 desliga a distro ~20s depois que a ultima sessao
    termina. Isso matava cloudflared/tailscale/containers assim que o SSH caia —
    foi a causa-raiz de todos os fracassos da primeira montagem. A tarefa segura
    a distro viva com um `sleep infinity`.

  - .wslconfig: por padrao o WSL2 pega ~50% da RAM. O IBD do Liquid e limitado por
    I/O e cache; dar RAM e CPU de verdade corta dias de sync.
#>
[CmdletBinding()]
param(
  # Chave publica autorizada a entrar por SSH.
  [string]$PublicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINu43aHmTLNB0DK2A6GGNBWFcDnXp1epQzd1E9lhfGL1 claude-esplora-pc",
  # GiB deixados para o Windows; o resto vai para o WSL2.
  [int]$WindowsReserveGb = 2
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Rode este script numa janela do PowerShell aberta como Administrador."
}

Write-Host "== 1/5 OpenSSH Server ==" -ForegroundColor Cyan
$cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*"
if ($cap.State -ne "Installed") { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
if (-not (Get-NetFirewallRule -Name "sshd-esplora" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name "sshd-esplora" -DisplayName "OpenSSH Server (esplora)" `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}

Write-Host "== 2/5 Chave autorizada (administrators_authorized_keys) ==" -ForegroundColor Cyan
$akFile = "C:\ProgramData\ssh\administrators_authorized_keys"
if (-not (Test-Path $akFile)) { New-Item -ItemType File -Path $akFile -Force | Out-Null }
$existing = Get-Content $akFile -ErrorAction SilentlyContinue
if ($existing -notcontains $PublicKey) { Add-Content -Path $akFile -Value $PublicKey }
# ACL exigida pelo sshd: so Administrators e SYSTEM. Herdada = sshd recusa o arquivo.
icacls $akFile /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null

Write-Host "== 3/5 WSL2 + Ubuntu ==" -ForegroundColor Cyan
if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw "wsl.exe ausente — Windows desatualizado?" }
$distros = (wsl.exe --list --quiet) -replace "`0", ""
if ($distros -notmatch "Ubuntu") {
  Write-Host "Instalando Ubuntu (pode pedir reboot ao final)..." -ForegroundColor Yellow
  wsl.exe --install -d Ubuntu --no-launch
}
wsl.exe --set-default-version 2 | Out-Null

Write-Host "== 4/5 .wslconfig (CPU/RAM agressivos para o IBD) ==" -ForegroundColor Cyan
$totalGb = [int][math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$wslGb = [math]::Max(4, $totalGb - $WindowsReserveGb)
@"
[wsl2]
memory=${wslGb}GB
processors=${cores}
swap=8GB
# localhostForwarding fica ON: o cloudflared roda DENTRO do WSL2 e fala com o
# waterfalls por localhost; nao dependemos de portproxy nem de NAT do Windows.
localhostForwarding=true
"@ | Set-Content -Path "$env:USERPROFILE\.wslconfig" -Encoding ASCII
Write-Host "  host: ${totalGb}GiB / ${cores} vCPU -> WSL2 recebe ${wslGb}GiB e ${cores} vCPU"

Write-Host "== 5/5 Tarefa WSLEsploraKeepAlive ==" -ForegroundColor Cyan
# Sem isto o WSL2 derruba a distro ~20s apos a sessao SSH sair, matando
# cloudflared e containers. Gatilho AtLogOn porque a conta e Microsoft (autologon
# exigiria a senha da conta — o dono declinou; custo = 1 login por reboot).
$taskName = "WSLEsploraKeepAlive"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
$action  = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d Ubuntu -u root -- sleep infinity"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $set `
  -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "PRONTO. Valide do Mac:  ssh esplora-pc 'echo ok'" -ForegroundColor Green
Write-Host "Se o Ubuntu acabou de ser instalado, abra-o UMA vez para criar o usuario," -ForegroundColor Yellow
Write-Host "ou rode:  wsl.exe -d Ubuntu -u root -- echo ok" -ForegroundColor Yellow
