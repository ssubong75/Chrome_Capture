@echo off
chcp 65001 >nul
title Chrome Capture - Windows

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0native-host-windows\uninstall-host.ps1"

echo.
pause
