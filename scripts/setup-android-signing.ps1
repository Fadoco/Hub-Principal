$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidDirectory = Join-Path $projectRoot 'apk'
$keystorePath = Join-Path $androidDirectory 'release-signing.jks'
$propertiesPath = Join-Path $androidDirectory 'release-signing.properties'

if (Test-Path $keystorePath) {
    throw "A chave de publicação já existe em $keystorePath. Não a substitua."
}
if (Test-Path $propertiesPath) {
    throw "A configuração de assinatura já existe em $propertiesPath. Verifique os arquivos antes de continuar."
}

$keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\keytool.exe' } else { 'C:\Android\jdk-21\bin\keytool.exe' }
if (-not (Test-Path $keytool)) {
    $resolvedKeytool = Get-Command keytool.exe -ErrorAction SilentlyContinue
    if (-not $resolvedKeytool) {
        throw 'keytool.exe não foi encontrado. Instale o Java 21 ou defina JAVA_HOME.'
    }
    $keytool = $resolvedKeytool.Source
}

$randomBytes = New-Object byte[] 32
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$password = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
[Array]::Clear($randomBytes, 0, $randomBytes.Length)
$randomGenerator.Dispose()

$keytoolArguments = @(
    '-genkeypair',
    '-keystore', $keystorePath,
    '-storetype', 'JKS',
    '-alias', 'hubprincipal',
    '-keyalg', 'RSA',
    '-keysize', '3072',
    '-validity', '10000',
    '-dname', 'CN=Hub Principal, O=Fadoco, C=BR',
    '-storepass', $password,
    '-keypass', $password
)

& $keytool @keytoolArguments
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $keystorePath -ErrorAction SilentlyContinue
    throw 'Não foi possível gerar a chave de publicação.'
}

$properties = @(
    'storeFile=release-signing.jks',
    "storePassword=$password",
    'keyAlias=hubprincipal',
    "keyPassword=$password"
)
[System.IO.File]::WriteAllLines($propertiesPath, $properties, [System.Text.Encoding]::ASCII)
$password = $null

Write-Output 'Chave de publicação criada. Os arquivos ficam somente neste computador e são ignorados pelo Git.'
Write-Output 'Faça cópias seguras dos dois arquivos de assinatura em armazenamento criptografado. Sem eles, o Android não aceitará futuras atualizações.'
