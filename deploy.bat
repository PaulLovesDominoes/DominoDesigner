@echo off
rem Entry point for publishing to Firebase Hosting; the work is in deploy.ps1.
rem
rem   deploy.bat                          -> the live site
rem   deploy.bat preview                  -> a temporary URL, expiring after 7 days
rem   deploy.bat preview -Project my-proj -> either, to a different Cloud project
rem
rem A launcher rather than the script itself because batch mangles the percent
rem signs in git's --pretty format strings, and because .bat is what the rest of
rem this repo's entry points are. -ExecutionPolicy Bypass applies to this single
rem run only, so a machine that blocks unsigned scripts still runs this one and
rem its own policy is left alone.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
exit /b %ERRORLEVEL%
