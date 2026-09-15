# =========================================================
# Push the variables the app needs from .env.local up to Vercel.
#
# This exists because the thing that keeps breaking production is a value that
# is correct on this machine and absent or mistyped up there. Typing a
# 41-character secret into a masked prompt is how that happens, so nothing here
# is typed: every value is read from .env.local and piped straight in.
#
#   powershell -ExecutionPolicy Bypass -File scripts\sync-vercel-env.ps1
#
# Add -Environment preview to do the preview environment instead.
# =========================================================

param(
    [ValidateSet('production', 'preview', 'development')]
    [string]$Environment = 'production'
)

# Deliberately NOT 'Stop'. Windows PowerShell wraps anything a native .exe
# writes to stderr in a NativeCommandError, and the Vercel CLI writes its
# banner there — under 'Stop' that banner aborted the whole script before a
# single variable went up. Exit codes are checked by hand instead.
$ErrorActionPreference = 'Continue'

# Only the variables the app actually reads. VERCEL_OIDC_TOKEN is issued per
# machine by `vercel dev` and must never be pushed.
#
# NEXT_PUBLIC_ values are marked non-sensitive on purpose. Next.js inlines them
# into the browser bundle at build time, and Vercel refuses to hand a sensitive
# value to a build for exactly that reason — marking them sensitive is what
# silently lost both of them once already.
$WANTED = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET'
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envFile = Join-Path $root '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Host "No .env.local next to the app. Nothing to push." -ForegroundColor Red
    exit 1
}

# Parse KEY=value, ignoring comments, blank lines and any wrapping quotes.
$values = @{}
foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $split = $trimmed.IndexOf('=')
    if ($split -lt 1) { continue }
    $name = $trimmed.Substring(0, $split).Trim()
    $value = $trimmed.Substring($split + 1).Trim().Trim('"').Trim("'")
    if ($value -ne '') { $values[$name] = $value }
}

Write-Host ""
Write-Host "Pushing to $Environment" -ForegroundColor Cyan
Write-Host ""

$failed = 0
foreach ($name in $WANTED) {
    if (-not $values.ContainsKey($name)) {
        Write-Host ("  {0,-34} not in .env.local, skipped" -f $name) -ForegroundColor DarkGray
        continue
    }

    $value = $values[$name]
    if ($name.StartsWith('NEXT_PUBLIC_')) { $privacy = '--no-sensitive' } else { $privacy = '--sensitive' }

    # A temp file keeps the value off the command line and out of the shell
    # history, and WriteAllText with no BOM stops a stray byte or a trailing
    # newline becoming part of the secret.
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmp, $value, (New-Object System.Text.UTF8Encoding $false))

        # --force overwrites in place. There is no `env rm` here on purpose:
        # removing first meant a failed add left the variable simply gone, which
        # is how production lost its Supabase URL.
        $out = Get-Content $tmp -Raw | & vercel env add $name $Environment --force $privacy 2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host ("  {0,-34} set ({1} chars, {2})" -f $name, $value.Length, $privacy.TrimStart('-')) -ForegroundColor Green
        } else {
            $failed++
            Write-Host ("  {0,-34} FAILED" -f $name) -ForegroundColor Red
            # Never swallow this. The one time it was hidden, two variables
            # vanished and the reason went with them.
            $out | ForEach-Object { Write-Host ("      {0}" -f $_) -ForegroundColor DarkRed }
        }
    }
    finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
if ($failed -gt 0) {
    Write-Host "$failed variable(s) failed. Production may be incomplete — check the output above." -ForegroundColor Red
    exit 1
}

Write-Host "Now redeploy so the functions pick them up:" -ForegroundColor Cyan
Write-Host "  vercel --prod"
Write-Host ""
