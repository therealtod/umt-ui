<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import HeroSearchSelect from '@/components/HeroSearchSelect.vue'
import { useHeroPools } from '@/composables/useHeroPools'
import type { HeroStatsDictionary } from '@/services/HeroStatsDataSource'
import { heroStatsDataSource, heroStatsFilter } from '@/services/currentHeroStatsDataSource'
import { matchupThresholds } from '@/services/matchupThresholds'
import { buildMatchupWinRateMatrix, type MatchupWinRateMatrix } from '@/services/heroStatsUtils'

type HeroEntry = {
  id: number
  name: string
}

type HeroPoolRow = {
  name: string
  winRate: number
  pickRate: number
  gamesPlayed: number
}

type PoolSortKey = 'name' | 'winRate' | 'pickRate' | 'gamesPlayed'
type SortDirection = 'asc' | 'desc'

const loading = ref(true)
const allHeroes = ref<HeroEntry[]>([])
const analyticsSource = ref<'all' | 'official' | 'custom'>('official')
const selectedAnalyticsPoolId = ref('')
const newPoolName = ref('')
const newPoolHeroNames = ref<string[]>([])
const poolCreateError = ref('')

const heroStatsDictionary = ref<HeroStatsDictionary>({})
const matchupMatrix = ref<MatchupWinRateMatrix>({})

const { pools, createPool, deletePool } = useHeroPools()

const selectedAnalyticsPool = computed(() =>
  pools.value.find((pool) => pool.id === selectedAnalyticsPoolId.value) ?? null,
)

const displayedHeroes = computed(() => {
  if (analyticsSource.value === 'all') {
    return allHeroes.value
  }

  if (analyticsSource.value === 'official') {
    return allHeroes.value.filter((hero) => !hero.name.toLowerCase().includes('alt'))
  }

  if (!selectedAnalyticsPool.value) {
    return []
  }

  const allowedNames = new Set(selectedAnalyticsPool.value.heroNames)
  return allHeroes.value.filter((hero) => allowedNames.has(hero.name))
})

const displayedHeroNames = computed(() => displayedHeroes.value.map((hero) => hero.name))

const newPoolAvailableHeroes = computed(() => {
  const selectedSet = new Set(newPoolHeroNames.value)
  return allHeroes.value.filter((hero) => !selectedSet.has(hero.name))
})

onMounted(async () => {
  const [heroes, dictionary] = await Promise.all([
    heroStatsDataSource.getHeroes(heroStatsFilter),
    heroStatsDataSource.getAsDictionary(heroStatsFilter),
  ])

  allHeroes.value = heroes.map((name, index) => ({ id: index + 1, name }))
  heroStatsDictionary.value = dictionary
  loading.value = false
})

watch(
  pools,
  (nextPools) => {
    if (analyticsSource.value === 'custom' && !nextPools.some((pool) => pool.id === selectedAnalyticsPoolId.value)) {
      selectedAnalyticsPoolId.value = nextPools[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  [displayedHeroNames, loading],
  async ([heroNames, isLoading]) => {
    if (isLoading) {
      return
    }

    if (heroNames.length === 0) {
      matchupMatrix.value = {}
      return
    }

    matchupMatrix.value = await buildMatchupWinRateMatrix(heroStatsDataSource, heroNames, heroStatsFilter)
  },
  { immediate: true },
)

const heroRows = computed<HeroPoolRow[]>(() => {
  return displayedHeroes.value.map((hero) => {
    const stats = heroStatsDictionary.value[hero.name]
    return {
      name: hero.name,
      winRate: stats?.winRate ?? 0,
      pickRate: stats?.pickRate ?? 0,
      gamesPlayed: stats?.gamesPlayed ?? 0,
    }
  })
})

const poolSortKey = ref<PoolSortKey>('name')
const poolSortDirection = ref<SortDirection>('asc')

const togglePoolSort = (key: PoolSortKey) => {
  if (poolSortKey.value === key) {
    poolSortDirection.value = poolSortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }

  poolSortKey.value = key
  poolSortDirection.value = key === 'name' ? 'asc' : 'desc'
}

const sortedHeroRows = computed(() => {
  const rows = [...heroRows.value]
  const direction = poolSortDirection.value === 'asc' ? 1 : -1
  const key = poolSortKey.value

  rows.sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name) * direction
    }

    return (a[key] - b[key]) * direction
  })

  return rows
})

