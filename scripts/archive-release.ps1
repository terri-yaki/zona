[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$DefinitionPath,
    [string]$SourceCommit = 'HEAD'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$archiveRoot = Join-Path $repositoryRoot 'versions'
$definitionFile = (Resolve-Path -LiteralPath $DefinitionPath).Path
$definition = Get-Content -Raw -LiteralPath $definitionFile | ConvertFrom-Json

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = & git -C $repositoryRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git failed: git $($Arguments -join ' ')"
    }
    return $output
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8 {
    param(
        [Parameter(Mandatory)][string]$Path,
        [AllowEmptyString()][string]$Content
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Write-ReleaseNotes {
    param(
        [Parameter(Mandatory)]$Definition,
        [Parameter(Mandatory)][ValidateSet('en', 'zhHant')][string]$Language,
        [Parameter(Mandatory)][string]$Path
    )

    $titleProperty = if ($Language -eq 'en') { 'titleEn' } else { 'titleZhHant' }
    $bodyProperty = if ($Language -eq 'en') { 'bodyEn' } else { 'bodyZhHant' }
    $titlePunctuation = if ($Language -eq 'en') { '.' } else { '。' }
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("# Zona $($Definition.version)")
    $lines.Add('')
    $lines.Add("## $($Definition.title.$Language)")
    $lines.Add('')
    $lines.Add($Definition.summary.$Language)
    foreach ($item in $Definition.items) {
        $lines.Add('')
        $lines.Add("- **$($item.$titleProperty)$titlePunctuation** $($item.$bodyProperty)")
    }
    $lines.Add('')
    Write-Utf8 -Path $Path -Content ($lines -join "`n")
}

if ($definition.version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid semantic version in $definitionFile"
}
if (-not $definition.previousVersion) {
    throw 'A previousVersion is required for incremental archives.'
}
if (-not $definition.deltaMigrations -or $definition.deltaMigrations.Count -eq 0) {
    throw 'At least one delta migration is required.'
}
if (-not $definition.items -or $definition.items.Count -eq 0) {
    throw 'At least one customer-facing release item is required.'
}

$sourceCommit = (Invoke-Git -Arguments @('rev-parse', "$SourceCommit^{commit}") | Select-Object -First 1).Trim()
$versionName = "v$($definition.version)"
$versionRoot = Join-Path $archiveRoot $versionName
$previousVersionRoot = Join-Path $archiveRoot "v$($definition.previousVersion)"
if (Test-Path -LiteralPath $versionRoot) {
    throw "Refusing to overwrite existing archive: $versionRoot"
}
if (-not (Test-Path -LiteralPath $previousVersionRoot)) {
    throw "Previous archive not found: $previousVersionRoot"
}

$existingIndex = Get-Content -Raw -LiteralPath (Join-Path $archiveRoot 'releases.json') | ConvertFrom-Json
if ($existingIndex.version -contains $definition.version) {
    throw "Version already exists in releases.json: $($definition.version)"
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("zona-release-archive-" + [guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $temporaryRoot $versionName
$tarPath = Join-Path $temporaryRoot "$versionName.tar"
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

try {
    Invoke-Git -Arguments @('archive', '--format=tar', "--output=$tarPath", $sourceCommit) | Out-Null
    & tar -xf $tarPath -C $extractRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to extract $sourceCommit"
    }

    $appJsonVersion = (Get-Content -Raw -LiteralPath (Join-Path $extractRoot 'zona\app.json') | ConvertFrom-Json).expo.version
    $packageJsonVersion = (Get-Content -Raw -LiteralPath (Join-Path $extractRoot 'zona\package.json') | ConvertFrom-Json).version
    if ($appJsonVersion -ne $definition.version -or $packageJsonVersion -ne $definition.version) {
        throw "Release version mismatch: app.json=$appJsonVersion package.json=$packageJsonVersion expected=$($definition.version)"
    }

    $databaseRoot = Join-Path $versionRoot 'database'
    $databaseMigrations = Join-Path $databaseRoot 'migrations'
    $documentsRoot = Join-Path $versionRoot 'documents'
    $documentsSnapshot = Join-Path $documentsRoot 'snapshot'
    New-Item -ItemType Directory -Force -Path $databaseMigrations, $documentsSnapshot | Out-Null

    $sourceMigrations = Join-Path $extractRoot 'supabase\migrations'
    Get-ChildItem -LiteralPath $sourceMigrations -File -Filter '*.sql' | Sort-Object Name | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $databaseMigrations $_.Name)
    }

    $migrationNames = @(Get-ChildItem -LiteralPath $databaseMigrations -File | ForEach-Object Name)
    foreach ($deltaMigration in $definition.deltaMigrations) {
        if ($migrationNames -notcontains $deltaMigration) {
            throw "Delta migration is not present in $sourceCommit`: $deltaMigration"
        }
    }

    $snapshotCandidates = @(
        'README.md',
        'CHANGELOG.md',
        'SECURITY.md',
        'PRIVACY.md',
        'docs',
        'supabase\README.md',
        'zona\README.md'
    )
    foreach ($candidate in $snapshotCandidates) {
        $source = Join-Path $extractRoot $candidate
        if (-not (Test-Path -LiteralPath $source)) {
            continue
        }
        $destination = Join-Path $documentsSnapshot $candidate
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }

    Write-Utf8 -Path (Join-Path $databaseRoot 'delta-migrations.txt') -Content (($definition.deltaMigrations -join "`n") + "`n")
    Write-ReleaseNotes -Definition $definition -Language 'en' -Path (Join-Path $documentsRoot 'release-notes.en.md')
    Write-ReleaseNotes -Definition $definition -Language 'zhHant' -Path (Join-Path $documentsRoot 'release-notes.zh-Hant.md')
    Write-Utf8 -Path (Join-Path $documentsRoot 'version-items.json') -Content (($definition | Select-Object version, title, summary, items | ConvertTo-Json -Depth 8) + "`n")

    $introducedIn = @{}
    $previousManifest = Get-Content -Raw -LiteralPath (Join-Path $previousVersionRoot 'database\migration-manifest.json') | ConvertFrom-Json
    foreach ($entry in $previousManifest) {
        $introducedIn[$entry.file] = $entry.introducedIn
    }
    foreach ($deltaMigration in $definition.deltaMigrations) {
        if ($introducedIn.ContainsKey($deltaMigration)) {
            throw "Migration was already assigned to an earlier release: $deltaMigration"
        }
        $introducedIn[$deltaMigration] = $definition.version
    }

    $migrationManifest = @()
    Get-ChildItem -LiteralPath $databaseMigrations -File | Sort-Object Name | ForEach-Object {
        if (-not $introducedIn.ContainsKey($_.Name)) {
            throw "Migration has no release ownership: $($_.Name)"
        }
        $originPath = "supabase/migrations/$($_.Name)"
        $blob = (Invoke-Git -Arguments @('rev-parse', "$sourceCommit`:$originPath") | Select-Object -First 1).Trim()
        $migrationManifest += [ordered]@{
            file = $_.Name
            originPath = $originPath
            introducedIn = $introducedIn[$_.Name]
            gitBlob = $blob
            sha256 = Get-Sha256 -Path $_.FullName
        }
    }
    Write-Utf8 -Path (Join-Path $databaseRoot 'migration-manifest.json') -Content (($migrationManifest | ConvertTo-Json -Depth 6) + "`n")

    $databaseChecksums = Get-ChildItem -LiteralPath $databaseRoot -Recurse -File |
        Where-Object Name -ne 'checksums.sha256' |
        Sort-Object FullName |
        ForEach-Object {
            $relative = [System.IO.Path]::GetRelativePath($databaseRoot, $_.FullName).Replace('\', '/')
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
    Write-Utf8 -Path (Join-Path $databaseRoot 'checksums.sha256') -Content (($databaseChecksums -join "`n") + "`n")

    $documentFiles = Get-ChildItem -LiteralPath $documentsRoot -Recurse -File |
        Where-Object { $_.Name -notin @('document-manifest.json', 'checksums.sha256', 'changed-files.txt') } |
        Sort-Object FullName
    $documentManifest = @($documentFiles | ForEach-Object {
        [ordered]@{
            file = [System.IO.Path]::GetRelativePath($documentsRoot, $_.FullName).Replace('\', '/')
            sha256 = Get-Sha256 -Path $_.FullName
        }
    })
    Write-Utf8 -Path (Join-Path $documentsRoot 'document-manifest.json') -Content (($documentManifest | ConvertTo-Json -Depth 5) + "`n")

    $previousRelease = Get-Content -Raw -LiteralPath (Join-Path $previousVersionRoot 'release.json') | ConvertFrom-Json
    $changedFiles = @(Invoke-Git -Arguments @('diff', '--name-only', "$($previousRelease.sourceCommit)..$sourceCommit") |
        Where-Object { $_ -match '^(README\.md|CHANGELOG\.md|SECURITY\.md|PRIVACY\.md|docs/|supabase/README\.md|zona/README\.md)' } |
        Sort-Object -Unique)
    Write-Utf8 -Path (Join-Path $documentsRoot 'changed-files.txt') -Content (($changedFiles -join "`n") + "`n")

    $documentChecksums = Get-ChildItem -LiteralPath $documentsRoot -Recurse -File |
        Where-Object Name -ne 'checksums.sha256' |
        Sort-Object FullName |
        ForEach-Object {
            $relative = [System.IO.Path]::GetRelativePath($documentsRoot, $_.FullName).Replace('\', '/')
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
    Write-Utf8 -Path (Join-Path $documentsRoot 'checksums.sha256') -Content (($documentChecksums -join "`n") + "`n")

    $releaseMetadata = [ordered]@{
        version = $definition.version
        sourceCommit = $sourceCommit
        sourceBranch = $definition.sourceBranch
        gitTag = $null
        boundaryConfidence = $definition.boundaryConfidence
        boundaryNote = $definition.boundaryNote
        previousVersion = $definition.previousVersion
        appJsonVersion = $appJsonVersion
        packageJsonVersion = $packageJsonVersion
        migrationCount = $migrationManifest.Count
        deltaMigrationCount = $definition.deltaMigrations.Count
        documentCount = $documentManifest.Count
    }
    Write-Utf8 -Path (Join-Path $versionRoot 'release.json') -Content (($releaseMetadata | ConvertTo-Json -Depth 6) + "`n")

    $releaseIndex = @($existingIndex) + [pscustomobject][ordered]@{
        version = $definition.version
        sourceCommit = $sourceCommit
        gitTag = $null
        boundaryConfidence = $definition.boundaryConfidence
        previousVersion = $definition.previousVersion
        path = $versionName
    }
    Write-Utf8 -Path (Join-Path $archiveRoot 'releases.json') -Content (($releaseIndex | ConvertTo-Json -Depth 5) + "`n")

    $versionsReadme = Join-Path $archiveRoot 'README.md'
    $readmeContent = Get-Content -Raw -LiteralPath $versionsReadme
    $updatedReadme = [regex]::Replace($readmeContent, 'through 0\.0\.\d+', "through $($definition.version)", 1)
    if ($updatedReadme -eq $readmeContent) {
        throw 'Could not update the version range in versions/README.md.'
    }
    Write-Utf8 -Path $versionsReadme -Content $updatedReadme
}
finally {
    $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
    $systemTemporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemporaryRoot.StartsWith($systemTemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTemporaryRoot).StartsWith('zona-release-archive-')) {
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
    } else {
        throw "Refusing to remove unexpected temporary path: $resolvedTemporaryRoot"
    }
}

Write-Host "Created $versionName from $sourceCommit"
