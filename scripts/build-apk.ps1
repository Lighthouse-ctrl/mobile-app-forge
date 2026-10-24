param(
  [string]$AppDir = (Get-Location).Path,
  [string]$ApkName = '',
  [switch]$SkipSync
)

$ErrorActionPreference = 'Stop'
$AppDir = (Resolve-Path -LiteralPath $AppDir).Path
$AndroidDir = Join-Path $AppDir 'android'

$env:JAVA_HOME = 'D:\Android\tools\jdk17'
$env:ANDROID_HOME = 'D:\Android\sdk'
$env:ANDROID_SDK_ROOT = 'D:\Android\sdk'
$env:GRADLE_USER_HOME = 'D:\Android\gradle-home'

$java = Join-Path $env:JAVA_HOME 'bin\java.exe'
$sdk = Join-Path $env:ANDROID_HOME 'platforms\android-34'
if (-not (Test-Path -LiteralPath $java)) { throw "JDK 17 not found at $env:JAVA_HOME. See references/windows-toolchain.md" }
if (-not (Test-Path -LiteralPath $sdk)) { throw "Android SDK 34 not found at $env:ANDROID_HOME. See references/windows-toolchain.md" }
if (-not (Test-Path -LiteralPath $AndroidDir)) { throw "android/ not found in $AppDir (run npx cap add android first)" }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$gradleFile = Join-Path $AndroidDir 'app\build.gradle'
$bytes = [IO.File]::ReadAllBytes($gradleFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  Write-Output 'removing UTF-8 BOM from app/build.gradle'
  [IO.File]::WriteAllText($gradleFile, [IO.File]::ReadAllText($gradleFile), $utf8NoBom)
}

$wrapper = Join-Path $AndroidDir 'gradle\wrapper\gradle-wrapper.properties'
$wrapperText = [IO.File]::ReadAllText($wrapper)
if ($wrapperText -match 'https\\\\://') {
  Write-Output 'fixing escaped gradle distributionUrl'
  $wrapperText = $wrapperText -replace 'https\\\\://', 'https\://'
  [IO.File]::WriteAllText($wrapper, $wrapperText, $utf8NoBom)
}

if (-not $SkipSync) {
  Push-Location $AppDir
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $AppDir 'node_modules'))) {
      Write-Output 'npm install ...'
      & npm install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
    Write-Output 'cap sync android ...'
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
  } finally {
    Pop-Location
  }
}

Push-Location $AndroidDir
try {
  Write-Output 'gradle assembleRelease ...'
  & .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
} finally {
  Pop-Location
}

$apk = Get-ChildItem -LiteralPath (Join-Path $AndroidDir 'app\build\outputs\apk\release') -Filter '*.apk' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw 'APK not found after build' }

$buildTools = Join-Path $env:ANDROID_HOME 'build-tools\34.0.0'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$aapt2 = Join-Path $buildTools 'aapt2.exe'

Write-Output 'verifying signature ...'
& $apksigner verify --print-certs $apk.FullName | Select-Object -First 2

$badging = & $aapt2 dump badging $apk.FullName 2>&1
$pkg = ($badging | Select-String -Pattern '^package:' | Select-Object -First 1).Line
$label = ($badging | Select-String -Pattern "^application-label:'" | Select-Object -First 1).Line
Write-Output $pkg
if ($label) { Write-Output $label }

$displayName = $ApkName
$slug = 'app-release'
if (-not $displayName) {
  $cfgPath = Join-Path $AppDir 'capacitor.config.json'
  if (Test-Path -LiteralPath $cfgPath) {
    $cfg = Get-Content -LiteralPath $cfgPath -Raw | ConvertFrom-Json
    if ($cfg.appName) { $displayName = [string]$cfg.appName }
    if ($cfg.appId) { $slug = (([string]$cfg.appId) -split '\.')[-1] }
  }
}
if (-not $displayName) { $displayName = 'app' }
$outName = ($displayName -replace '[\\/:*?"<>|]', '_') + '.apk'
$webName = ($slug -replace '[^A-Za-z0-9_-]', '') + '.apk'

$targets = @()
$desktop = [Environment]::GetFolderPath('Desktop')
if ($desktop) { $targets += (Join-Path $desktop $outName) }
$webDir = $AppDir -replace '-android$', ''
if ($webDir -ne $AppDir -and (Test-Path -LiteralPath $webDir)) {
  $targets += (Join-Path $webDir $webName)
}

foreach ($t in $targets) {
  Copy-Item -LiteralPath $apk.FullName -Destination $t -Force
  Write-Output ("copied -> {0} ({1:N2} MB)" -f $t, ((Get-Item -LiteralPath $t).Length / 1MB))
}

$lan = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if ($lan -and $webDir -ne $AppDir -and (Test-Path -LiteralPath $webDir)) {
  Write-Output "phone download: http://${lan}:8765/${webName}"
}

Write-Output ("done: {0} ({1:N2} MB)" -f $apk.FullName, ($apk.Length / 1MB))
