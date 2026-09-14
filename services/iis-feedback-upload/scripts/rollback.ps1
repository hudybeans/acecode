[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar)
}

function Copy-FileAtomic {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    $temporary = $Destination + '.rollback-' + [Guid]::NewGuid().ToString('N') + '.tmp'
    $replaceBackup = $Destination + '.replace-backup-' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [System.IO.File]::Copy($Source, $temporary, $true)
        if (Test-Path -LiteralPath $Destination) {
            [System.IO.File]::Replace($temporary, $Destination, $replaceBackup)
        } else {
            [System.IO.File]::Move($temporary, $Destination)
        }
    } finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
        if (Test-Path -LiteralPath $replaceBackup) {
            Remove-Item -LiteralPath $replaceBackup -Force
        }
    }
}

$BackupDirectory = Get-NormalizedPath $BackupDirectory
$manifestPath = Join-Path $BackupDirectory 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Rollback manifest does not exist: $manifestPath"
}
$manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
if ($manifest.schema_version -notin @(1, 2)) {
    throw "Unsupported rollback manifest version: $($manifest.schema_version)"
}

$siteRoot = Get-NormalizedPath ([string]$manifest.site_root)
$updateDirectory = Get-NormalizedPath ([string]$manifest.update_directory)
$rootWebConfig = Get-NormalizedPath ([string]$manifest.root_web_config)
$updateWebConfig = Get-NormalizedPath ([string]$manifest.update_web_config)
$handlerAssembly = Get-NormalizedPath ([string]$manifest.handler_assembly)

if (-not $rootWebConfig.Equals(
        (Get-NormalizedPath (Join-Path $siteRoot 'web.config')),
        [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Rollback manifest root web.config target is inconsistent with site_root.'
}
if (-not $updateWebConfig.Equals(
        (Get-NormalizedPath (Join-Path $updateDirectory 'web.config')),
        [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Rollback manifest update web.config target is inconsistent with update_directory.'
}
if (-not $handlerAssembly.Equals(
        (Get-NormalizedPath (Join-Path $siteRoot 'bin\Acecode.FeedbackUpload.dll')),
        [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Rollback manifest handler target is inconsistent with site_root.'
}

$rootBackup = Join-Path $BackupDirectory 'root.web.config'
$updateBackup = Join-Path $BackupDirectory 'aupdate.web.config'
if (-not (Test-Path -LiteralPath $rootBackup -PathType Leaf) -or
    -not (Test-Path -LiteralPath $updateBackup -PathType Leaf)) {
    throw 'Rollback configuration backups are incomplete.'
}
$workshopDirectory = Join-Path $updateDirectory 'workshop'
$workshopAssets = @()
$createdAdminKey = $null
if ($manifest.schema_version -eq 2) {
    $allowedAssets = @('index.html', 'workshop.css', 'workshop.js', 'assets/acecode-logo.png', 'assets/acecode-light.png', 'assets/acecode-dark.png')
    $workshopAssets = @($manifest.workshop_files)
    if ($manifest.admin_key_created) {
        $expectedKeyPath = Get-NormalizedPath (Join-Path (Split-Path -Parent $BackupDirectory) 'workshop-admin-key.txt')
        if (-not (Get-NormalizedPath $manifest.admin_key_file).Equals($expectedKeyPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected admin key rollback path.' }
        if ((Test-Path -LiteralPath $expectedKeyPath -PathType Leaf) -and
            (Get-FileHash -LiteralPath $expectedKeyPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $manifest.admin_key_sha256) { $createdAdminKey = $expectedKeyPath }
    }
    foreach ($asset in $workshopAssets) {
        if ($asset.relative_path -notin $allowedAssets) { throw 'Rollback manifest contains an unexpected workshop asset.' }
        if ($asset.existed -and -not (Test-Path -LiteralPath (Join-Path (Join-Path $BackupDirectory 'workshop') $asset.relative_path) -PathType Leaf)) {
            throw 'Rollback workshop asset backup is incomplete.'
        }
    }
}

if (-not $PSCmdlet.ShouldProcess(
        $siteRoot,
        "Restore IIS feedback-handler state from $BackupDirectory")) {
    return
}

Copy-FileAtomic -Source $rootBackup -Destination $rootWebConfig
Copy-FileAtomic -Source $updateBackup -Destination $updateWebConfig

if ([bool]$manifest.handler_assembly_existed) {
    $assemblyBackup = Join-Path $BackupDirectory 'Acecode.FeedbackUpload.dll'
    if (-not (Test-Path -LiteralPath $assemblyBackup -PathType Leaf)) {
        throw 'Rollback manifest expects a prior handler assembly, but its backup is missing.'
    }
    Copy-FileAtomic -Source $assemblyBackup -Destination $handlerAssembly
} elseif (Test-Path -LiteralPath $handlerAssembly -PathType Leaf) {
    Remove-Item -LiteralPath $handlerAssembly -Force
}
foreach ($asset in $workshopAssets) {
    $assetTarget = Join-Path $workshopDirectory $asset.relative_path
    if ($asset.existed) {
        Copy-FileAtomic -Source (Join-Path (Join-Path $BackupDirectory 'workshop') $asset.relative_path) -Destination $assetTarget
    } elseif (Test-Path -LiteralPath $assetTarget -PathType Leaf) {
        Remove-Item -LiteralPath $assetTarget -Force
    }
}

if ($createdAdminKey) { Remove-Item -LiteralPath $createdAdminKey -Force }

[pscustomobject]@{
    AdminKeyRemoved = [bool]$createdAdminKey
    RestoredFrom = $BackupDirectory
    SiteRoot = $siteRoot
    FeedbackDirectoryUntouched = [string]$manifest.feedback_directory
}
