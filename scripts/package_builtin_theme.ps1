param(
    [Parameter(Mandatory = $true)][string]$Definition,
    [Parameter(Mandatory = $true)][string]$Background,
    [Parameter(Mandatory = $true)][string]$Thumbnail,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$utf8 = [Text.UTF8Encoding]::new($false)
$definitionBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Definition).Path)
$theme = $utf8.GetString($definitionBytes) | ConvertFrom-Json
if ($theme.schema_version -ne 1 -or $theme.id -notin @('eva-01', 'national-day-2026') -or
    $theme.version -notmatch '^\d[0-9a-z.-]{0,39}$' -or $theme.version.Contains('..') -or
    $theme.mode -notin @('light', 'dark')) { throw 'Invalid built-in theme definition' }

function Get-BytesHash([byte[]]$Bytes) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}

$backgroundBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Background).Path)
$thumbnailBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Thumbnail).Path)
foreach ($asset in @(@{ Bytes = $backgroundBytes; Metadata = $theme.background }, @{ Bytes = $thumbnailBytes; Metadata = $theme.thumbnail })) {
    if ($asset.Bytes.Length -ne $asset.Metadata.bytes -or (Get-BytesHash $asset.Bytes) -ne $asset.Metadata.sha256 -or
        $asset.Bytes.Length -lt 8 -or [BitConverter]::ToString($asset.Bytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A') {
        throw 'Approved PNG bytes or checksum do not match the definition'
    }
}
if ($thumbnailBytes.Length -gt 262144 -or $backgroundBytes.Length -gt 16777216) { throw 'Theme images exceed package limits' }
$packageRoot = [IO.Path]::GetFullPath($OutputDirectory)
$versionDirectory = Join-Path $packageRoot ($theme.id + '/' + $theme.version)
[IO.Directory]::CreateDirectory($versionDirectory) | Out-Null
$archivePath = Join-Path $versionDirectory 'theme.zip'
$files = [ordered]@{ 'theme.json' = $definitionBytes; 'background.png' = $backgroundBytes; 'thumbnail.png' = $thumbnailBytes }
$archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($name in $files.Keys) {
        $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = [DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        $stream = $entry.Open()
        try { $stream.Write($files[$name], 0, $files[$name].Length) } finally { $stream.Dispose() }
    }
} finally { $zip.Dispose(); $archiveStream.Dispose() }
$archiveBytes = [IO.File]::ReadAllBytes($archivePath)
if ($archiveBytes.Length -gt 16777216) { throw 'Theme archive exceeds 16 MiB' }
$check = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($check.Entries.Count -ne 3) { throw 'Unexpected archive entries' }
    foreach ($entry in $check.Entries) {
        $stream = $entry.Open()
        $memory = [IO.MemoryStream]::new()
        try {
            $stream.CopyTo($memory)
            if ((Get-BytesHash $memory.ToArray()) -ne (Get-BytesHash $files[$entry.FullName])) { throw 'Archive verification failed' }
        } finally { $stream.Dispose(); $memory.Dispose() }
    }
} finally { $check.Dispose() }
[IO.File]::WriteAllBytes((Join-Path $versionDirectory 'thumbnail.png'), $thumbnailBytes)
$entry = [ordered]@{
    id = $theme.id; name = $theme.name; version = $theme.version
    swatches = @($theme.colors.bg, $theme.colors.surface, $theme.colors.'send-bg')
    package = @{ path = "$($theme.id)/$($theme.version)/theme.zip"; bytes = $archiveBytes.Length; sha256 = (Get-BytesHash $archiveBytes) }
    thumbnail = @{ path = "$($theme.id)/$($theme.version)/thumbnail.png"; bytes = $thumbnailBytes.Length; sha256 = (Get-BytesHash $thumbnailBytes) }
}
$catalog = [ordered]@{ schema_version = 1; themes = @($entry) }
[IO.File]::WriteAllText((Join-Path $packageRoot 'catalog-v2.json'), (($catalog | ConvertTo-Json -Depth 8).Replace("`r`n", "`n") + "`n"), $utf8)
$catalog | ConvertTo-Json -Depth 8
