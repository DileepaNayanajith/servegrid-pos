@echo off
cd /d "%~dp0"
title FASTPOS - Local Server
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    python server.py
  ) else (
    echo Python 3 not found. Install it from python.org and select Add Python to PATH.
    pause
    exit /b 1
  )
)
if errorlevel 1 pause
