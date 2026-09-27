@echo off
REM Quick launcher for Manga Translator
call .venv\Scripts\activate.bat
start "" http://localhost:8501
streamlit run app.py