param(
    [Parameter(Mandatory = $true)][string]$Background,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$Version = '1.0.0',
    [string]$Thumbnail
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d[0-9a-z.-]{0,39}$' -or $Version.Contains('..')) { throw 'Invalid theme version' }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$packageRoot = [IO.Path]::GetFullPath($OutputDirectory)
$versionDirectory = Join-Path $packageRoot "eva-01/$Version"
[IO.Directory]::CreateDirectory($versionDirectory) | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$palettePath = Join-Path $PSScriptRoot '../assets/themes/eva-01/palette.json'
$colors = [IO.File]::ReadAllText([IO.Path]::GetFullPath($palettePath)) | ConvertFrom-Json
$backgroundBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Background).Path)
$thumbnailPath = Join-Path $versionDirectory 'thumbnail.png'
$sourceImage = [Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Background).Path)
try {
    if ($sourceImage.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid) { throw 'Background must be PNG' }
    $width = [Math]::Min(320, $sourceImage.Width)
    $height = [int][Math]::Round($sourceImage.Height * $width / $sourceImage.Width)
    if ($Thumbnail) {
        $providedThumbnailPath = (Resolve-Path -LiteralPath $Thumbnail).Path
        $providedThumbnail = [Drawing.Image]::FromFile($providedThumbnailPath)
        try {
            if ($providedThumbnail.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid -or
                $providedThumbnail.Width -ne $width -or $providedThumbnail.Height -ne $height) {
                throw 'Thumbnail must be PNG at the expected preview dimensions'
            }
        } finally { $providedThumbnail.Dispose() }
        [IO.File]::WriteAllBytes($thumbnailPath, [IO.File]::ReadAllBytes($providedThumbnailPath))
    } else {
        $previewImage = [Drawing.Bitmap]::new($width, $height)
        try {
            $graphics = [Drawing.Graphics]::FromImage($previewImage)
            try {
                $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
            } finally { $graphics.Dispose() }
            $previewImage.Save($thumbnailPath, [Drawing.Imaging.ImageFormat]::Png)
        } finally { $previewImage.Dispose() }
    }
} finally { $sourceImage.Dispose() }
$thumbnailBytes = [IO.File]::ReadAllBytes($thumbnailPath)
if ($thumbnailBytes.Length -gt 262144) { throw 'Thumbnail exceeds 256 KiB' }
function Get-BytesHash([byte[]]$Bytes) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
}
$definition = [ordered]@{
    schema_version = 1; id = 'eva-01'; version = $Version; mode = 'light'; colors = $colors
    background = @{ bytes = $backgroundBytes.Length; sha256 = (Get-BytesHash $backgroundBytes) }
    thumbnail = @{ bytes = $thumbnailBytes.Length; sha256 = (Get-BytesHash $thumbnailBytes) }
}
$definitionBytes = $utf8.GetBytes(($definition | ConvertTo-Json -Depth 8))
$archivePath = Join-Path $versionDirectory 'theme.zip'
$archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    $files = [ordered]@{ 'theme.json' = $definitionBytes; 'background.png' = $backgroundBytes; 'thumbnail.png' = $thumbnailBytes }
    foreach ($name in $files.Keys) {
        $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = [DateTimeOffset]::new(2026, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
        $stream = $entry.Open()
        try { $stream.Write($files[$name], 0, $files[$name].Length) } finally { $stream.Dispose() }
    }
} finally { $zip.Dispose(); $archiveStream.Dispose() }
$archiveBytes = [IO.File]::ReadAllBytes($archivePath)
$catalog = [ordered]@{
    schema_version = 1
    themes = @(@{
        id = 'eva-01'; name = 'EVA 初号机'; version = $Version
        swatches = @($colors.bg, $colors.surface, $colors.'send-bg')
        package = @{ path = "eva-01/$Version/theme.zip"; bytes = $archiveBytes.Length; sha256 = (Get-BytesHash $archiveBytes) }
        thumbnail = @{ path = "eva-01/$Version/thumbnail.png"; bytes = $thumbnailBytes.Length; sha256 = (Get-BytesHash $thumbnailBytes) }
    })
}
[IO.File]::WriteAllText((Join-Path $packageRoot 'catalog.json'), ($catalog | ConvertTo-Json -Depth 8), $utf8)
$check = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    if ($check.Entries.Count -ne 3) { throw 'Unexpected archive contents' }
    foreach ($entry in $check.Entries) {
        $stream = $entry.Open()
        $memory = [IO.MemoryStream]::new()
        try { $stream.CopyTo($memory); if ((Get-BytesHash $memory.ToArray()) -ne (Get-BytesHash $files[$entry.FullName])) { throw 'Archive verification failed' } }
        finally { $stream.Dispose(); $memory.Dispose() }
    }
} finally { $check.Dispose() }
$catalog | ConvertTo-Json -Depth 8
