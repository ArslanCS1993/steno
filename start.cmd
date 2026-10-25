@echo off
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

rem ---- pick a static server: python -> py -> node ----
set "SRV="
where python >nul 2>nul && set "SRV=python -m http.server %PORT%"
if not defined SRV where py >nul 2>nul && set "SRV=py -m http.server %PORT%"
if not defined SRV where node >nul 2>nul && set "SRV=npx --yes http-server -p %PORT% -c-1"

if not defined SRV (
  echo.
  echo No Python or Node found on PATH.
  echo Install Python, or just use the GitHub Pages URL instead.
  echo.
  pause
  exit /b 1
)

echo.
echo   Steno Chording Academy
echo   folder : %cd%
echo   URL    : http://localhost:%PORT%/steno_tutor.html
echo.
echo   Closing this window stops the server.
echo.

start "" "http://localhost:%PORT%/steno_tutor.html"
%SRV%

echo.
echo Server stopped.
pause
