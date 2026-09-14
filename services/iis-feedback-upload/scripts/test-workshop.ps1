[CmdletBinding()]
param([int]$Port = 18482, [switch]$KeepSite)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$componentRoot = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('acecode-workshop-http-' + [Guid]::NewGuid().ToString('N'))
$siteRoot = Join-Path $testRoot 'site'
$updateRoot = Join-Path $siteRoot 'aupdate'
$feedbackRoot = Join-Path $testRoot 'feedback'
$storageRoot = Join-Path $testRoot 'themes'
$backupRoot = Join-Path $testRoot 'backups'
$fixtures = Join-Path $testRoot 'fixtures'
$baseUrl = "http://localhost:$Port/aupdate/"
$hostProcess = $null
$utf8 = New-Object Text.UTF8Encoding($false)
function Check([bool]$Condition, [string]$Description) {
    if (-not $Condition) { throw "FAIL: $Description" }
    Write-Host "PASS: $Description"
}
function Probe([string]$Route, [string]$Method = 'GET', $Form = $null, $Session = $null, $Body = $null, $Headers = @{}) {
    $arguments = @{ Uri = ($baseUrl + $Route); Method = $Method; SkipHttpErrorCheck = $true; TimeoutSec = 12; Headers = $Headers }
    if ($Form) { $arguments.Form = $Form }
    if ($Session) { $arguments.WebSession = $Session }
    if ($Body) { $arguments.Body = $Body; $arguments.ContentType = 'application/json' }
    Invoke-WebRequest @arguments
}
try {
    New-Item -ItemType Directory -Force -Path $updateRoot | Out-Null
    [IO.File]::WriteAllText((Join-Path $siteRoot 'web.config'), '<configuration><system.web><compilation targetFramework="4.8" /></system.web></configuration>', $utf8)
    [IO.File]::WriteAllText((Join-Path $updateRoot 'web.config'), '<configuration><system.webServer><staticContent><remove fileExtension=".zip"/><mimeMap fileExtension=".zip" mimeType="application/zip" /></staticContent></system.webServer></configuration>', $utf8)
    [IO.File]::WriteAllText((Join-Path $updateRoot 'aceupdate.json'), '{"latest":"test-preserved"}', $utf8)
    $deployment = & (Join-Path $PSScriptRoot 'deploy.ps1') -SiteRoot $siteRoot -UpdateDirectory $updateRoot -FeedbackDirectory $feedbackRoot -WorkshopStorageDirectory $storageRoot -BackupRoot $backupRoot
    & (Join-Path $componentRoot 'out/Acecode.Workshop.Tests.exe') --fixture $fixtures
    if ($LASTEXITCODE -ne 0) { throw 'Fixture generation failed.' }
    Copy-Item -LiteralPath (Join-Path $fixtures 'theme.zip') -Destination (Join-Path $updateRoot 'preserved-update.zip')
    $iis = 'C:/Program Files/IIS Express/iisexpress.exe'
    if (-not (Test-Path -LiteralPath $iis)) { throw 'IIS Express is required for the integration test.' }
    $hostProcess = Start-Process -FilePath $iis -ArgumentList @("/path:`"$siteRoot`"", "/port:$Port", '/clr:v4.0', '/systray:false') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testRoot 'iis.stdout.log') -RedirectStandardError (Join-Path $testRoot 'iis.stderr.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 25; ++$attempt) {
        try { $result = Probe 'workshop/'; if ($result.StatusCode -eq 200) { $ready = $true; break } } catch { }
        Start-Sleep -Milliseconds 200
    }
    Check $ready "IIS Express serves workshop page ($testRoot)"
    Check ((Probe 'workshop').StatusCode -eq 200) 'workshop address without trailing slash works'
    Check ((Probe 'workshop/workshop.js').StatusCode -eq 200) 'workshop script is served'
    Check ((Probe 'workshop/assets/acecode-dark.png').StatusCode -eq 200) 'dark template is served'
    Check ((Probe 'workshop/assets/acecode-light.png').StatusCode -eq 200) 'light template is served'
    Check ((Probe 'aceupdate.json').Content -eq '{"latest":"test-preserved"}') 'updater manifest remains unchanged'
    Check ((Probe 'preserved-update.zip' 'HEAD').StatusCode -eq 200) 'existing ZIP download remains available'
    Check (((Probe 'workshop/api/themes').Content | ConvertFrom-Json).total -eq 0) 'initial public catalogue is empty'
    $headers = @{ 'X-Workshop-Request' = '1' }
    $form = @{ file = Get-Item -LiteralPath (Join-Path $fixtures 'theme.zip') }
    Check ((Probe 'workshop/api/themes' 'POST' $form).StatusCode -eq 403) 'write requires workshop request header'
    Check ((Probe 'workshop/api/preview' 'POST' @{ file = Get-Item -LiteralPath (Join-Path $fixtures 'invalid.zip') } $null $null $headers).StatusCode -eq 422) 'invalid ZIP fails preview'
    $preview = (Probe 'workshop/api/preview' 'POST' $form $null $null $headers).Content | ConvertFrom-Json
    $key = $preview.theme.key
    Check ($preview.theme.mode -eq 'dark') 'preview reads real theme definition'
    Check (((Probe 'workshop/api/themes').Content | ConvertFrom-Json).total -eq 0) 'preview does not publish a theme'
    $upload = Probe 'workshop/api/themes' 'POST' $form $null $null $headers
    Check ($upload.StatusCode -eq 201 -and ($upload.Content | ConvertFrom-Json).status -eq 'pending') 'upload enters pending review'
    Check ((Probe "workshop/api/themes/$key/download").StatusCode -eq 404) 'anonymous pending ZIP access is denied'
    Check ((Probe "workshop/api/themes/$key/thumbnail").StatusCode -eq 404) 'anonymous pending thumbnail access is denied'
    Check ((Probe 'workshop/api/admin/themes').StatusCode -eq 401) 'review list requires admin login'
    Check ((Probe "workshop/api/admin/themes/$key/approve" 'POST' $null $null $null $headers).StatusCode -eq 401) 'anonymous approval is denied'
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Check ((Probe 'workshop/api/admin/session' 'POST' $null $session '{"key":"wrong"}' $headers).StatusCode -eq 401) 'invalid admin key is denied'
    $loginBody = @{ key = [IO.File]::ReadAllText((Join-Path $backupRoot 'workshop-admin-key.txt')) } | ConvertTo-Json -Compress
    Check ((Probe 'workshop/api/admin/session' 'POST' $null $session $loginBody $headers).StatusCode -eq 200) 'admin login succeeds'
    $loginBody = $null
    Check (((Probe 'workshop/api/admin/themes' 'GET' $null $session).Content | ConvertFrom-Json).total -eq 1) 'admin sees pending upload'
    Check ((Probe "workshop/api/themes/$key/thumbnail" 'GET' $null $session).StatusCode -eq 200) 'admin can preview pending image'
    Check ((Probe "workshop/api/admin/themes/$key/approve" 'POST' $null $session $null $headers).StatusCode -eq 200) 'admin can approve'
    Check (((Probe 'workshop/api/themes').Content | ConvertFrom-Json).total -eq 1) 'approved theme appears publicly'
    $download = Join-Path $testRoot 'download.zip'
    Invoke-WebRequest -Uri ($baseUrl + "workshop/api/themes/$key/download") -OutFile $download
    Check ((Get-FileHash -LiteralPath $download).Hash -eq (Get-FileHash -LiteralPath (Join-Path $fixtures 'theme.zip')).Hash) 'downloaded ZIP matches uploaded bytes'
    Check (((Probe 'workshop/api/themes?mode=light').Content | ConvertFrom-Json).total -eq 0) 'mode filter is applied'
    Check (((Probe 'workshop/api/themes?q=no-match').Content | ConvertFrom-Json).total -eq 0) 'name search is applied'
    Check ((Probe "workshop/api/admin/themes/$key/reject" 'POST' $null $session $null $headers).StatusCode -eq 200) 'admin can reject and unpublish'
    Check ((Probe "workshop/api/themes/$key/download").StatusCode -eq 404) 'rejected theme download is private again'
    $feedbackFile = 'acecode-feedback-workshop-probe.zip'
    $feedbackCopy = Join-Path $fixtures $feedbackFile
    Copy-Item -LiteralPath (Join-Path $fixtures 'theme.zip') -Destination $feedbackCopy
    $feedback = Probe '' 'POST' @{ file = Get-Item -LiteralPath $feedbackCopy; filename = $feedbackFile } $null $null @{ 'User-Agent' = 'acecode-feedback' }
    Check ($feedback.StatusCode -eq 201 -and (Test-Path -LiteralPath (Join-Path $feedbackRoot $feedbackFile))) 'legacy feedback multipart upload still works'
    Check ((Probe 'workshop/api/admin/logout' 'POST' $null $session $null $headers).StatusCode -eq 200) 'admin logout succeeds'
    Check ((Probe 'workshop/api/admin/themes' 'GET' $null $session).StatusCode -eq 401) 'logout revokes browser session'
    if (-not $KeepSite) {
        & (Join-Path $PSScriptRoot 'rollback.ps1') -BackupDirectory $deployment.BackupDirectory -Confirm:$false | Out-Null
        Check ((Probe 'aceupdate.json').Content -eq '{"latest":"test-preserved"}') 'rollback preserves updater manifest'
        Check (Test-Path -LiteralPath (Join-Path $feedbackRoot $feedbackFile)) 'rollback preserves received feedback'
        Check (Test-Path -LiteralPath (Join-Path (Join-Path $storageRoot $key) 'theme.zip')) 'rollback preserves submitted themes'
        Check (-not (Test-Path -LiteralPath (Join-Path $backupRoot 'workshop-admin-key.txt'))) 'rollback removes only its generated admin key'
        Check (-not (Test-Path -LiteralPath (Join-Path $updateRoot 'workshop/index.html'))) 'rollback removes newly deployed workshop assets'
        & (Join-Path $PSScriptRoot 'deploy.ps1') -SiteRoot $siteRoot -UpdateDirectory $updateRoot -FeedbackDirectory $feedbackRoot -WorkshopStorageDirectory $storageRoot -BackupRoot $backupRoot | Out-Null
        Check ((Probe 'workshop/api/themes').StatusCode -eq 200) 'redeployment after rollback succeeds'
    }
    Write-Host 'WORKSHOP HTTP RESULT: PASS'
    if ($KeepSite) {
        $runtime = [ordered]@{ root = $testRoot; site = $siteRoot; url = ($baseUrl + 'workshop/'); process_id = $hostProcess.Id; backup = $deployment.BackupDirectory }
        [IO.File]::WriteAllText((Join-Path $componentRoot 'out/test-runtime.json'), ($runtime | ConvertTo-Json), $utf8)
        [pscustomobject]$runtime
    }
} finally {
    if (-not $KeepSite) {
        if ($hostProcess) {
            if (-not $hostProcess.HasExited) { Stop-Process -Id $hostProcess.Id }
            if (-not $hostProcess.WaitForExit(5000)) { throw 'IIS Express did not stop; test site retained.' }
            $hostProcess.WaitForExit()
            $hostProcess.Dispose()
        }
        $resolved = [IO.Path]::GetFullPath($testRoot)
        $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf).StartsWith('acecode-workshop-http-')) {
            if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
        }
    }
}
