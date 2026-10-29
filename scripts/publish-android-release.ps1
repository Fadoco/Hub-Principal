$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $projectRoot
try {
    if (-not (Test-Path 'apk\release-signing.jks') -or -not (Test-Path 'apk\release-signing.properties')) {
        throw 'A chave local não foi configurada. Execute scripts\setup-android-signing.ps1 primeiro.'
    }

    $branch = (& git branch --show-current).Trim()
    if ($branch -ne 'main') {
        throw 'Publique uma versão a partir da branch main.'
    }
    if ((& git status --porcelain)) {
        throw 'Há alterações locais. Faça commit e push antes de publicar uma versão do app.'
    }

    & git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar a branch main no GitHub.' }
    $localCommit = (& git rev-parse HEAD).Trim()
    $remoteCommit = (& git rev-parse origin/main).Trim()
    if ($localCommit -ne $remoteCommit) {
        throw 'A branch main local não corresponde à versão enviada ao GitHub. Faça push antes de publicar o APK.'
    }

    $gradleFile = Get-Content 'apk\app\build.gradle' -Raw
    $versionMatch = [regex]::Match($gradleFile, 'versionName\s+"(\d+\.\d+\.\d+)"')
    if (-not $versionMatch.Success) {
        throw 'Não foi possível ler a versão X.Y.Z em apk\app\build.gradle.'
    }
    $version = $versionMatch.Groups[1].Value
    $tag = "v$version"
    $existingTag = & git ls-remote --tags origin "refs/tags/$tag"
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar as tags publicadas no GitHub.' }
    if ($existingTag) {
        throw "A versão $tag já foi publicada. Incremente versionCode e versionName antes de criar outra."
    }

    $sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
    if (-not (Test-Path $sdk)) { throw "Android SDK não encontrado em $sdk." }
    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk
    if (-not $env:JAVA_HOME -and (Test-Path 'C:\Android\jdk-21')) { $env:JAVA_HOME = 'C:\Android\jdk-21' }

    & npm run build:android:release
    if ($LASTEXITCODE -ne 0) { throw 'A compilação do APK assinado falhou.' }

    $builtApk = Join-Path $projectRoot 'apk\app\build\outputs\apk\release\app-release.apk'
    $releaseApk = Join-Path $projectRoot 'apk\Hub-Principal.apk'
    if (-not (Test-Path $builtApk)) { throw "O APK de publicação não foi gerado: $builtApk" }

    $buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
        Sort-Object { [version]($_.Name -replace '-.*$', '') } -Descending |
        Select-Object -First 1
    if (-not $buildTools) { throw 'As ferramentas de compilação do Android SDK não foram encontradas.' }
    $apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
    & $apksigner verify --print-certs $builtApk
    if ($LASTEXITCODE -ne 0) { throw 'O APK não possui uma assinatura válida; a publicação foi cancelada.' }

    Copy-Item -LiteralPath $builtApk -Destination $releaseApk -Force
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'Instale o GitHub CLI com winget install --id GitHub.cli e autentique com gh auth login.'
    }
    & gh auth status
    if ($LASTEXITCODE -ne 0) { throw 'Autentique o GitHub CLI localmente com gh auth login antes de publicar.' }

    & gh release create $tag $releaseApk --title "Hub Principal $tag" --generate-notes --target main
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível criar a publicação $tag no GitHub." }

    Write-Output "Versão $tag publicada com o APK assinado."
}
finally {
    Pop-Location
}
