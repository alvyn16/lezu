$ErrorActionPreference = 'Stop'
Write-Host 'Lezu UI preview: http://127.0.0.1:4173 — press Ctrl+C to stop.'
Push-Location $PSScriptRoot
try { npm run dev } finally { Pop-Location }
