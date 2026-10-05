[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
try {
    $dialog.Title = '資料を追加'
    $dialog.Filter = '画像・PDF|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp;*.tif;*.tiff;*.pdf'
    $dialog.CheckFileExists = $true
    $dialog.Multiselect = $false
    $selected = $dialog.ShowDialog($owner)
    $path = if ($selected -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileName } else { '' }
    @{ Path = $path } | ConvertTo-Json | Set-Content -LiteralPath $ResultPath -Encoding UTF8
} finally { $dialog.Dispose(); $owner.Dispose() }
