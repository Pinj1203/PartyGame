@echo off
setlocal
chcp 65001 >nul
set "PARTY_NODE=node"
node --version >nul 2>nul
if errorlevel 1 set "PARTY_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%PARTY_NODE%" "%~dp0move-to-D.mjs"
if errorlevel 1 pause
endlocal
