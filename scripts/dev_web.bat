@echo off
REM ACECode Web development launcher (Windows)
REM Usage: scripts\dev_web.bat [--embedded] [--build-daemon] [Vite options]

setlocal
set "SCRIPT_DIR=%~dp0"

where python >nul 2>&1
if not errorlevel 1 (
    set "PYTHON=python"
) else (
    where py >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON=py"
    ) else (
        echo [ERROR] python or py was not found. Install Python 3.8+ first.
        exit /b 1
    )
)

"%PYTHON%" "%SCRIPT_DIR%dev_environment.py" web %*
exit /b %errorlevel%