const getSortIndicator = (key: PoolSortKey) => {
  if (poolSortKey.value !== key) {
    return ''
  }
  return poolSortDirection.value === 'asc' ? '▲' : '▼'
}

const totalHeroes = computed(() => heroRows.value.length)

const totalGamesPlayed = computed(() => heroRows.value.reduce((sum, hero) => sum + hero.gamesPlayed, 0))

const rankingRows = computed(() => {
  return displayedHeroNames.value.map((heroName) => {
    let losingMatchups = 0
    let winningMatchups = 0
    const gamesPlayed = heroStatsDictionary.value[heroName]?.gamesPlayed ?? 0

    for (const opponent of displayedHeroNames.value) {
      if (heroName === opponent) {
        continue
      }

      const winRate = matchupMatrix.value[heroName]?.[opponent]
      if (winRate == null) {
        continue
      }

      if (winRate < matchupThresholds.losingWinRateUpperBound) {
        losingMatchups += 1
      }

      if (winRate > matchupThresholds.winningWinRateLowerBound) {
        winningMatchups += 1
      }
    }

    return { heroName, losingMatchups, winningMatchups, gamesPlayed }
  })
})

const leastLosingMatchups = computed(() => {
  return [...rankingRows.value].sort(
    (a, b) => a.losingMatchups - b.losingMatchups || b.winningMatchups - a.winningMatchups,
  )
})

const mostWinningMatchups = computed(() => {
  return [...rankingRows.value].sort(
    (a, b) => b.winningMatchups - a.winningMatchups || a.losingMatchups - b.losingMatchups,
  )
})

const formatWinRate = (value: number | null | undefined) => (value == null ? '--' : `${value.toFixed(1)}%`)

const getMatchupCellClass = (value: number | null | undefined) => {
  if (value == null) {
    return 'matchup-cell-empty'
  }

  if (value < matchupThresholds.losingWinRateUpperBound) {
    return 'matchup-cell-bad'
  }

  if (value > matchupThresholds.winningWinRateLowerBound) {
    return 'matchup-cell-good'
  }

  return 'matchup-cell-neutral'
}

const addHeroToNewPool = (heroId: number) => {
  const hero = allHeroes.value.find((entry) => entry.id === heroId)
  if (!hero) {
    return
  }

  if (!newPoolHeroNames.value.includes(hero.name)) {
    newPoolHeroNames.value = [...newPoolHeroNames.value, hero.name]
  }
}

const removeHeroFromNewPool = (heroName: string) => {
  newPoolHeroNames.value = newPoolHeroNames.value.filter((name) => name !== heroName)
}

const handleCreatePool = () => {
  poolCreateError.value = ''
  const created = createPool(newPoolName.value, newPoolHeroNames.value)

  if (!created) {
    poolCreateError.value = 'Set a pool name and choose at least one hero.'
    return
  }

  newPoolName.value = ''
  newPoolHeroNames.value = []

  analyticsSource.value = 'custom'
  selectedAnalyticsPoolId.value = created.id
}

const handleDeletePool = (poolId: string) => {
  deletePool(poolId)
}
</script>

