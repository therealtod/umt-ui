<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import HeroSearchSelect from '@/components/HeroSearchSelect.vue'
import { useHeroPools } from '@/composables/useHeroPools'
import type { HeroStatsDictionary } from '@/services/HeroStatsDataSource'
import { heroStatsDataSource, heroStatsFilter } from '@/services/currentHeroStatsDataSource'
import { buildMatchupWinRateMatrix, type MatchupWinRateMatrix } from '@/services/heroStatsUtils'
import { findBestCounterCandidates } from '@/services/rosterAnalysisUtils'

type HeroEntry = {
  id: number
  name: string
}

const loading = ref(true)
const allHeroes = ref<HeroEntry[]>([])
const selectedHeroIds = ref<number[]>([])
const sourceMode = ref<'all' | 'official' | 'custom'>('official')
const selectedPoolId = ref('')

const heroStatsDictionary = ref<HeroStatsDictionary>({})
const matchupMatrix = ref<MatchupWinRateMatrix>({})
const { pools } = useHeroPools()

onMounted(async () => {
  const [heroes, dictionary] = await Promise.all([
    heroStatsDataSource.getHeroes(heroStatsFilter),
    heroStatsDataSource.getAsDictionary(heroStatsFilter),
  ])

  allHeroes.value = heroes.map((name, index) => ({ id: index + 1, name }))
  heroStatsDictionary.value = dictionary
  matchupMatrix.value = await buildMatchupWinRateMatrix(heroStatsDataSource, heroes, heroStatsFilter)
  loading.value = false
})

const selectedPool = computed(() => pools.value.find((pool) => pool.id === selectedPoolId.value) ?? null)

const sourceHeroes = computed(() => {
  if (sourceMode.value === 'all') {
    return allHeroes.value
  }

  if (sourceMode.value === 'official') {
    return allHeroes.value.filter((hero) => !hero.name.toLowerCase().includes('alt'))
  }

  if (!selectedPool.value) {
    return []
  }

  const allowedNames = new Set(selectedPool.value.heroNames)
  return allHeroes.value.filter((hero) => allowedNames.has(hero.name))
})

