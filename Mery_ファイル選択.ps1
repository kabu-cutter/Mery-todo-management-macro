param([Parameter(Mandatory=$true)][string]$ResultPath)

Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'TODOに追加するファイルを選択'
$dialog.Filter = '対応ファイル (*.txt;*.docx;*.pdf;*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp;*.tif;*.tiff)|*.txt;*.docx;*.pdf;*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp;*.tif;*.tiff|すべてのファイル (*.*)|*.*'
$dialog.Multiselect = $false
$path = ''
try {
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $path = $dialog.FileName
    }
    $json = @{ Path = $path } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($ResultPath, $json, [System.Text.UTF8Encoding]::new($false))
} finally {
    $dialog.Dispose()
}
