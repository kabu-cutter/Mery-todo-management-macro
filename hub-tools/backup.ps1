[CmdletBinding()]
param([string]$ConfigPath = '')
$ErrorActionPreference = 'Stop'
if (!$ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'backup.json' }
$lock = $null
$runtime = $null
try {
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($config.Destination) -or [string]::IsNullOrWhiteSpace($config.DestinationId)) {
        throw 'Backup destination is not configured. Run setup-backup.ps1 first.'
    }
    $source = if ([string]::IsNullOrWhiteSpace($config.Source)) { $PSScriptRoot } else { $config.Source }
    foreach ($path in @($source, $config.Destination)) {
        if ($path -notmatch '^[A-Za-z]:\\' -or $path.Contains('"')) { throw 'Use an absolute local Windows folder path.' }
    }
    $source = [IO.Path]::GetFullPath($source).TrimEnd('\')
    $destination = [IO.Path]::GetFullPath($config.Destination).TrimEnd('\')
    if ($source.Length -le 2 -or $destination.Length -le 2) { throw 'A drive root cannot be used as a backup folder.' }
    if ($source.Equals($destination, [StringComparison]::OrdinalIgnoreCase) -or
        $destination.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $source.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Source and destination must be separate folders, without nesting.'
    }
    if (!(Test-Path -LiteralPath $source -PathType Container)) { throw 'Source folder is missing.' }
    $runtime = Join-Path $source '.backup'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $lock = [IO.File]::Open((Join-Path $runtime 'run.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    if (!(Test-Path -LiteralPath $destination -PathType Container)) { throw 'Backup drive/folder is unavailable. Nothing was copied.' }
    $marker = Join-Path $destination '.ai-work-hub-backup-id'
    if (!(Test-Path -LiteralPath $marker -PathType Leaf) -or
        (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim() -ne $config.DestinationId) {
        throw 'Destination identity does not match. Reconnect the configured backup drive.'
    }
    if ((Test-Path -LiteralPath (Join-Path $source 'sync.lock')) -or (Test-Path -LiteralPath (Join-Path $source '.mery-calendar\sync.lock'))) { throw 'Hub synchronization is running. Try again after synchronization.' }
    $name = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
    $latest = Join-Path $destination '最新'
    $previous = $null
    if (Test-Path -LiteralPath $latest) {
        $previousManifest = Join-Path $latest 'backup-manifest.json'
        if (!(Test-Path -LiteralPath $previousManifest)) { throw 'Latest folder is not a managed backup. Nothing was overwritten.' }
        $previous = Get-Content -LiteralPath $previousManifest -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($previous.DestinationId -ne $config.DestinationId -or $previous.SnapshotId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{8}$') { throw 'Invalid latest backup identity.' }
    }
    $pending = Join-Path $destination ($name + '.partial')
    New-Item -ItemType Directory -Path $pending | Out-Null
    $log = Join-Path $runtime ($name + '.log')
    & "$env:SystemRoot\System32\robocopy.exe" $source $pending /E /XJ /R:2 /W:2 /COPY:DAT /DCOPY:DAT /XD $runtime /NP /NFL /NDL "/UNILOG:$log" | Out-Null
    $copyResult = $LASTEXITCODE
    if ($copyResult -ge 8) { throw "Copy failed (robocopy code $copyResult). Incomplete backup is retained at $pending. See $log" }
    $files = @(Get-ChildItem -LiteralPath $pending -File -Recurse -Force | ForEach-Object {
        [ordered]@{ Path = $_.FullName.Substring($pending.Length + 1); Bytes = $_.Length; SHA256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    $oldHashes = @{}
    if ($previous) { foreach ($file in $previous.Files) { $oldHashes[$file.Path] = $file.SHA256 } }
    $newHashes = @{}
    $changes = @()
    foreach ($file in $files) {
        $newHashes[$file.Path] = $file.SHA256
        if (!$oldHashes.ContainsKey($file.Path)) { $changes += '+ ' + $file.Path }
        elseif ($oldHashes[$file.Path] -ne $file.SHA256) { $changes += '~ ' + $file.Path }
    }
    foreach ($path in $oldHashes.Keys) { if (!$newHashes.ContainsKey($path)) { $changes += '- ' + $path } }
    [ordered]@{ SnapshotId = $name; DestinationId = $config.DestinationId; CreatedAt = (Get-Date).ToString('o'); Source = $source; FileCount = $files.Count; Changes = $changes; Files = $files } |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $pending 'backup-manifest.json') -Encoding UTF8
    $archived = $null
    if ($previous) {
        $month = $previous.SnapshotId.Substring(0,4) + '-' + $previous.SnapshotId.Substring(4,2)
        $historyMonth = Join-Path (Join-Path $destination '履歴') $month
        New-Item -ItemType Directory -Path $historyMonth -Force | Out-Null
        $archived = Join-Path $historyMonth $previous.SnapshotId
        if (Test-Path -LiteralPath $archived) { throw 'History folder already exists. Nothing was overwritten.' }
        Move-Item -LiteralPath $latest -Destination $archived
    }
    try { Move-Item -LiteralPath $pending -Destination $latest }
    catch {
        if ($archived -and !(Test-Path -LiteralPath $latest)) { Move-Item -LiteralPath $archived -Destination $latest }
        throw
    }
    $completed = $latest
    $index = @('# バックアップ一覧', '', '最新のファイルは [最新](最新/) にあります。`+` 追加、`~` 更新、`-` 元の作業ハブで削除（履歴には保持）。', '')
    $manifestPaths = @((Join-Path $latest 'backup-manifest.json'))
    $historyRoot = Join-Path $destination '履歴'
    if (Test-Path -LiteralPath $historyRoot) { $manifestPaths += @(Get-ChildItem -LiteralPath $historyRoot -Filter 'backup-manifest.json' -File -Recurse | Select-Object -ExpandProperty FullName) }
    foreach ($manifestPath in ($manifestPaths | Sort-Object -Descending)) {
        $entry = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $relative = (Split-Path -Parent $manifestPath).Substring($destination.Length + 1).Replace('\','/')
        $index += ('## ' + $entry.CreatedAt + ' — ' + $entry.FileCount + ' files')
        $index += ('[この保存を開く](' + $relative + '/)')
        $index += ''
        if (@($entry.Changes).Count -eq 0) { $index += '- 変更なし' }
        else { foreach ($change in $entry.Changes) { $index += '- ' + $change } }
        $index += ''
    }
    $index | Set-Content -LiteralPath (Join-Path $destination 'バックアップ一覧.md') -Encoding UTF8
    [ordered]@{ Status = 'Success'; FinishedAt = (Get-Date).ToString('o'); Backup = $completed; FileCount = $files.Count } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'status.json') -Encoding UTF8
    Write-Output "Backup completed: $completed ($($files.Count) files)"
    exit 0
} catch {
    if ($runtime -and $lock) {
        try { [ordered]@{ Status = 'Failed'; FinishedAt = (Get-Date).ToString('o'); Error = $_.Exception.Message } | ConvertTo-Json |
            Set-Content -LiteralPath (Join-Path $runtime 'status.json') -Encoding UTF8 } catch { }
    }
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
