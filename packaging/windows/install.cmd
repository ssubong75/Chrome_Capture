@echo off
chcp 65001 >nul
title Chrome Capture - Windows

echo Chrome Capture - Windows 저장 도우미 설치
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0native-host-windows\install-host.ps1"

if errorlevel 1 (
  echo.
  echo 설치하지 못했습니다. 위 오류 내용을 확인해 주세요.
) else (
  echo.
  echo Chrome에서 chrome-extension 폴더를 로드해 주세요.
)

echo.
pause
