@echo off
rem VayuShield AI - double-click installer for Windows.
rem Runs install.ps1 for this one run only; it does not change your PowerShell settings.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
if errorlevel 1 (
  echo.
  echo Something went wrong. Please read the message above.
)
pause
