@echo off
cd /d "%~dp0server"
python -m uvicorn main:app --reload

