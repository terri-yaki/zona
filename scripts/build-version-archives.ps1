[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$archiveRoot = Join-Path $repositoryRoot 'versions'

if (Test-Path -LiteralPath $archiveRoot) {
    throw "Refusing to overwrite existing archive: $archiveRoot"
}

$releases = @(
    [ordered]@{
        version = '0.0.1'
        commit = 'bfad2dd400c7f92952e848cd8554f9307156a06f'
        boundaryConfidence = 'inferred'
        boundaryNote = 'First complete multi-PC notification MVP; manifests at this commit still report 1.0.0.'
        previousVersion = $null
        deltaMigrations = @(
            '202607200001_initial.sql',
            '202607200002_production_hardening.sql',
            '202607200003_notification_attachments.sql',
            '202607240001_app_options_api_keys.sql',
            '202607240002_fix_api_key_last_used.sql',
            '202607240003_per_host_sounds_and_fast_mobile_rpc.sql'
        )
        copy = [ordered]@{
            en = [ordered]@{
                title = 'Your PCs, one pocket inbox'
                summary = 'Bring alerts from different computers together and always know where each one came from.'
                items = @(
                    [ordered]@{ title = 'Every PC has a name'; body = 'Each alert shows its source, so work, home, and server messages never blur together.' },
                    [ordered]@{ title = 'Seven days at a glance'; body = 'Search recent alerts by computer, time, or unread status whenever a push arrives at the wrong moment.' },
                    [ordered]@{ title = 'One key per computer'; body = 'Disconnect one machine without interrupting the rest of your setup.' }
                )
            }
            zhHant = [ordered]@{
                title = '多部電腦，一個隨身收件箱'
                summary = '把不同電腦的提醒集中在一起，每次都清楚知道訊息來自哪裡。'
                items = @(
                    [ordered]@{ title = '每部電腦都有自己的名字'; body = '工作、家中和伺服器的提醒各自分明，不會混在一起。' },
                    [ordered]@{ title = '七天提醒一眼掌握'; body = '即使當下錯過推送，也可以按電腦、時間或未讀狀態找回提醒。' },
                    [ordered]@{ title = '每部電腦獨立連接'; body = '移除其中一部電腦時，其他來源仍可繼續使用。' }
                )
            }
        }
    },
    [ordered]@{
        version = '0.0.2'
        commit = 'eefae7600c37eb786d6c8e1d7d94013c9aa2f4a8'
        boundaryConfidence = 'medium'
        boundaryNote = 'Commit explicitly prepares 0.0.2; app.json and package.json disagree on the version.'
        previousVersion = '0.0.1'
        deltaMigrations = @(
            '202607240004_more_notification_sounds.sql',
            '202607240005_live_activity_option.sql'
        )
        copy = [ordered]@{
            en = [ordered]@{
                title = 'More personal, less waiting'
                summary = 'Zona feels closer to home with your language, your sounds, and richer alerts.'
                items = @(
                    [ordered]@{ title = 'English or Traditional Chinese'; body = 'Choose the language that feels natural throughout the app.' },
                    [ordered]@{ title = 'Hear which PC needs you'; body = 'Give each computer its own alert sound and recognize the source before looking.' },
                    [ordered]@{ title = 'See the whole story'; body = 'Image attachments and Live Status put useful context where you can reach it quickly.' },
                    [ordered]@{ title = 'Less time watching loaders'; body = 'Common account and inbox actions respond with less waiting.' }
                )
            }
            zhHant = [ordered]@{
                title = '更貼心，也少一點等待'
                summary = 'Zona 現在支援你的語言、聲音和更豐富的提醒內容。'
                items = @(
                    [ordered]@{ title = '英文或繁體中文'; body = '在整個應用程式中選擇最自然的語言。' },
                    [ordered]@{ title = '用聲音分辨電腦'; body = '為每部電腦選擇不同提示音，不用看螢幕也能認出來源。' },
                    [ordered]@{ title = '提醒內容更完整'; body = '圖片附件和即時狀態讓重要資訊更容易看到。' },
                    [ordered]@{ title = '少看一點載入畫面'; body = '常用的帳戶和收件箱操作現在回應更快。' }
                )
            }
        }
    },
    [ordered]@{
        version = '0.0.3'
        commit = '6fb30265407bb682f047aaaeb885c0532d335f37'
        boundaryConfidence = 'inferred'
        boundaryNote = 'Last commit before Android and 0.0.4 development began; package.json still reports an older version.'
        previousVersion = '0.0.2'
        deltaMigrations = @(
            '202607250001_harden_account_deletion.sql',
            '202607250002_ios_alert_tone_sounds.sql',
            '202607250003_remove_zona_sound_presets.sql',
            '202607250004_app_changelog.sql',
            '202607260001_restore_notification_attachments_bucket.sql',
            '202607260002_fix_delete_account_coalesce.sql',
            '202607260003_changelog_0_0_3.sql',
            '202607260004_changelog_ci_test.sql'
        )
        copy = [ordered]@{
            en = [ordered]@{
                title = 'Make every alert sound like yours'
                summary = 'A wider sound collection and clearer release stories make Zona easier to recognize and understand.'
                items = @(
                    [ordered]@{ title = 'Choose from 66 iPhone tones'; body = 'Give different computers a sound that stands out without feeling out of place.' },
                    [ordered]@{ title = 'What''s new, right in Zona'; body = 'See the useful changes in each update without hunting through technical notes.' },
                    [ordered]@{ title = 'A safer goodbye'; body = 'Account deletion now asks twice before removing your Zona data.' }
                )
            }
            zhHant = [ordered]@{
                title = '讓每個提醒都有你的聲音'
                summary = '更多提示音和更清楚的更新故事，讓 Zona 更容易辨認和了解。'
                items = @(
                    [ordered]@{ title = '從 66 款 iPhone 提示音中選擇'; body = '為不同電腦挑選容易辨認，又自然順耳的聲音。' },
                    [ordered]@{ title = '直接在 Zona 查看更新'; body = '不用翻查技術文件，也能知道每次更新帶來甚麼。' },
                    [ordered]@{ title = '告別前多一重保障'; body = '刪除帳戶前會再次確認，避免意外移除 Zona 資料。' }
                )
            }
        }
    },
    [ordered]@{
        version = '0.0.4'
        commit = 'bc03ffefe811ac5eec8193cc2ee1b0f3914dc832'
        boundaryConfidence = 'strong'
        boundaryNote = 'Explicit Android release commit; app.json and package.json both report 0.0.4.'
        previousVersion = '0.0.3'
        deltaMigrations = @(
            '20260726060048_android_push_devices.sql',
            '20260726075743_changelog_0_0_4_android_support.sql'
        )
        copy = [ordered]@{
            en = [ordered]@{
                title = 'Zona now supports Android!'
                summary = 'Your PC alerts can now follow you to either iPhone or Android.'
                items = @(
                    [ordered]@{ title = 'One inbox across phones'; body = 'Receive the same source-aware alerts on the mobile platform you use.' },
                    [ordered]@{ title = 'Made to feel at home on Android'; body = 'Navigation, spacing, notification channels, and sounds now fit the platform.' }
                )
            }
            zhHant = [ordered]@{
                title = 'Zona 現已支援 Android！'
                summary = '無論使用 iPhone 還是 Android，電腦提醒都可以跟著你。'
                items = @(
                    [ordered]@{ title = '不同手機，同一個收件箱'; body = '在你使用的平台接收提醒，並清楚看到每則訊息的來源。' },
                    [ordered]@{ title = '真正融入 Android'; body = '導覽、版面、通知頻道和聲音都更符合 Android 的使用方式。' }
                )
            }
        }
    },
    [ordered]@{
        version = '0.0.5'
        commit = '5d2c8f16b38be914813f451cc507e1e7e26e042e'
        boundaryConfidence = 'strong'
        boundaryNote = 'Explicit severity release commit; app.json and package.json both report 0.0.5.'
        previousVersion = '0.0.4'
        deltaMigrations = @('20260726080400_add_notification_severity.sql')
        copy = [ordered]@{
            en = [ordered]@{
                title = 'See what needs attention first'
                summary = 'Alert colors now help the important things rise above the everyday noise.'
                items = @(
                    [ordered]@{ title = 'Four clear levels'; body = 'Use green, yellow, orange, or red to show how urgently an alert needs attention.' },
                    [ordered]@{ title = 'Priority you can spot instantly'; body = 'Severity appears in both notifications and the inbox, while ordinary alerts stay clean and white.' }
                )
            }
            zhHant = [ordered]@{
                title = '一眼看出甚麼最重要'
                summary = '提醒顏色讓重要事項自然浮現，不再被日常訊息淹沒。'
                items = @(
                    [ordered]@{ title = '四個清楚等級'; body = '用綠、黃、橙或紅色，表達提醒需要多快處理。' },
                    [ordered]@{ title = '優先次序一眼可見'; body = '通知和收件箱都會顯示重要程度，一般提醒則保持簡潔白色。' }
                )
            }
        }
    },
    [ordered]@{
        version = '0.0.6'
        commit = 'ce20ef014222130a12c24e04ff09bb6f498c34a3'
        boundaryConfidence = 'strong'
        boundaryNote = 'Exact source commit used for the 0.0.6 production build; app.json and package.json both report 0.0.6.'
        previousVersion = '0.0.5'
        deltaMigrations = @(
            '202607270001_universal_app_options.sql',
            '202607280001_universal_app_options_key_value.sql',
            '202607280002_changelog_0_0_6.sql',
            '202607280003_app_changelog_is_active.sql',
            '20260728101144_v0_0_6_runtime_control_model.sql',
            '20260728110731_fix_app_options_premium_guard.sql'
        )
        copy = [ordered]@{
            en = [ordered]@{
                title = 'Zona adapts more smoothly'
                summary = 'The app can now keep you informed when something changes, without getting in the way of essential controls.'
                items = @(
                    [ordered]@{ title = 'Helpful notices at the right moment'; body = 'Zona can explain maintenance or important updates inside the app when they matter.' },
                    [ordered]@{ title = 'Only the updates meant for you'; body = 'What''s New can show the right highlights for your phone and hide outdated cards without erasing history.' },
                    [ordered]@{ title = 'Essential controls stay within reach'; body = 'Even during a temporary service pause, privacy, account, and safety actions remain available.' },
                    [ordered]@{ title = 'A steadier foundation'; body = 'Zona can adjust selected features safely as the service grows, so fixes can reach you with less disruption.' }
                )
            }
            zhHant = [ordered]@{
                title = 'Zona 現在更懂得靈活配合'
                summary = '當服務有變化時，應用程式可以清楚通知你，同時保留重要控制。'
                items = @(
                    [ordered]@{ title = '在適當時候提供提示'; body = '需要維護或有重要更新時，Zona 可以直接在應用程式內說明。' },
                    [ordered]@{ title = '只顯示適合你的更新'; body = '「最新消息」會按你的手機顯示相關內容，過時項目可以隱藏，歷史仍然保留。' },
                    [ordered]@{ title = '重要控制隨時可用'; body = '即使部分服務暫停，私隱、帳戶和安全操作仍可繼續使用。' },
                    [ordered]@{ title = '為未來打好基礎'; body = 'Zona 可以隨服務成長安全調整部分功能，讓修正帶來更少干擾。' }
                )
            }
        }
    }
)

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
        [Parameter(Mandatory)]$Copy,
        [Parameter(Mandatory)][string]$Language,
        [Parameter(Mandatory)][string]$Path
    )

    $localized = $Copy[$Language]
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("# $($localized.title)")
    $lines.Add('')
    $lines.Add($localized.summary)
    foreach ($item in $localized.items) {
        $lines.Add('')
        $lines.Add("## $($item.title)")
        $lines.Add('')
        $lines.Add($item.body)
    }
    $lines.Add('')
    Write-Utf8 -Path $Path -Content ($lines -join "`n")
}

