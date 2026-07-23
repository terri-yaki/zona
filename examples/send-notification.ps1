param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Body,
  [string]$Category = "test",
  [string]$IdempotencyKey = "ps-$([guid]::NewGuid().ToString())",
  # Optional evidence image path (PNG/JPEG/WebP, at most 5 MiB).
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
  # Multipart form requires PowerShell 7.3 or newer.
  $form = @{
    title = $Title
    body = $Body
    category = $Category
    data = (@{ sender = "send-notification.ps1" } | ConvertTo-Json -Compress)
    attachment = Get-Item -Path $Attachment
  }
  Invoke-RestMethod -Method Post -Uri $notifyUrl -Headers $headers -Form $form -TimeoutSec 10
} else {
  $payload = @{
    title = $Title
    body = $Body
    category = $Category
    data = @{ sender = "send-notification.ps1" }
  } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Method Post -Uri $notifyUrl -Headers $headers -ContentType "application/json" -Body $payload -TimeoutSec 10
}
