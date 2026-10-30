export type PersistentCacheEntry<T> = {
  timestamp: number
  value: T
}

export function readPersistentCache<T>(key: string): PersistentCacheEntry<T> | null {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return null

    const parsed: unknown = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object') return null
    const entry = parsed as Partial<PersistentCacheEntry<T>>
    if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp) || !('value' in entry)) return null
    return entry as PersistentCacheEntry<T>
  } catch (error) {
    console.warn(`Não foi possível ler o cache local "${key}".`, error)
    return null
  }
}

export function writePersistentCache<T>(key: string, value: T, timestamp = Date.now()) {
  try {
    localStorage.setItem(key, JSON.stringify({ timestamp, value } satisfies PersistentCacheEntry<T>))
  } catch (error) {
    console.warn(`Não foi possível salvar o cache local "${key}".`, error)
  }
}
