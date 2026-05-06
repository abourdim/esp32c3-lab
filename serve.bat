@echo off
where python >nul 2>nul && (python tools\serve.py %*) || (where py >nul 2>nul && (py tools\serve.py %*) || (echo Python 3 not found. Install from python.org and try again. & pause & exit /b 1))