<template>
  <main class="dashboard">
    <h1>Unmatched Hero Pool Dashboard</h1>
    <p v-if="loading">Loading hero statistics...</p>

    <template v-else>
      <section>
        <h2>Analytics Source</h2>
        <div class="controls-row">
          <label>
            <span>Use hero set</span>
            <select v-model="analyticsSource">
              <option value="all">All Heroes</option>
              <option value="official">Officially Released Characters</option>
              <option value="custom">Custom Pool</option>
            </select>
          </label>

          <label v-if="analyticsSource === 'custom'">
            <span>Custom pool</span>
            <select v-model="selectedAnalyticsPoolId">
              <option disabled value="">Select a pool</option>
              <option v-for="pool in pools" :key="pool.id" :value="pool.id">{{ pool.name }}</option>
            </select>
          </label>
        </div>
        <p v-if="analyticsSource === 'custom' && pools.length === 0">No custom pools yet. Create one below.</p>
      </section>

      <section>
        <h2>Create Custom Hero Pool</h2>
        <div class="controls-row">
          <label>
            <span>Pool name</span>
            <input v-model="newPoolName" type="text" placeholder="e.g. Tournament Core" />
          </label>
        </div>

        <HeroSearchSelect
          :options="newPoolAvailableHeroes"
          button-label="Add Hero"
          empty-text="No heroes left to add"
          @select="addHeroToNewPool"
        />

        <p class="selection-label">Selected heroes ({{ newPoolHeroNames.length }}):</p>
        <ul class="selected-list">
          <li v-if="newPoolHeroNames.length === 0">No heroes selected for this pool.</li>
          <li v-for="heroName in newPoolHeroNames" :key="`pool-selected-${heroName}`">
            <span>{{ heroName }}</span>
            <button type="button" @click="removeHeroFromNewPool(heroName)">Remove</button>
          </li>
        </ul>

        <p v-if="poolCreateError" class="error">{{ poolCreateError }}</p>
        <button type="button" @click="handleCreatePool">Save Pool</button>
      </section>

      <section>
        <h2>Saved Custom Pools</h2>
        <p v-if="pools.length === 0">No saved pools yet.</p>
        <ul v-else>
          <li v-for="pool in pools" :key="pool.id">
            <span>{{ pool.name }} ({{ pool.heroNames.length }} heroes)</span>
            <button type="button" @click="handleDeletePool(pool.id)">Delete</button>
          </li>
        </ul>
      </section>

      <section class="stats" v-if="displayedHeroNames.length > 0">
        <article>
          <h2>Total Heroes</h2>
          <p>{{ totalHeroes }}</p>
        </article>
        <article>
          <h2>Total Games Logged</h2>
          <p>{{ totalGamesPlayed }}</p>
        </article>
      </section>

      <section class="section-wide" v-if="displayedHeroNames.length > 0">
        <h2>Pool Overview</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <button type="button" class="sort-button" @click="togglePoolSort('name')">
                    Hero <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="sort-button" @click="togglePoolSort('winRate')">
                    Win Rate <span class="sort-indicator">{{ getSortIndicator('winRate') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="sort-button" @click="togglePoolSort('pickRate')">
                    Pick Rate <span class="sort-indicator">{{ getSortIndicator('pickRate') }}</span>
                  </button>
                </th>
                <th>
                  <button type="button" class="sort-button" @click="togglePoolSort('gamesPlayed')">
                    Games Played <span class="sort-indicator">{{ getSortIndicator('gamesPlayed') }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="hero in sortedHeroRows" :key="hero.name">
                <td>{{ hero.name }}</td>
                <td>{{ hero.winRate.toFixed(1) }}%</td>
                <td>{{ hero.pickRate.toFixed(1) }}%</td>
                <td>{{ hero.gamesPlayed }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section-wide" v-if="displayedHeroNames.length > 0">
        <h2>Matchup Crosstable (Hero vs Hero)</h2>
        <div class="table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Hero</th>
                <th v-for="heroName in displayedHeroNames" :key="`head-${heroName}`">{{ heroName }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rowHero in displayedHeroNames" :key="`row-${rowHero}`">
                <th>{{ rowHero }}</th>
                <td
                  v-for="columnHero in displayedHeroNames"
                  :key="`cell-${rowHero}-${columnHero}`"
                  :class="
                    rowHero === columnHero
                      ? 'matchup-cell-empty'
                      : getMatchupCellClass(matchupMatrix[rowHero]?.[columnHero])
                  "
                >
                  <span v-if="rowHero === columnHero">--</span>
                  <span v-else>{{ formatWinRate(matchupMatrix[rowHero]?.[columnHero]) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rankings" v-if="displayedHeroNames.length > 0">
        <article>
          <h2>Least Losing Matchups Ranking</h2>
          <p>Losing matchup = win rate below {{ matchupThresholds.losingWinRateUpperBound }}%.</p>
          <ol>
            <li v-for="entry in leastLosingMatchups" :key="`least-${entry.heroName}`">
              {{ entry.heroName }} ({{ entry.losingMatchups }} losing matchups, {{ entry.gamesPlayed }} games played)
            </li>
          </ol>
        </article>

        <article>
          <h2>Most Winning Matchups Ranking</h2>
          <p>Winning matchup = win rate above {{ matchupThresholds.winningWinRateLowerBound }}%.</p>
          <ol>
            <li v-for="entry in mostWinningMatchups" :key="`most-${entry.heroName}`">
              {{ entry.heroName }} ({{ entry.winningMatchups }} winning matchups, {{ entry.gamesPlayed }} games played)
            </li>
          </ol>
        </article>
      </section>

      <p v-if="displayedHeroNames.length === 0">No heroes available for the selected source.</p>
    </template>
  </main>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 1.2rem;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
}

.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.controls-row label {
  display: grid;
  gap: 0.25rem;
  min-width: 220px;
}

.selection-label {
  margin: 0.75rem 0 0.4rem;
}

.selected-list {
  max-width: 420px;
}

.error {
  color: #b91c1c;
}

.stats,
.rankings {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.stats article,
.rankings article {
  border: 1px solid #2b3d57;
  border-radius: 8px;
  padding: 0.75rem;
  background: #0f172a;
}

section {
  border: 1px solid #2b3d57;
  border-radius: 8px;
  padding: 1rem;
  background: #0f172a;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.stats,
.rankings,
.table-wrap {
  max-width: 100%;
}

.section-wide {
  max-width: 980px;
}

.table-wrap {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 70vh;
  border: 1px solid #2a3a51;
  border-radius: 10px;
  scrollbar-width: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #0b1424;
  color: #e5eefb;
  border-radius: 10px;
  overflow: hidden;
}

thead th {
  background: #111c2f;
  color: #eaf2ff;
  font-weight: 600;
}

tbody th {
  background: #101a2b;
  color: #e3eeff;
  font-weight: 600;
}

.matrix-table th,
.matrix-table td {
  text-align: center;
}

.matrix-table thead th {
  position: sticky;
  top: 0;
  z-index: 12;
}

.matrix-table thead th:first-child {
  left: 0;
  z-index: 14;
}

.matrix-table tbody th {
  position: sticky;
  left: 0;
  z-index: 11;
}

.matrix-table td.matchup-cell-good {
  background: #1f4b3e;
  color: #d8ffee;
}

.matrix-table td.matchup-cell-neutral {
  background: #4a3b1f;
  color: #fff0c9;
}

.matrix-table td.matchup-cell-bad {
  background: #53252b;
  color: #ffdfe1;
}

.matrix-table td.matchup-cell-empty {
  background: #1b2739;
  color: #94a3b8;
}

th,
td {
  border: 1px solid #2a3a51;
  padding: 0.55rem;
  text-align: left;
  white-space: nowrap;
}

.sort-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: 0;
  color: inherit;
  font-weight: 600;
  padding: 0;
  cursor: pointer;
}

.sort-button:hover {
  color: #7dd3fc;
}

.sort-indicator {
  font-size: 0.75rem;
  opacity: 0.75;
}

.table-wrap::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.table-wrap::-webkit-scrollbar-track {
  background: #0f172a;
}

.table-wrap::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 999px;
  border: 2px solid #0f172a;
}

.table-wrap::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

ul,
ol {
  margin: 0;
  padding-left: 1.25rem;
}

li {
  margin-bottom: 0.45rem;
}

button {
  margin-left: 0.5rem;
}

@media (max-width: 900px) {
  section {
    max-width: 100%;
  }

  .section-wide {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  .dashboard {
    gap: 0.9rem;
  }

  section {
    padding: 0.85rem;
  }

  .controls-row {
    flex-direction: column;
    gap: 0.75rem;
  }

  .controls-row label {
    min-width: 0;
    width: 100%;
  }

  .selected-list {
    max-width: 100%;
  }

  th,
  td {
    padding: 0.4rem;
    font-size: 0.9rem;
  }
}
</style>
