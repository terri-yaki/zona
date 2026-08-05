[CmdletBinding()]
param(
    [switch]$Submit
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appRoot = Join-Path $repositoryRoot 'zona'
$package = Get-Content -Raw (Join-Path $appRoot 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$commit = (& git -C $repositoryRoot rev-parse --short HEAD).Trim()

$sshKey = Join-Path $env:USERPROFILE '.ssh\macos-tahoe-vm_ed25519'
$sshTarget = 'terry@192.168.0.89'
$remoteRoot = "/Users/terry/workspace/zona-v$version-$commit-$stamp"
$remoteTar = "$remoteRoot.tar"
$remoteApp = "$remoteRoot/zona"
$remoteIpa = "/Users/terry/workspace/Zona-v$version-$stamp.ipa"
$remoteLog = "/Users/terry/workspace/Zona-v$version-$stamp-build.log"
$localTar = Join-Path $env:TEMP "zona-v$version-$stamp.tar"
$localIpa = Join-Path ([Environment]::GetFolderPath('UserProfile')) "Downloads\Zona-v$version-$stamp.ipa"

if (-not (Test-Path -LiteralPath $sshKey)) {
    throw "SSH key not found: $sshKey"
}

function Invoke-Remote {
    param([Parameter(Mandatory)][string]$Command)

    # Here-strings inherit this file's line endings; a CRLF checkout would send
    # stray carriage returns that the remote shell rejects ("bad option: -^M").
    $Command = $Command -replace "`r`n", "`n"
    & ssh -o BatchMode=yes -o ConnectTimeout=8 -i $sshKey $sshTarget $Command
    if ($LASTEXITCODE -ne 0) {
        throw 'The command on the Mac build VM failed.'
    }
}

try {
    Write-Host "Packaging Zona $version from $repositoryRoot"
    & tar -cf $localTar `
        --exclude=.git `
        --exclude=graphify-out `
        --exclude=zona/node_modules `
        --exclude=zona/.env `
        --exclude='*.ipa' `
        --exclude='*.log' `
        -C $repositoryRoot .
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the source archive.'
    }

    & scp -i $sshKey $localTar "${sshTarget}:$remoteTar"
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not send the source archive to the Mac build VM.'
    }

    $prepare = @'
set -e
test ! -e '{REMOTE_ROOT}'
mkdir '{REMOTE_ROOT}'
tar -xf '{REMOTE_TAR}' -C '{REMOTE_ROOT}'
test -f /Users/terry/workspace/zona/zona/.env
cp /Users/terry/workspace/zona/zona/.env '{REMOTE_APP}/.env'
rm '{REMOTE_TAR}'
'@.Replace('{REMOTE_ROOT}', $remoteRoot).Replace('{REMOTE_TAR}', $remoteTar).Replace('{REMOTE_APP}', $remoteApp)
    Invoke-Remote $prepare

    $build = @'
set -e
set -o pipefail
export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1
cd '{REMOTE_APP}'
set -a
. ./.env
set +a
npm ci --include=dev
npm run release:check
npm run typecheck
npm test
NODE_ENV=production caffeinate -dims eas build --platform ios --profile production --local --non-interactive --output '{REMOTE_IPA}' 2>&1 | tee '{REMOTE_LOG}'
'@.Replace('{REMOTE_APP}', $remoteApp).Replace('{REMOTE_IPA}', $remoteIpa).Replace('{REMOTE_LOG}', $remoteLog)
    Invoke-Remote $build

    $verify = @'
set -e
verify_dir=$(mktemp -d /tmp/zona-verify.XXXXXX)
case "$verify_dir" in /tmp/zona-verify.*) ;; *) exit 1 ;; esac
unzip -q '{REMOTE_IPA}' -d "$verify_dir"
app_path=$(find "$verify_dir/Payload" -maxdepth 1 -name '*.app' -type d | head -1)
test -n "$app_path"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Info.plist"
codesign --verify --deep --strict "$app_path"
codesign -dv --verbose=2 "$app_path" 2>&1 | grep -E 'Identifier=|TeamIdentifier=|Authority='
rm -rf "$verify_dir"
'@.Replace('{REMOTE_IPA}', $remoteIpa)
    Invoke-Remote $verify

    & scp -i $sshKey "${sshTarget}:$remoteIpa" $localIpa
    if ($LASTEXITCODE -ne 0) {
        throw 'The IPA was built but could not be copied back to Windows.'
    }

    if ($Submit) {
        # NOTE: do not name this local $submit — case-insensitive collision
        # with the [switch]$Submit parameter converts the string and fails.
        $submitCommand = @'
set -e
export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
cd '{REMOTE_APP}'
caffeinate -dims eas submit --platform ios --profile production --path '{REMOTE_IPA}' --non-interactive
'@.Replace('{REMOTE_APP}', $remoteApp).Replace('{REMOTE_IPA}', $remoteIpa)
        Invoke-Remote $submitCommand
    }

    Write-Host "IPA ready: $localIpa"
    Write-Host "Mac build log: $remoteLog"
}
finally {
    if (Test-Path -LiteralPath $localTar) {
        Remove-Item -LiteralPath $localTar -Force
    }
}
