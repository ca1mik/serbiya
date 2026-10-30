$ErrorActionPreference = 'Stop'
$taskName = 'OpenClaw OtpremaOps Approved Wave4'
$scriptPath = 'H:\serbiya\scripts\otpremaops_wave4.py'
$pythonPath = 'E:\open-claw-agent\.venv\Scripts\pythonw.exe'
if (-not (Test-Path -LiteralPath $scriptPath) -or -not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Wave 4 runner or Python environment is missing.'
}
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Actions[0].Arguments -notlike "*$scriptPath*") {
        throw 'A task with this name already points elsewhere.'
    }
    $existing | Select-Object TaskName, State
    exit 0
}
$action = New-ScheduledTaskAction -Execute $pythonPath -Argument "`"$scriptPath`" once" -WorkingDirectory 'H:\serbiya'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Hours 47)
$principal = New-ScheduledTaskPrincipal -UserId 'koall' -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Approved Wave 4: wait for Wave 3 and send only its 20 addresses through the existing guarded campaign.'
Register-ScheduledTask -TaskName $taskName -InputObject $task | Select-Object TaskName, State
