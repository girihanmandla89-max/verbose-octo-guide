# NextHyke Runtime Bootstrapper
# Purpose: Downloads official Windows 64-bit embedded CPython 3.10.13,
#          enables site-packages, and installs standalone pip.

[CmdletBinding()]
param(
    [string]$PythonVersion = "3.10.11",
    [string]$TargetDir = "$PSScriptRoot\..\runtime"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  NextHyke Embedded Python Bootstrapper: v$PythonVersion  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
$zipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$zipPath = Join-Path $TargetDir "python-embed.zip"
$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$getPipPath = Join-Path $TargetDir "get-pip.py"

if (-not (Test-Path $TargetDir)) {
    Write-Host "[1/4] Creating runtime directory: $TargetDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
} else {
    Write-Host "[1/4] Runtime directory exists: $TargetDir" -ForegroundColor Yellow
}

$pythonExe = Join-Path $TargetDir "python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Host "[2/4] Downloading official CPython $PythonVersion embeddable zip..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

    Write-Host "[2/4] Extracting archive..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $TargetDir -Force
    Remove-Item -Path $zipPath -Force
} else {
    Write-Host "[2/4] Python executable already present. Skipping download." -ForegroundColor Green
}

# Enable site-packages in ._pth file
Write-Host "[3/4] Configuring ._pth file to enable site-packages..." -ForegroundColor Yellow
$pthFiles = Get-ChildItem -Path $TargetDir -Filter "python*._pth"
if ($pthFiles.Count -eq 0) {
    throw "Could not locate python*._pth file in $TargetDir"
}
$pthFile = $pthFiles[0].FullName
$pthContent = Get-Content $pthFile
if ($pthContent -match '#import site') {
    $newContent = $pthContent -replace '#import site', 'import site'
    Set-Content -Path $pthFile -Value $newContent -Encoding Ascii
    Write-Host "       Uncommented 'import site' in $pthFile" -ForegroundColor Green
} elseif ($pthContent -notcontains 'import site') {
    Add-Content -Path $pthFile -Value "import site" -Encoding Ascii
    Write-Host "       Added 'import site' to $pthFile" -ForegroundColor Green
} else {
    Write-Host "       'import site' is already active in $pthFile" -ForegroundColor Green
}

# Install / verify pip
$pipExe = Join-Path $TargetDir "Scripts\pip.exe"
if (-not (Test-Path $pipExe)) {
    Write-Host "[4/4] Bootstrapping standalone pip..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
    & $pythonExe $getPipPath --no-warn-script-location
    Remove-Item -Path $getPipPath -Force
} else {
    Write-Host "[4/4] Pip executable already present: $pipExe" -ForegroundColor Green
}

# Final verification
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Bootstrap Complete. Testing isolated runtime...        " -ForegroundColor Green
& $pythonExe --version
& $pipExe --version
Write-Host "==========================================================" -ForegroundColor Green
