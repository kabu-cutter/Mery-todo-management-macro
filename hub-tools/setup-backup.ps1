[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$DailyTime = '21:00',
    [switch]$NoSchedule
)
$ErrorActionPreference = 'Stop'
if ($Destination -notmatch '^[A-Za-z]:\\' -or $Destination.Contains('"')) { throw 'Use an absolute local Windows folder path.' }
$target = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
$source = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
if ($target.Length -le 2 -or $source.Length -le 2 -or $target.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
    $target.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $source.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a separate backup folder, not a drive root or nested source folder.' }
if ($DailyTime -notmatch '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$') { throw 'DailyTime must be HH:mm.' }
if (!(Test-Path -LiteralPath ([IO.Path]::GetPathRoot($target)))) { throw 'Destination drive is not connected.' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
$marker = Join-Path $target '.ai-work-hub-backup-id'
if (Test-Path -LiteralPath $marker) {
    $id = (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim()
    $parsedId = [Guid]::Empty
    if (![Guid]::TryParse($id, [ref]$parsedId)) { throw 'Invalid destination marker. Check the selected folder.' }
} else {
    $id = [Guid]::NewGuid().ToString()
    $id | Set-Content -LiteralPath $marker -Encoding UTF8
}
$configPath = Join-Path $PSScriptRoot 'backup.json'
if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination ($configPath + '.saved-' + [Guid]::NewGuid().ToString('N'))
}
[ordered]@{ Source = ''; Destination = $target; DestinationId = $id; DailyTime = $DailyTime } |
    ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
if (!$NoSchedule) {
    $taskName = 'AI-Work-Hub-Backup'
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw "Task $taskName already exists. Configuration saved; existing task was not overwritten." }
    $script = Join-Path $PSScriptRoot 'backup.ps1'
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $script + '"') -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::ParseExact($DailyTime, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture))
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Daily saved-file backup of ai-work-hub. Keeps all dated snapshots.' | Out-Null
    Write-Output "Daily backup registered at $DailyTime (current user must be logged in)."
}
Write-Output "Backup destination configured: $target"
