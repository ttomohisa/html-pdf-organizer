@echo off
setlocal
cd /d "%~dp0"
echo.
echo PDF Organizer - offline single HTML builder
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-offline.ps1" %*
if errorlevel 1 (
  echo.
  echo Build failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Open dist\index.html to test the fully offline build.
pause
