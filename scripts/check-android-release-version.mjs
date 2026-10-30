import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseAndroidVersion(buildGradle) {
  const versionCode = buildGradle.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1]
  const versionName = buildGradle.match(/^\s*versionName\s+["']([^"']+)["']\s*$/m)?.[1]
  if (!versionCode || !versionName) {
    throw new Error('Não foi possível ler versionCode e versionName de apk/app/build.gradle.')
  }
  return { versionCode: Number(versionCode), version: versionName }
}

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error('A versão deve seguir o formato X.Y.Z.')
  }
  return value.split('.').map(Number)
}

function isNewerVersion(candidate, current) {
  const next = parseVersion(candidate)
  const previous = parseVersion(current)
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== previous[index]) return next[index] > previous[index]
  }
  return false
}

export function validateAndroidRelease(candidate, published) {
  if (!published || typeof published !== 'object' ||
      typeof published.version !== 'string' ||
      !Number.isSafeInteger(published.versionCode) || published.versionCode < 1) {
    throw new Error('O manifesto Android publicado contém uma versão inválida.')
  }
  if (!Number.isSafeInteger(candidate.versionCode) || candidate.versionCode < 1) {
    throw new Error('O versionCode candidato deve ser um inteiro positivo.')
  }
  parseVersion(candidate.version)
  parseVersion(published.version)

  if (candidate.versionCode <= published.versionCode || !isNewerVersion(candidate.version, published.version)) {
    throw new Error(
      `A versão candidata ${candidate.version} (versionCode ${candidate.versionCode}) deve ser superior à publicada ${published.version} (versionCode ${published.versionCode}).`,
    )
  }
}

function validateRepositoryRelease(root = process.cwd()) {
  const buildGradle = readFileSync(path.join(root, 'apk', 'app', 'build.gradle'), 'utf8')
  const published = JSON.parse(readFileSync(path.join(root, 'docs', 'updates', 'version.json'), 'utf8'))
  const candidate = parseAndroidVersion(buildGradle)
  validateAndroidRelease(candidate, published)
  console.log(`Versão Android ${candidate.version} (versionCode ${candidate.versionCode}) supera a versão publicada ${published.version} (versionCode ${published.versionCode}).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateRepositoryRelease()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha ao validar a versão Android.')
    process.exitCode = 1
  }
}
