@echo off
rem Double-click: runs tools/installer-sam.sh in Git Bash (Git for Windows), from this folder.
chcp 65001 >nul
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" set "GITBASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git for Windows n'est pas installe. Telecharge-le ici : https://git-scm.com/download/win
  pause
  exit /b 1
)
cd /d "%~dp0"
"%GITBASH%" tools/installer-sam.sh
pause