$introducedIn = @{}
foreach ($release in $releases) {
    foreach ($migration in $release.deltaMigrations) {
        if ($introducedIn.ContainsKey($migration)) {
            throw "Migration assigned more than once: $migration"
        }
        $introducedIn[$migration] = $release.version
    }
}

New-Item -ItemType Directory -Path $archiveRoot | Out-Null
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("zona-version-archives-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
    foreach ($release in $releases) {
        $versionName = "v$($release.version)"
        $versionRoot = Join-Path $archiveRoot $versionName
        $databaseRoot = Join-Path $versionRoot 'database'
        $databaseMigrations = Join-Path $databaseRoot 'migrations'
        $documentsRoot = Join-Path $versionRoot 'documents'
        $documentsSnapshot = Join-Path $documentsRoot 'snapshot'
        $extractRoot = Join-Path $temporaryRoot $versionName
        $tarPath = Join-Path $temporaryRoot "$versionName.tar"

        New-Item -ItemType Directory -Force -Path $databaseMigrations, $documentsSnapshot, $extractRoot | Out-Null
        Invoke-Git -Arguments @('archive', '--format=tar', "--output=$tarPath", $release.commit) | Out-Null
        & tar -xf $tarPath -C $extractRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to extract $versionName"
        }

        $sourceMigrations = Join-Path $extractRoot 'supabase\migrations'
        if (Test-Path -LiteralPath $sourceMigrations) {
            Get-ChildItem -LiteralPath $sourceMigrations -File | Sort-Object Name | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $databaseMigrations $_.Name)
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
            $destinationParent = Split-Path -Parent $destination
            New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
            Copy-Item -LiteralPath $source -Destination $destination -Recurse
        }

        Write-Utf8 -Path (Join-Path $databaseRoot 'delta-migrations.txt') -Content (($release.deltaMigrations -join "`n") + "`n")
        Write-ReleaseNotes -Copy $release.copy -Language 'en' -Path (Join-Path $documentsRoot 'release-notes.en.md')
        Write-ReleaseNotes -Copy $release.copy -Language 'zhHant' -Path (Join-Path $documentsRoot 'release-notes.zh-Hant.md')
        Write-Utf8 -Path (Join-Path $documentsRoot 'version-items.json') -Content (($release.copy | ConvertTo-Json -Depth 8) + "`n")

        $migrationManifest = @()
        Get-ChildItem -LiteralPath $databaseMigrations -File | Sort-Object Name | ForEach-Object {
            $originPath = "supabase/migrations/$($_.Name)"
            $blob = (Invoke-Git -Arguments @('rev-parse', "$($release.commit):$originPath") | Select-Object -First 1).Trim()
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

        $changedFiles = if ($release.previousVersion) {
            $previousRelease = $releases | Where-Object version -eq $release.previousVersion | Select-Object -First 1
            @(Invoke-Git -Arguments @('diff', '--name-only', "$($previousRelease.commit)..$($release.commit)") |
                Where-Object { $_ -match '^(README\.md|CHANGELOG\.md|SECURITY\.md|PRIVACY\.md|docs/|supabase/README\.md|zona/README\.md)' })
        } else {
            @($documentManifest | ForEach-Object file | Where-Object { $_ -like 'snapshot/*' } | ForEach-Object { $_.Substring(9) })
        }
        Write-Utf8 -Path (Join-Path $documentsRoot 'changed-files.txt') -Content ((@($changedFiles | Sort-Object -Unique) -join "`n") + "`n")

        $documentChecksums = Get-ChildItem -LiteralPath $documentsRoot -Recurse -File |
            Where-Object Name -ne 'checksums.sha256' |
            Sort-Object FullName |
            ForEach-Object {
                $relative = [System.IO.Path]::GetRelativePath($documentsRoot, $_.FullName).Replace('\', '/')
                "$(Get-Sha256 -Path $_.FullName)  $relative"
            }
        Write-Utf8 -Path (Join-Path $documentsRoot 'checksums.sha256') -Content (($documentChecksums -join "`n") + "`n")

        $appJsonVersion = $null
        $packageJsonVersion = $null
        $appJsonPath = Join-Path $extractRoot 'zona\app.json'
        $packageJsonPath = Join-Path $extractRoot 'zona\package.json'
        if (Test-Path -LiteralPath $appJsonPath) {
            $appJsonVersion = (Get-Content -Raw -LiteralPath $appJsonPath | ConvertFrom-Json).expo.version
        }
        if (Test-Path -LiteralPath $packageJsonPath) {
            $packageJsonVersion = (Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json).version
        }

        $releaseMetadata = [ordered]@{
            version = $release.version
            sourceCommit = $release.commit
            sourceBranch = if ($release.version -eq '0.0.6') { 'v0.0.6' } else { $null }
            gitTag = $null
            boundaryConfidence = $release.boundaryConfidence
            boundaryNote = $release.boundaryNote
            previousVersion = $release.previousVersion
            appJsonVersion = $appJsonVersion
            packageJsonVersion = $packageJsonVersion
            migrationCount = $migrationManifest.Count
            deltaMigrationCount = $release.deltaMigrations.Count
            documentCount = $documentManifest.Count
        }
        Write-Utf8 -Path (Join-Path $versionRoot 'release.json') -Content (($releaseMetadata | ConvertTo-Json -Depth 6) + "`n")
    }

    $releaseIndex = @($releases | ForEach-Object {
        [ordered]@{
            version = $_.version
            sourceCommit = $_.commit
            gitTag = $null
            boundaryConfidence = $_.boundaryConfidence
            previousVersion = $_.previousVersion
            path = "v$($_.version)"
        }
    })
    Write-Utf8 -Path (Join-Path $archiveRoot 'releases.json') -Content (($releaseIndex | ConvertTo-Json -Depth 5) + "`n")

    $readme = @'
# Zona version archives

This directory preserves the database migrations, documentation, and user-facing release items for Zona 0.0.1 through 0.0.6.

Each version is intentionally split into:

- `database/`: every migration available at that release boundary, the migrations introduced by that version, origin/blob metadata, and SHA-256 checksums.
- `documents/`: the documentation snapshot from that release boundary, changed-file list, human-facing release notes, structured version items, and SHA-256 checksums.

The database package is cumulative so a version can be reconstructed without borrowing migrations from another folder. `delta-migrations.txt` identifies only the migrations introduced in that version.

## Historical accuracy

The repository did not create Git tags for these releases. Boundaries for 0.0.1 and 0.0.3 are inferred from commit history, while later boundaries have stronger version/commit evidence. Read each `release.json` before treating a folder as an official shipped artifact.

Migration ownership follows the earliest release boundary containing the migration's addition commit. Application order always follows the complete migration filename. A migration can contain retroactive release-note content without being reassigned to that earlier version.

## Rebuild

Run `scripts/build-version-archives.ps1` only after moving or deleting the existing `versions/` directory. The script refuses to overwrite an archive and always extracts exact Git blobs from the recorded commits.
'@
    Write-Utf8 -Path (Join-Path $archiveRoot 'README.md') -Content ($readme.Trim() + "`n")
}
finally {
    $resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
    $systemTemporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemporaryRoot.StartsWith($systemTemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedTemporaryRoot).StartsWith('zona-version-archives-')) {
        Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
    } else {
        throw "Refusing to remove unexpected temporary path: $resolvedTemporaryRoot"
    }
}

Write-Host "Created version archives in $archiveRoot"
