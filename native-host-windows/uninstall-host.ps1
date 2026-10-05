$ErrorActionPreference = "Stop"

$HostName = "com.ssubong.chrome_capture"
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$InstallDir = Join-Path $env:LOCALAPPDATA "ChromeCapture\native-host-windows"

if (Test-Path $RegistryPath) {
    Remove-Item -Path $RegistryPath -Recurse -Force
}
if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Chrome Capture save helper was removed."
