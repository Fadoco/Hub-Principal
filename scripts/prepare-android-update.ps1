$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $projectRoot
try {
    $apkPath = Join-Path $projectRoot 'public\updates\Hub-Principal.apk'
    if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
        throw 'Coloque o APK assinado em public\updates\Hub-Principal.apk antes de continuar.'
    }

    $sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
    if (-not (Test-Path $sdk)) { throw "Android SDK não encontrado em $sdk." }

    $buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
        Sort-Object { [version]($_.Name -replace '-.*$', '') } -Descending |
        Select-Object -First 1
    if (-not $buildTools) { throw 'As ferramentas de compilação do Android SDK não foram encontradas.' }

    $aapt = Join-Path $buildTools.FullName 'aapt.exe'
    $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
    if (-not (Test-Path $aapt) -or -not (Test-Path $apksigner)) {
        throw 'aapt.exe ou apksigner.bat não foi encontrado nas ferramentas do Android SDK.'
    }

    & $apksigner verify $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'O APK não possui uma assinatura válida.' }

    $packageLine = (& $aapt dump badging $apkPath | Select-String "^package:").Line
    if ($LASTEXITCODE -ne 0 -or -not $packageLine -or
        $packageLine -notmatch "name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'") {
        throw 'Não foi possível ler o pacote e a versão deste APK.'
    }

    $applicationId = $Matches[1]
    $apkVersionCode = [int]$Matches[2]
    $apkVersionName = $Matches[3]
    if ($applicationId -ne 'com.fadoco.hubprincipal') {
        throw "O APK pertence a '$applicationId', não ao Hub Principal."
    }
    if ($apkVersionName -notmatch '^\d+\.\d+\.\d+$' -or $apkVersionCode -lt 1) {
        throw 'A versão do APK deve usar o formato X.Y.Z e um versionCode positivo.'
    }

    $gradleFile = Get-Content 'apk\app\build.gradle' -Raw
    if ($gradleFile -notmatch '(?m)^\s*versionCode\s+(\d+)\s*$' -or [int]$Matches[1] -ne $apkVersionCode) {
        throw 'O versionCode do APK não corresponde a apk\app\build.gradle.'
    }
    if ($gradleFile -notmatch '(?m)^\s*versionName\s+"([^"]+)"\s*$' -or $Matches[1] -ne $apkVersionName) {
        throw 'O versionName do APK não corresponde a apk\app\build.gradle.'
    }

    $hash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifestPath = Join-Path $projectRoot 'public\updates\version.json'
    $manifest = [ordered]@{
        version = $apkVersionName
        versionCode = $apkVersionCode
        url = "https://fadoco.github.io/Hub-Principal/updates/Hub-Principal.apk?v=$apkVersionCode"
        sha256 = $hash
        notes = ''
    }
    $json = $manifest | ConvertTo-Json
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, $utf8WithoutBom)

    & npm run build:pages
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar o site para publicar o APK.' }

    Write-Output "Manifesto criado para Hub Principal $apkVersionName (versionCode $apkVersionCode)."
    Write-Output 'Agora revise e envie as alterações de public\updates e docs\ ao GitHub.'
}
finally {
    Pop-Location
}
