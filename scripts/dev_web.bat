@echo off
REM ACECode Web UI daemon launcher (no Desktop GUI)
REM Usage: scripts\dev_web.bat [options]
REM Details: python scripts\dev_web.py --help

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

"%PYTHON%" "%SCRIPT_DIR%dev_web.py" %*
exit /b %errorlevel%
