param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Body,
  [string]$Category = "test",
  [ValidateSet("low", "medium", "high", "critical")][string]$Severity,
  [string]$IdempotencyKey = "ps-$([guid]::NewGuid().ToString())",
  # Optional evidence image path (PNG/JPEG/WebP; the server enforces the account limit).
  [string]$Attachment
)

$notifyUrl = if ($env:ZONA_NOTIFY_URL) { $env:ZONA_NOTIFY_URL } else { "https://gerncrjtrdjtjvybvseb.supabase.co/functions/v1/notify" }
$sourceToken = $env:ZONA_SOURCE_TOKEN

if ([string]::IsNullOrWhiteSpace($sourceToken)) {
  throw "Set ZONA_SOURCE_TOKEN first."
}

# Reuse the same key when retrying a send; a replay returns the original
# notification instead of creating a duplicate.
$headers = @{ Authorization = "Bearer $sourceToken"; "Idempotency-Key" = $IdempotencyKey }

if ($Attachment) {
  # Windows PowerShell 5.1 does not support Invoke-RestMethod -Form, so use
  # HttpClient for multipart uploads on every PowerShell version.
  Add-Type -AssemblyName System.Net.Http
  $file = Get-Item -LiteralPath $Attachment -ErrorAction Stop
  $mime = switch ($file.Extension.ToLowerInvariant()) {
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    default  { "application/octet-stream" }
  }

  $client = New-Object System.Net.Http.HttpClient
  $client.Timeout = [TimeSpan]::FromSeconds(15)
  $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $sourceToken)
  $client.DefaultRequestHeaders.Add("Idempotency-Key", $IdempotencyKey)
  $multipart = New-Object System.Net.Http.MultipartFormDataContent
  $stream = $null
  $response = $null

  try {
    $utf8 = [System.Text.Encoding]::UTF8
    $multipart.Add((New-Object System.Net.Http.StringContent($Title, $utf8)), "title")
    $multipart.Add((New-Object System.Net.Http.StringContent($Body, $utf8)), "body")
    $multipart.Add((New-Object System.Net.Http.StringContent($Category, $utf8)), "category")
    if ($Severity) { $multipart.Add((New-Object System.Net.Http.StringContent($Severity, $utf8)), "severity") }
    $metadata = @{ sender = "send-notification.ps1" } | ConvertTo-Json -Compress
    $multipart.Add((New-Object System.Net.Http.StringContent($metadata, $utf8)), "data")

    $stream = [System.IO.File]::OpenRead($file.FullName)
    $fileContent = New-Object System.Net.Http.StreamContent($stream)
    $fileContent.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue($mime)
    $multipart.Add($fileContent, "attachment", $file.Name)

    $response = $client.PostAsync($notifyUrl, $multipart).GetAwaiter().GetResult()
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "Notification request failed ($([int]$response.StatusCode)): $responseBody"
    }
    $responseBody | ConvertFrom-Json
  } finally {
    if ($response) { $response.Dispose() }
    $multipart.Dispose()
    if ($stream) { $stream.Dispose() }
    $client.Dispose()
  }
} else {
  $payload = @{
    title = $Title
    body = $Body
    category = $Category
    data = @{ sender = "send-notification.ps1" }
  }
  if ($Severity) { $payload.severity = $Severity }
  $json = $payload | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Post -Uri $notifyUrl -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 10
}
