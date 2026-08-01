param(
  [string]$ProjectUrl = 'https://gerncrjtrdjtjvybvseb.supabase.co',
  [string]$TokenPath = 'C:\Users\hoyul\.zona\token'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $TokenPath)) {
  throw "Zona source token not found at $TokenPath"
}

$sourceToken = (Get-Content -Raw -LiteralPath $TokenPath).Trim()
if ($sourceToken -notmatch '^zona_live_[A-Za-z0-9_-]{43}$') {
  throw 'The Zona report source token has an invalid format.'
}

$secretBytes = [byte[]]::new(48)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$reportSecret = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("zona-daily-report-" + [guid]::NewGuid().ToString('N'))
$envFile = Join-Path $temporaryRoot 'secrets.env'
$sqlFile = Join-Path $temporaryRoot 'configure.sql'

try {
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
  [IO.File]::WriteAllText($envFile, "ZONA_REPORT_TOKEN=$sourceToken`nDAILY_REPORT_SECRET=$reportSecret`n")
  & npx --yes supabase@2.110.0 secrets set --env-file $envFile
  if ($LASTEXITCODE -ne 0) { throw 'Could not set Edge Function secrets.' }

  $escapedUrl = $ProjectUrl.Replace("'", "''")
  $escapedSecret = $reportSecret.Replace("'", "''")
  [IO.File]::WriteAllText(
    $sqlFile,
    "select public.configure_daily_stats_report_internal('$escapedUrl', '$escapedSecret');`n"
  )
  & npx --yes supabase@2.110.0 db query --linked --file $sqlFile
  if ($LASTEXITCODE -ne 0) { throw 'Could not configure the database scheduler.' }
}
finally {
  $sourceToken = $null
  $reportSecret = $null
  if (Test-Path -LiteralPath $temporaryRoot) {
    $resolved = [IO.Path]::GetFullPath($temporaryRoot)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolved).StartsWith('zona-daily-report-')) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}

Write-Host 'Daily Zona report configured for 00:05 UTC.'
