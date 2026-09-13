<#
Publishes the built frontend to Firebase Hosting.

Run it through deploy.bat rather than directly:

    deploy.bat                          -> the live site
    deploy.bat preview                  -> a temporary URL, expiring after 7 days
    deploy.bat preview -Project my-proj -> either of the above, to a different
                                           Google Cloud project

Needs the Firebase CLI (npm install -g firebase-tools) and a one-time
`firebase login`. Which project is published to comes from .firebaserc unless
-Project overrides it, so a fork can deploy to its own without editing a tracked
file. What gets uploaded, and with which cache headers, is firebase.json's
business; this script only decides what to build and when to refuse.
#>
param(
  [ValidateSet("live", "preview")]
  [string]$Mode = "live",
  [string]$Project = ""
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# A live deploy must correspond to a commit, so there is always a way back to
# exactly what is published, and so the release list lines up with git history.
# A preview deploy deliberately skips this: looking at work in progress on a
# real URL is the whole point of one.
$releaseMessage = ""
if ($Mode -eq "live") {
  if (git status --porcelain) {
    Write-Host ""
    Write-Host "Refusing to deploy: the working tree has uncommitted changes."
    Write-Host "Commit them first, or run 'deploy.bat preview' to publish a temporary copy."
    Write-Host ""
    git status --short
    exit 1
  }
  $releaseMessage = git log -1 --pretty=format:"%h %s"
}

# Held as an array and spread into the command below with @, so that leaving
# -Project off passes no flag at all rather than an empty one.
$projectArgs = @()
if ($Project -ne "") { $projectArgs = @("--project", $Project) }

# Pin the Structure Designer off whatever .env files are lying around. Vite
# ranks a variable already present in the environment above every .env file,
# including a personal .env.local that is not committed - so an unfinished
# screen cannot reach the published site by accident.
#
# The old value is restored afterwards because a .ps1 runs inside the caller's
# own PowerShell session, unlike a .bat with setlocal: without this the pin
# would linger in the window the user carries on working in.
$previousFlag = $env:VITE_ENABLE_STRUCTURE_DESIGNER
$env:VITE_ENABLE_STRUCTURE_DESIGNER = "false"
try {
  npm --prefix frontend run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Build failed - nothing was published."
    exit 1
  }
}
finally {
  $env:VITE_ENABLE_STRUCTURE_DESIGNER = $previousFlag
}

if ($Mode -eq "preview") {
  firebase hosting:channel:deploy preview --expires 7d @projectArgs
}
else {
  firebase deploy --only hosting --message $releaseMessage @projectArgs
}
if ($LASTEXITCODE -ne 0) { exit 1 }
