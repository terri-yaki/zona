# Publishes a locally built preview IPA for over-the-air install.
#
# The GitHub release tagged `preview` always carries the latest ad-hoc IPA as
# the asset `Zona.ipa`, so the install manifest (preview/manifest.plist) and
# the install page (gh-pages branch) never need to change. Uploading a new
# build is the only step required for a new over-the-air preview.
#
# Usage (from the repository root):
#   .\scripts\publish-preview.ps1 -IpaPath "$env:USERPROFILE\Downloads\Zona-v0.0.6-build16.ipa"
#
# Requires: gh CLI with GH_TOKEN (or gh auth login), and the release tagged
# `preview` to exist (created automatically on first run).

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$IpaPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $IpaPath)) { throw "IPA not found: $IpaPath" }

# The asset name is part of the URL in preview/manifest.plist; never change it.
$staged = Join-Path $env:TEMP 'Zona.ipa'
Copy-Item $IpaPath $staged -Force

$release = gh release view preview --json tagName 2>$null
if ($LASTEXITCODE -ne 0) {
  gh release create preview --title 'Preview builds' --notes 'Latest internal preview build. Install from https://terri-yaki.github.io/zona/'
  if ($LASTEXITCODE -ne 0) { throw 'failed to create the preview release' }
}

gh release upload preview $staged --clobber
if ($LASTEXITCODE -ne 0) { throw 'failed to upload the IPA' }

Remove-Item $staged -Force
Write-Host 'Published. Install or update on the iPhone from https://terri-yaki.github.io/zona/'
