import { ref } from 'vue'

export interface CustomHeroPool {
  id: string
  name: string
  heroNames: string[]
  createdAt: string
}

const STORAGE_KEY = 'umt.customHeroPools.v1'

const pools = ref<CustomHeroPool[]>([])
let loaded = false

const loadPools = () => {
  if (loaded || typeof window === 'undefined') {
    return
  }

  loaded = true
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return
  }

  try {
    const parsed = JSON.parse(raw) as CustomHeroPool[]
    pools.value = Array.isArray(parsed)
      ? parsed.filter((pool) => pool.id !== 'pool-officially-released-characters')
      : []
  } catch {
    pools.value = []
  }
}

const savePools = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pools.value))
}

const normalizeHeroNames = (heroNames: string[]) => {
  return [...new Set(heroNames)].sort((a, b) => a.localeCompare(b))
}

export const useHeroPools = () => {
  loadPools()

  const createPool = (name: string, heroNames: string[]) => {
    const trimmedName = name.trim()
    const normalizedHeroNames = normalizeHeroNames(heroNames)

    if (!trimmedName || normalizedHeroNames.length === 0) {
      return null
    }

    const pool: CustomHeroPool = {
      id: `pool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: trimmedName,
      heroNames: normalizedHeroNames,
      createdAt: new Date().toISOString(),
    }

    pools.value = [...pools.value, pool]
    savePools()
    return pool
  }

  const deletePool = (poolId: string) => {
    pools.value = pools.value.filter((pool) => pool.id !== poolId)
    savePools()
  }

  return {
    pools,
    createPool,
    deletePool,
  }
}
