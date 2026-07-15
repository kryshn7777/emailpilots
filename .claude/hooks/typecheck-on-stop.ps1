# Stop hook: type-check the core project when TypeScript changed this session.
# Non-blocking (always exits 0) — informational only, never blocks Claude from stopping.
# Gated on a stamp file so it only runs tsc when a .ts under src/ or electron/ is
# newer than the last check. Full 3-project sweep lives in the /typecheck skill.
#
# Disable: remove the "hooks" block from .claude/settings.json.

$ErrorActionPreference = 'SilentlyContinue'

# Project root = two levels up from this script (.claude/hooks/ -> repo root)
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$stamp = Join-Path $PSScriptRoot '.typecheck-stamp'

# Newest .ts modification time under src/ and electron/
$dirs = @('src', 'electron') | Where-Object { Test-Path $_ }
if (-not $dirs) { exit 0 }

$newest = Get-ChildItem -Path $dirs -Recurse -Filter *.ts -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $newest) { exit 0 }

# Skip if nothing changed since the last check.
if (Test-Path $stamp) {
    $last = (Get-Item $stamp).LastWriteTime
    if ($newest.LastWriteTime -le $last) { exit 0 }
}

# Refresh the stamp up front so a slow/errored run doesn't re-trigger every stop.
Set-Content -Path $stamp -Value (Get-Date -Format o) -Encoding utf8

# Core project only (fast). ELECTRON + RENDERER projects: run /typecheck.
$out = & npx tsc -p tsconfig.json --noEmit 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Output '[typecheck] core (tsconfig.json) OK'
} else {
    $errCount = ($out | Select-String -Pattern 'error TS' | Measure-Object).Count
    Write-Output "[typecheck] core FAILED — $errCount type error(s). Run /typecheck for the full report (core + electron + renderer)."
}

exit 0
