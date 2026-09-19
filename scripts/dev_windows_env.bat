@echo off
REM Initialize the native Visual Studio C++ environment when MSVC is required.

setlocal EnableDelayedExpansion
set "ACECODE_VSARCH=amd64"
set "ACECODE_VSCOMPONENT=Microsoft.VisualStudio.Component.VC.Tools.x86.x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ACECODE_VSARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ACECODE_VSARCH=arm64"
if "!ACECODE_VSARCH!"=="arm64" set "ACECODE_VSCOMPONENT=Microsoft.VisualStudio.Component.VC.Tools.ARM64"
set "ACECODE_VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "!ACECODE_VSWHERE!" goto :missing_installer

set "ACECODE_VSINSTALL="
for /f "usebackq delims=" %%I in (`"!ACECODE_VSWHERE!" -latest -products * -requires !ACECODE_VSCOMPONENT! -property installationPath`) do set "ACECODE_VSINSTALL=%%I"
if not defined ACECODE_VSINSTALL goto :missing_tools

set "ACECODE_VSDEVCMD=!ACECODE_VSINSTALL!\Common7\Tools\VsDevCmd.bat"
if not exist "!ACECODE_VSDEVCMD!" goto :missing_command

for %%I in ("!ACECODE_VSDEVCMD!") do for %%A in (!ACECODE_VSARCH!) do endlocal & set "ACECODE_VSDEVCMD=%%~fI" & set "ACECODE_VSARCH=%%A"
call "%ACECODE_VSDEVCMD%" -arch=%ACECODE_VSARCH% -host_arch=%ACECODE_VSARCH% >nul
if errorlevel 1 goto :initialization_failed
if /i "%~1"=="--print-env" set
exit /b 0

:missing_installer
endlocal
echo [ERROR] Visual Studio Installer was not found. Install Visual Studio Build Tools with the Desktop development with C++ workload.
exit /b 1

:missing_tools
endlocal
echo [ERROR] Visual Studio C++ tools were not found. Install the Desktop development with C++ workload.
exit /b 1

:missing_command
endlocal
echo [ERROR] Visual Studio developer command script was not found.
exit /b 1

:initialization_failed
echo [ERROR] Failed to initialize the Visual Studio C++ developer environment.
exit /b 1