watch(
  pools,
  (nextPools) => {
    if (sourceMode.value === 'custom' && !nextPools.some((pool) => pool.id === selectedPoolId.value)) {
      selectedPoolId.value = nextPools[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  sourceHeroes,
  (heroes) => {
    const allowedIds = new Set(heroes.map((hero) => hero.id))
    selectedHeroIds.value = selectedHeroIds.value.filter((id) => allowedIds.has(id))
  },
  { immediate: true },
)

const availableHeroes = computed(() =>
  sourceHeroes.value.filter((hero) => !selectedHeroIds.value.includes(hero.id)),
)

const selectedHeroes = computed(() => sourceHeroes.value.filter((hero) => selectedHeroIds.value.includes(hero.id)))

const addHeroToRoster = (heroId: number) => {
  if (!selectedHeroIds.value.includes(heroId)) {
    selectedHeroIds.value = [...selectedHeroIds.value, heroId]
  }
}

const removeHeroFromRoster = (heroId: number) => {
  selectedHeroIds.value = selectedHeroIds.value.filter((id) => id !== heroId)
}

const rosterAverages = computed(() => {
  if (selectedHeroes.value.length === 0) {
    return { winRate: 0, pickRate: 0, gamesPlayed: 0 }
  }

  const totals = selectedHeroes.value.reduce(
    (acc, hero) => {
      const stats = heroStatsDictionary.value[hero.name]
      acc.winRate += stats?.winRate ?? 0
      acc.pickRate += stats?.pickRate ?? 0
      acc.gamesPlayed += stats?.gamesPlayed ?? 0
      return acc
    },
    { winRate: 0, pickRate: 0, gamesPlayed: 0 },
  )

  return {
    winRate: Number((totals.winRate / selectedHeroes.value.length).toFixed(1)),
    pickRate: Number((totals.pickRate / selectedHeroes.value.length).toFixed(1)),
    gamesPlayed: totals.gamesPlayed,
  }
})

const selectedHeroNames = computed(() => selectedHeroes.value.map((hero) => hero.name))

const counterSearch = computed(() => {
  if (selectedHeroNames.value.length === 0) {
    return null
  }

  const selectedSet = new Set(selectedHeroNames.value)
  const candidateHeroNames = sourceHeroes.value
    .map((hero) => hero.name)
    .filter((heroName) => !selectedSet.has(heroName))

  return findBestCounterCandidates(candidateHeroNames, selectedHeroNames.value, matchupMatrix.value)
})
</script>

<template>
  <main class="analysis">
    <h1>Unmatched Hero Roster Analysis</h1>
    <p v-if="loading">Loading hero statistics...</p>

    <template v-else>
      <section>
        <h2>Hero Selection Source</h2>
        <div class="controls-row">
          <label>
            <span>Source</span>
            <select v-model="sourceMode">
              <option value="all">All Heroes</option>
              <option value="official">Officially Released Characters</option>
              <option value="custom">Custom Pool</option>
            </select>
          </label>

          <label v-if="sourceMode === 'custom'">
            <span>Custom pool</span>
            <select v-model="selectedPoolId">
              <option disabled value="">Select a pool</option>
              <option v-for="pool in pools" :key="pool.id" :value="pool.id">{{ pool.name }}</option>
            </select>
          </label>
        </div>
        <p v-if="sourceMode === 'custom' && pools.length === 0">No custom pools available yet.</p>
      </section>

      <section>
        <h2>Customize Roster</h2>
        <div class="roster-builder">
          <article>
            <h3>Add Hero</h3>
            <HeroSearchSelect
              :options="availableHeroes"
              button-label="Add To Roster"
              empty-text="No heroes available"
              @select="addHeroToRoster"
            />
            <p class="helper-text">Available in current source: {{ availableHeroes.length }}</p>
          </article>

          <article>
            <h3>Custom Roster ({{ selectedHeroes.length }})</h3>
            <ul>
              <li v-if="selectedHeroes.length === 0">No heroes selected.</li>
              <li v-for="hero in selectedHeroes" :key="hero.id">
                <span>{{ hero.name }}</span>
                <button type="button" @click="removeHeroFromRoster(hero.id)">Remove</button>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section>
        <h2>Roster Metrics</h2>
        <p v-if="selectedHeroes.length === 0">Add heroes to your roster to see analysis.</p>
        <div v-else class="metrics">
          <p>Average Win Rate: {{ rosterAverages.winRate }}%</p>
          <p>Average Pick Rate: {{ rosterAverages.pickRate }}%</p>
          <p>Total Games Logged (sum): {{ rosterAverages.gamesPlayed }}</p>
        </div>
      </section>

      <section>
        <h2>Possible Weaknesses (Counters from Selection Source)</h2>
        <p v-if="selectedHeroes.length === 0">Add heroes to your roster to evaluate possible counters.</p>
        <p v-else-if="!counterSearch">
          No hero currently qualifies as a relevant counter, even with fallback thresholds.
        </p>
        <template v-else>
          <p>
            <template v-if="counterSearch.strategy === 'full'">
              Absolute counters found: they beat all {{ counterSearch.rosterSize }} roster heroes at more than
              {{ counterSearch.threshold }}% win rate.
            </template>
            <template v-else-if="counterSearch.strategy === 'one-miss'">
              Near-full counters found: they beat {{ counterSearch.requiredWinningMatchups }}/{{ counterSearch.rosterSize }}
              roster heroes at more than {{ counterSearch.threshold }}% win rate.
            </template>
            <template v-else>
              Last-resort counters found: they beat at least
              {{ counterSearch.requiredWinningMatchups }}/{{ counterSearch.rosterSize }} roster heroes at more than
              {{ counterSearch.threshold }}% win rate.
            </template>
          </p>
          <ul>
            <li v-for="counter in counterSearch.candidates" :key="counter.heroName">
            {{ counter.heroName }}: {{ counter.winningMatchups }} winning matchups against your roster,
            {{ counter.averageWinRate.toFixed(1) }}% average win rate
            </li>
          </ul>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.analysis {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 1080px;
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

.analysis section,
.roster-builder article {
  border: 1px solid #d7d7d7;
  border-radius: 8px;
  padding: 1rem;
  background: #fff;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.roster-builder {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.helper-text {
  margin-top: 0.5rem;
  color: #6b7280;
}

.metrics {
  display: grid;
  gap: 0.25rem;
}

h3 {
  margin-bottom: 0.6rem;
}

ul,
ol {
  margin: 0;
  padding-left: 1.25rem;
}

li {
  margin-bottom: 0.5rem;
}

button {
  margin-left: 0.5rem;
}

@media (max-width: 900px) {
  .analysis section,
  .roster-builder article {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  .analysis {
    gap: 0.9rem;
  }

  .analysis section,
  .roster-builder article {
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

  .roster-builder {
    grid-template-columns: 1fr;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
}
</style>
