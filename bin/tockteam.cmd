@ECHO off
SETLOCAL
SET "ROOT=%~dp0.."

IF EXIST "%ROOT%\node-runtime\node.exe" IF EXIST "%ROOT%\lib\tockteam\cli.js" (
  SET "TOCKTEAM_WEB_ROOT=%ROOT%"
  SET "TOCKTEAM_TUI_ROOT=%ROOT%"
  "%ROOT%\node-runtime\node.exe" "%ROOT%\lib\tockteam\cli.js" %*
  EXIT /B %ERRORLEVEL%
)

IF NOT EXIST "%ROOT%\dist\tockteam.js" (
  ECHO TockTeam is not built. Run pnpm run build first. 1>&2
  EXIT /B 1
)

SET "TOCKTEAM_SOURCE_ROOT=%ROOT%"
node "%ROOT%\dist\tockteam.js" %*
