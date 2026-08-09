@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8080
  py -m http.server 8080
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "" http://localhost:8080
    python -m http.server 8080
  ) else (
    echo Python bulunamadi. index.html dosyasini cift tiklayarak acabilirsiniz.
    pause
  )
)
