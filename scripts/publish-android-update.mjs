import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const expectedPackage = 'com.fadoco.hubprincipal'
const maxApkBytes = 100 * 1024 * 1024
const [, , candidatePath, referenceApkPath, referenceManifestPath, outputDirectory] = process.argv

if (!candidatePath || !referenceApkPath || !referenceManifestPath || !outputDirectory) {
  throw new Error('Uso: node scripts/publish-android-update.mjs <APK candidato> <APK publicado> <manifesto publicado> <pasta de saída>')
}

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdkRoot) throw new Error('ANDROID_HOME ou ANDROID_SDK_ROOT não está configurado.')

const buildToolsDirectory = path.join(sdkRoot, 'build-tools', '36.0.0')
const aaptPath = path.join(buildToolsDirectory, process.platform === 'win32' ? 'aapt.exe' : 'aapt')
const apksignerPath = path.join(buildToolsDirectory, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner')

if (!aaptPath || !apksignerPath) {
  throw new Error('aapt e apksigner não foram encontrados no Android SDK.')
}

const runTool = (toolPath, args, description) => {
  const isWindowsBatchFile = process.platform === 'win32' && toolPath.endsWith('.bat')
  const command = isWindowsBatchFile && process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
    : isWindowsBatchFile ? 'java' : toolPath
  const commandArgs = isWindowsBatchFile
    ? ['-jar', path.join(path.dirname(toolPath), 'lib', 'apksigner.jar'), ...args]
    : args
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (result.error) throw new Error(`Não foi possível executar ${description}: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`${description} falhou${detail ? `: ${detail}` : '.'}`)
  }
  return result.stdout
}

const inspectApk = (apkPath, description) => {
  if (!existsSync(apkPath)) throw new Error(`${description} não encontrado: ${apkPath}`)
  const { size } = statSync(apkPath)
  if (size <= 0 || size > maxApkBytes) throw new Error(`${description} vazio ou maior que 100 MB.`)

  const badging = runTool(aaptPath, ['dump', 'badging', apkPath], `Leitura do ${description}`)
  const packageInfo = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m)
  if (!packageInfo) throw new Error(`Não foi possível ler pacote e versão do ${description}.`)

  const packageName = packageInfo[1]
  const versionCode = Number(packageInfo[2])
  const version = packageInfo[3]
  if (packageName !== expectedPackage) throw new Error(`${description} pertence ao pacote '${packageName}', não ao Hub Principal.`)
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2147483647) {
    throw new Error(`${description} tem um versionCode inválido.`)
  }
  if (!/^\d+\.\d+\.\d+$/.test(version) ||
      !version.split('.').every((part) => Number.isSafeInteger(Number(part)))) {
    throw new Error(`${description} deve usar uma versão no formato X.Y.Z com componentes válidos.`)
  }

  const signature = runTool(apksignerPath, ['verify', '--verbose', '--print-certs', apkPath], `Verificação da assinatura do ${description}`)
  const digests = [...signature.matchAll(/certificate\s+SHA-256\s+digest:\s*([a-f0-9]{64})/gi)]
    .map((match) => match[1].toLowerCase())
  if (digests.length !== 1) {
    const signerDetails = signature.split(/\r?\n/).filter((line) => /signer|sha.?256/i.test(line)).join(' | ')
    throw new Error(`${description} não possui exatamente um certificado de assinatura verificável.${signerDetails ? ` Relatório: ${signerDetails}` : ''}`)
  }

  return {
    version,
    versionCode,
    certificateSha256: digests[0],
    fileSha256: createHash('sha256').update(readFileSync(apkPath)).digest('hex'),
  }
}

const parseVersion = (version) => version.split('.').map(Number)
const isNewerVersion = (candidate, current) => {
  const next = parseVersion(candidate)
  const previous = parseVersion(current)
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== previous[index]) return next[index] > previous[index]
  }
  return false
}

const reference = inspectApk(referenceApkPath, 'APK atualmente publicado')
let publishedManifest
try {
  publishedManifest = JSON.parse(readFileSync(referenceManifestPath, 'utf8'))
} catch (error) {
  throw new Error(`Não foi possível ler o manifesto atualmente publicado: ${error.message}`)
}

if (!publishedManifest || typeof publishedManifest !== 'object' ||
    typeof publishedManifest.sha256 !== 'string' ||
    publishedManifest.version !== reference.version ||
    publishedManifest.versionCode !== reference.versionCode ||
    publishedManifest.url !== `https://fadoco.github.io/Hub-Principal/updates/Hub-Principal.apk?v=${reference.versionCode}` ||
    publishedManifest.sha256.toLowerCase() !== reference.fileSha256) {
  throw new Error('O APK de referência não corresponde à versão e ao SHA-256 do manifesto publicado.')
}

const candidate = inspectApk(candidatePath, 'APK candidato')
if (candidate.certificateSha256 !== reference.certificateSha256) {
  throw new Error('A assinatura do APK candidato não corresponde à chave permanente do APK publicado. A publicação foi interrompida.')
}
if (candidate.versionCode <= reference.versionCode || !isNewerVersion(candidate.version, reference.version)) {
  throw new Error(`A versão candidata deve ter versionCode e versão superiores a ${reference.version} (versionCode ${reference.versionCode}).`)
}

mkdirSync(outputDirectory, { recursive: true })
copyFileSync(candidatePath, path.join(outputDirectory, 'Hub-Principal.apk'))
writeFileSync(
  path.join(outputDirectory, 'version.json'),
  `${JSON.stringify({
    version: candidate.version,
    versionCode: candidate.versionCode,
    url: `https://fadoco.github.io/Hub-Principal/updates/Hub-Principal.apk?v=${candidate.versionCode}`,
    sha256: candidate.fileSha256,
    notes: '',
  }, null, 2)}\n`,
  'utf8',
)

console.log(`APK ${candidate.version} (versionCode ${candidate.versionCode}) validado e preparado para publicação.`)
