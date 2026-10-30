import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAndroidVersion, validateAndroidRelease } from './check-android-release-version.mjs'

test('parses Android Gradle version values', () => {
  assert.deepEqual(parseAndroidVersion('versionCode 12\nversionName "1.2.9"'), {
    versionCode: 12,
    version: '1.2.9',
  })
})

test('accepts a release newer than the published version', () => {
  assert.doesNotThrow(() => validateAndroidRelease(
    { versionCode: 13, version: '1.3.0' },
    { versionCode: 12, version: '1.2.9' },
  ))
})

test('rejects a release with a repeated version', () => {
  assert.throws(
    () => validateAndroidRelease({ versionCode: 12, version: '1.2.9' }, { versionCode: 12, version: '1.2.9' }),
    /deve ser superior/,
  )
})

test('rejects an inconsistent version code', () => {
  assert.throws(
    () => validateAndroidRelease({ versionCode: 13, version: '1.2.8' }, { versionCode: 12, version: '1.2.9' }),
    /deve ser superior/,
  )
})
