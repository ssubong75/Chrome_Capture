$ErrorActionPreference = "Stop"

$HostName = "com.ssubong.chrome_capture"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$SourcePath = Join-Path $ScriptDir "CleanVideoCaptureHost.cs"
$ExtensionManifestPath = Join-Path $ProjectDir "chrome-extension\manifest.json"
$InstallDir = Join-Path $env:LOCALAPPDATA "ChromeCapture\native-host-windows"
$ExePath = Join-Path $InstallDir "VideoCaptureHost.exe"
$ManifestPath = Join-Path $InstallDir "$HostName.json"

if (-not (Test-Path $SourcePath) -or -not (Test-Path $ExtensionManifestPath)) {
    throw "Required installation files are missing."
}

$ExtensionManifest = Get-Content $ExtensionManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$ExtensionManifest.key)) {
    throw "The extension manifest key is missing."
}

$PublicKey = [Convert]::FromBase64String([string]$ExtensionManifest.key)
$Sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $Hash = $Sha256.ComputeHash($PublicKey)
}
finally {
    $Sha256.Dispose()
}

$ExtensionIdBuilder = New-Object System.Text.StringBuilder
for ($Index = 0; $Index -lt 16; $Index++) {
    [void]$ExtensionIdBuilder.Append([char](97 + (($Hash[$Index] -shr 4) -band 15)))
    [void]$ExtensionIdBuilder.Append([char](97 + ($Hash[$Index] -band 15)))
}
$ExtensionId = $ExtensionIdBuilder.ToString()

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
if (Test-Path $ExePath) {
    Remove-Item $ExePath -Force
}

if (Test-Path (Join-Path $ScriptDir "VideoCaptureHost.exe")) {
    Copy-Item (Join-Path $ScriptDir "VideoCaptureHost.exe") $ExePath -Force
} else {
    Add-Type -TypeDefinition (Get-Content $SourcePath -Raw -Encoding UTF8) `
    -ReferencedAssemblies @("System.dll", "System.Core.dll", "System.Web.Extensions.dll", "System.Windows.Forms.dll") `
    -OutputAssembly $ExePath `
    -OutputType ConsoleApplication
}
if (-not (Test-Path (Join-Path $ScriptDir "vendor\ffmpeg.exe"))) {
    throw "AAC encoder is missing from the package. Download the updated Windows ZIP."
}
Copy-Item (Join-Path $ScriptDir "vendor") $InstallDir -Recurse -Force

$Manifest = @{
    name = $HostName
    description = "Chrome Capture save helper for Windows"
    path = $ExePath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4

$Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestPath, $Manifest, $Utf8WithoutBom)

$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $RegistryPath -Force | Out-Null
Set-Item -Path $RegistryPath -Value $ManifestPath

Write-Host
Write-Host "Chrome Capture save helper installation completed."
Write-Host "Default save folder: Desktop\Capture"
