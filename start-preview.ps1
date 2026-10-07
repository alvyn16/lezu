$ErrorActionPreference = 'Stop'
$previewDirectory = Join-Path $PSScriptRoot 'ui'
Write-Host 'Lezu UI preview: http://127.0.0.1:4173 — press Ctrl+C to stop.'
python -m http.server 4173 --bind 127.0.0.1 --directory $previewDirectory
