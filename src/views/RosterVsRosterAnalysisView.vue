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

type ThreatSummary = {
  heroName: string
  averageWinRate: number
  winningMatchups: number
}

const loading = ref(true)
const allHeroes = ref<HeroEntry[]>([])
const rosterOneIds = ref<number[]>([])
const rosterTwoIds = ref<number[]>([])

const sourceMode = ref<'all' | 'custom'>('all')
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
    rosterOneIds.value = rosterOneIds.value.filter((id) => allowedIds.has(id))
    rosterTwoIds.value = rosterTwoIds.value.filter((id) => allowedIds.has(id))
  },
  { immediate: true },
)

const rosterOneAvailableHeroes = computed(() =>
  sourceHeroes.value.filter((hero) => !rosterOneIds.value.includes(hero.id)),
)
const rosterTwoAvailableHeroes = computed(() =>
  sourceHeroes.value.filter((hero) => !rosterTwoIds.value.includes(hero.id)),
)

const rosterOne = computed(() => sourceHeroes.value.filter((hero) => rosterOneIds.value.includes(hero.id)))
const rosterTwo = computed(() => sourceHeroes.value.filter((hero) => rosterTwoIds.value.includes(hero.id)))

const addHeroToRoster = (roster: 'one' | 'two', heroId: number) => {
  if (roster === 'one' && !rosterOneIds.value.includes(heroId)) {
    rosterOneIds.value = [...rosterOneIds.value, heroId]
  }

  if (roster === 'two' && !rosterTwoIds.value.includes(heroId)) {
    rosterTwoIds.value = [...rosterTwoIds.value, heroId]
  }
}

const removeHeroFromRoster = (roster: 'one' | 'two', heroId: number) => {
  if (roster === 'one') {
    rosterOneIds.value = rosterOneIds.value.filter((id) => id !== heroId)
    return
  }

  rosterTwoIds.value = rosterTwoIds.value.filter((id) => id !== heroId)
}

const getMatchupWinRate = (hero1: string, hero2: string) => matchupMatrix.value[hero1]?.[hero2] ?? null

const summarizeRoster = (roster: HeroEntry[]) => {
  if (roster.length === 0) {
    return {
      heroCount: 0,
      averageWinRate: 0,
      averagePickRate: 0,
      totalGamesPlayed: 0,
    }
  }

  const totals = roster.reduce(
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
    heroCount: roster.length,
    averageWinRate: Number((totals.winRate / roster.length).toFixed(1)),
    averagePickRate: Number((totals.pickRate / roster.length).toFixed(1)),
    totalGamesPlayed: totals.gamesPlayed,
  }
}

const rosterOneSummary = computed(() => summarizeRoster(rosterOne.value))
const rosterTwoSummary = computed(() => summarizeRoster(rosterTwo.value))

const comparison = computed(() => ({
  winRateDiff: Number((rosterOneSummary.value.averageWinRate - rosterTwoSummary.value.averageWinRate).toFixed(1)),
  pickRateDiff: Number((rosterOneSummary.value.averagePickRate - rosterTwoSummary.value.averagePickRate).toFixed(1)),
}))

const getMostThreateningHero = (opponentRoster: HeroEntry[], targetRoster: HeroEntry[]): ThreatSummary | null => {
  if (opponentRoster.length === 0 || targetRoster.length === 0) {
    return null
  }

  const threats = opponentRoster.map((opponentHero) => {
    const winRates = targetRoster
      .map((targetHero) => getMatchupWinRate(opponentHero.name, targetHero.name))
      .filter((value): value is number => value != null)

    const averageWinRate =
      winRates.length > 0 ? Number((winRates.reduce((sum, value) => sum + value, 0) / winRates.length).toFixed(1)) : 0

    return {
      heroName: opponentHero.name,
      averageWinRate,
      winningMatchups: winRates.filter((value) => value > matchupThresholds.winningWinRateLowerBound).length,
    }
  })

  return (
    threats.sort((a, b) => b.averageWinRate - a.averageWinRate || b.winningMatchups - a.winningMatchups)[0] ?? null
  )
}

const mostThreateningToRosterOne = computed(() => getMostThreateningHero(rosterTwo.value, rosterOne.value))
const mostThreateningToRosterTwo = computed(() => getMostThreateningHero(rosterOne.value, rosterTwo.value))

const suggestedBanByRosterOne = computed(() => mostThreateningToRosterOne.value?.heroName ?? null)
const suggestedBanByRosterTwo = computed(() => mostThreateningToRosterTwo.value?.heroName ?? null)

const selectedBanFromRosterTwo = ref('')
const selectedBanFromRosterOne = ref('')

const rosterTwoBanOptions = computed(() => rosterTwo.value.map((hero) => hero.name))
const rosterOneBanOptions = computed(() => rosterOne.value.map((hero) => hero.name))

watch(
  [rosterTwoBanOptions, suggestedBanByRosterOne],
  ([banOptions, suggestedBan]) => {
    if (selectedBanFromRosterTwo.value && banOptions.includes(selectedBanFromRosterTwo.value)) {
      return
    }

    selectedBanFromRosterTwo.value = suggestedBan && banOptions.includes(suggestedBan) ? suggestedBan : ''
  },
  { immediate: true },
)

watch(
  [rosterOneBanOptions, suggestedBanByRosterTwo],
  ([banOptions, suggestedBan]) => {
    if (selectedBanFromRosterOne.value && banOptions.includes(selectedBanFromRosterOne.value)) {
      return
    }

    selectedBanFromRosterOne.value = suggestedBan && banOptions.includes(suggestedBan) ? suggestedBan : ''
  },
  { immediate: true },
)

const rosterOneAfterBans = computed(() => {
  if (!selectedBanFromRosterOne.value) {
    return rosterOne.value
  }

  return rosterOne.value.filter((hero) => hero.name !== selectedBanFromRosterOne.value)
})

const rosterTwoAfterBans = computed(() => {
  if (!selectedBanFromRosterTwo.value) {
    return rosterTwo.value
  }

  return rosterTwo.value.filter((hero) => hero.name !== selectedBanFromRosterTwo.value)
})

const rosterOneSummaryAfterBans = computed(() => summarizeRoster(rosterOneAfterBans.value))
const rosterTwoSummaryAfterBans = computed(() => summarizeRoster(rosterTwoAfterBans.value))

const comparisonAfterBans = computed(() => ({
  winRateDiff: Number(
    (rosterOneSummaryAfterBans.value.averageWinRate - rosterTwoSummaryAfterBans.value.averageWinRate).toFixed(1),
  ),
  pickRateDiff: Number(
    (rosterOneSummaryAfterBans.value.averagePickRate - rosterTwoSummaryAfterBans.value.averagePickRate).toFixed(1),
  ),
}))

const mostThreateningToRosterOneAfterBans = computed(() =>
  getMostThreateningHero(rosterTwoAfterBans.value, rosterOneAfterBans.value),
)
const mostThreateningToRosterTwoAfterBans = computed(() =>
  getMostThreateningHero(rosterOneAfterBans.value, rosterTwoAfterBans.value),
)

const formatWinRate = (value: number | null) => (value == null ? '--' : `${value.toFixed(1)}%`)

const getMatchupCellClass = (value: number | null) => {
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
</script>

<template>
  <main class="comparison-page">
    <h1>Roster 1 vs Roster 2 Analysis</h1>
    <p v-if="loading">Loading hero statistics...</p>

    <template v-else>
      <section>
        <h2>Hero Selection Source</h2>
        <div class="controls-row">
          <label>
            <span>Source</span>
            <select v-model="sourceMode">
              <option value="all">All Heroes</option>
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

      <section class="roster-grid">
        <article>
          <h2>Roster 1 Builder</h2>
          <HeroSearchSelect
            :options="rosterOneAvailableHeroes"
            button-label="Add To Roster 1"
            empty-text="No heroes available"
            @select="(heroId) => addHeroToRoster('one', heroId)"
          />

          <div class="hero-list">
            <p>Roster 1 ({{ rosterOne.length }})</p>
            <ul>
              <li v-if="rosterOne.length === 0">No heroes selected.</li>
              <li v-for="hero in rosterOne" :key="`roster-one-${hero.id}`">
                <span>{{ hero.name }}</span>
                <button type="button" @click="removeHeroFromRoster('one', hero.id)">Remove</button>
              </li>
            </ul>
          </div>
        </article>

        <article>
          <h2>Roster 2 Builder</h2>
          <HeroSearchSelect
            :options="rosterTwoAvailableHeroes"
            button-label="Add To Roster 2"
            empty-text="No heroes available"
            @select="(heroId) => addHeroToRoster('two', heroId)"
          />

          <div class="hero-list">
            <p>Roster 2 ({{ rosterTwo.length }})</p>
            <ul>
              <li v-if="rosterTwo.length === 0">No heroes selected.</li>
              <li v-for="hero in rosterTwo" :key="`roster-two-${hero.id}`">
                <span>{{ hero.name }}</span>
                <button type="button" @click="removeHeroFromRoster('two', hero.id)">Remove</button>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <section>
        <h2>Ban Recommendations</h2>
        <p v-if="!suggestedBanByRosterOne || !suggestedBanByRosterTwo">
          Select heroes in both rosters to get ban recommendations.
        </p>
        <div v-else class="ban-grid">
          <article>
            <h3>Roster 1 Suggested Ban</h3>
            <p>Ban from Roster 2: {{ suggestedBanByRosterOne }}</p>
            <p>
              Reason:
              {{ mostThreateningToRosterOne ? mostThreateningToRosterOne.averageWinRate.toFixed(1) : '--' }}%
              average win rate into Roster 1
            </p>
            <label class="ban-control">
              <span>Selected ban from Roster 2</span>
              <select v-model="selectedBanFromRosterTwo">
                <option value="">No ban selected</option>
                <option v-for="heroName in rosterTwoBanOptions" :key="`ban-r1-${heroName}`" :value="heroName">
                  {{ heroName }}
                </option>
              </select>
            </label>
          </article>

          <article>
            <h3>Roster 2 Suggested Ban</h3>
            <p>Ban from Roster 1: {{ suggestedBanByRosterTwo }}</p>
            <p>
              Reason:
              {{ mostThreateningToRosterTwo ? mostThreateningToRosterTwo.averageWinRate.toFixed(1) : '--' }}%
              average win rate into Roster 2
            </p>
            <label class="ban-control">
              <span>Selected ban from Roster 1</span>
              <select v-model="selectedBanFromRosterOne">
                <option value="">No ban selected</option>
                <option v-for="heroName in rosterOneBanOptions" :key="`ban-r2-${heroName}`" :value="heroName">
                  {{ heroName }}
                </option>
              </select>
            </label>
          </article>
        </div>
      </section>

      <section>
        <h2>Comparison Summary (Before Bans)</h2>
        <div class="summary-grid">
          <article>
            <h3>Roster 1</h3>
            <p>Heroes: {{ rosterOneSummary.heroCount }}</p>
            <p>Average Win Rate: {{ rosterOneSummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ rosterOneSummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ rosterOneSummary.totalGamesPlayed }}</p>
          </article>

          <article>
            <h3>Roster 2</h3>
            <p>Heroes: {{ rosterTwoSummary.heroCount }}</p>
            <p>Average Win Rate: {{ rosterTwoSummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ rosterTwoSummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ rosterTwoSummary.totalGamesPlayed }}</p>
          </article>
        </div>

        <p class="diff">Win Rate Difference (R1 - R2): {{ comparison.winRateDiff }}%</p>
        <p class="diff">Pick Rate Difference (R1 - R2): {{ comparison.pickRateDiff }}%</p>
      </section>

      <section>
        <h2>Roster 1 vs Roster 2 Crosstable (Before Bans)</h2>
        <p v-if="rosterOne.length === 0 || rosterTwo.length === 0">
          Select at least one hero in each roster to view the crosstable.
        </p>
        <div v-else class="table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Roster 1 Hero</th>
                <th v-for="hero in rosterTwo" :key="`head-r2-${hero.id}`">{{ hero.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="heroOne in rosterOne" :key="`row-r1-${heroOne.id}`">
                <th>{{ heroOne.name }}</th>
                <td
                  v-for="heroTwo in rosterTwo"
                  :key="`cell-${heroOne.id}-${heroTwo.id}`"
                  :class="getMatchupCellClass(getMatchupWinRate(heroOne.name, heroTwo.name))"
                >
                  {{ formatWinRate(getMatchupWinRate(heroOne.name, heroTwo.name)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Most Threatening Opponent Heroes (Before Bans)</h2>
        <p v-if="!mostThreateningToRosterOne || !mostThreateningToRosterTwo">
          Select heroes in both rosters to identify the biggest threats.
        </p>
        <div v-else class="threat-grid">
          <article>
            <h3>Threat to Roster 1</h3>
            <p>{{ mostThreateningToRosterOne.heroName }}</p>
            <p>Average win rate into Roster 1: {{ mostThreateningToRosterOne.averageWinRate.toFixed(1) }}%</p>
            <p>Winning matchups into Roster 1: {{ mostThreateningToRosterOne.winningMatchups }}</p>
          </article>

          <article>
            <h3>Threat to Roster 2</h3>
            <p>{{ mostThreateningToRosterTwo.heroName }}</p>
            <p>Average win rate into Roster 2: {{ mostThreateningToRosterTwo.averageWinRate.toFixed(1) }}%</p>
            <p>Winning matchups into Roster 2: {{ mostThreateningToRosterTwo.winningMatchups }}</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Comparison Summary (After Selected Bans)</h2>
        <p>
          Current bans:
          Roster 1 bans <strong>{{ selectedBanFromRosterTwo || 'none' }}</strong>, Roster 2 bans
          <strong>{{ selectedBanFromRosterOne || 'none' }}</strong>.
        </p>
        <div class="summary-grid">
          <article>
            <h3>Roster 1</h3>
            <p>Heroes: {{ rosterOneSummaryAfterBans.heroCount }}</p>
            <p>Average Win Rate: {{ rosterOneSummaryAfterBans.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ rosterOneSummaryAfterBans.averagePickRate }}%</p>
            <p>Total Games Logged: {{ rosterOneSummaryAfterBans.totalGamesPlayed }}</p>
          </article>

          <article>
            <h3>Roster 2</h3>
            <p>Heroes: {{ rosterTwoSummaryAfterBans.heroCount }}</p>
            <p>Average Win Rate: {{ rosterTwoSummaryAfterBans.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ rosterTwoSummaryAfterBans.averagePickRate }}%</p>
            <p>Total Games Logged: {{ rosterTwoSummaryAfterBans.totalGamesPlayed }}</p>
          </article>
        </div>

        <p class="diff">Win Rate Difference (R1 - R2): {{ comparisonAfterBans.winRateDiff }}%</p>
        <p class="diff">Pick Rate Difference (R1 - R2): {{ comparisonAfterBans.pickRateDiff }}%</p>
      </section>

      <section>
        <h2>Roster 1 vs Roster 2 Crosstable (After Selected Bans)</h2>
        <p v-if="rosterOneAfterBans.length === 0 || rosterTwoAfterBans.length === 0">
          Post-ban crosstable is unavailable because one roster is empty after selected bans.
        </p>
        <div v-else class="table-wrap">
          <table class="matrix-table">
            <thead>
              <tr>
                <th>Roster 1 Hero</th>
                <th v-for="hero in rosterTwoAfterBans" :key="`head-post-r2-${hero.id}`">{{ hero.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="heroOne in rosterOneAfterBans" :key="`row-post-r1-${heroOne.id}`">
                <th>{{ heroOne.name }}</th>
                <td
                  v-for="heroTwo in rosterTwoAfterBans"
                  :key="`cell-post-${heroOne.id}-${heroTwo.id}`"
                  :class="getMatchupCellClass(getMatchupWinRate(heroOne.name, heroTwo.name))"
                >
                  {{ formatWinRate(getMatchupWinRate(heroOne.name, heroTwo.name)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Most Threatening Opponent Heroes (After Selected Bans)</h2>
        <p v-if="!mostThreateningToRosterOneAfterBans || !mostThreateningToRosterTwoAfterBans">
          Post-ban threats are unavailable with the current roster sizes.
        </p>
        <div v-else class="threat-grid">
          <article>
            <h3>Threat to Roster 1</h3>
            <p>{{ mostThreateningToRosterOneAfterBans.heroName }}</p>
            <p>
              Average win rate into Roster 1: {{ mostThreateningToRosterOneAfterBans.averageWinRate.toFixed(1) }}%
            </p>
            <p>Winning matchups into Roster 1: {{ mostThreateningToRosterOneAfterBans.winningMatchups }}</p>
          </article>

          <article>
            <h3>Threat to Roster 2</h3>
            <p>{{ mostThreateningToRosterTwoAfterBans.heroName }}</p>
            <p>
              Average win rate into Roster 2: {{ mostThreateningToRosterTwoAfterBans.averageWinRate.toFixed(1) }}%
            </p>
            <p>Winning matchups into Roster 2: {{ mostThreateningToRosterTwoAfterBans.winningMatchups }}</p>
          </article>
        </div>
      </section>

    </template>
  </main>
</template>

<style scoped>
.comparison-page {
  display: grid;
  gap: 1rem;
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

section,
.roster-grid article,
.summary-grid article,
.threat-grid article,
.ban-grid article {
  border: 1px solid #2b3d57;
  border-radius: 8px;
  padding: 1rem;
  background: #0f172a;
  width: 100%;
}

.roster-grid,
.summary-grid,
.threat-grid,
.ban-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.hero-list {
  margin-top: 0.75rem;
}

.table-wrap {
  overflow-x: auto;
}

.matrix-table th,
.matrix-table td {
  text-align: center;
}

.matrix-table thead th {
  background: #111c2f;
  color: #eaf2ff;
  font-weight: 600;
}

.matrix-table tbody th {
  background: #101a2b;
  color: #e3eeff;
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

ul {
  margin: 0;
  padding-left: 1.25rem;
}

li {
  margin-bottom: 0.45rem;
}

button {
  margin-left: 0.5rem;
}

.diff {
  margin-top: 0.75rem;
}

.ban-control {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.6rem;
}

@media (max-width: 768px) {
  .comparison-page {
    gap: 0.9rem;
  }

  section,
  .roster-grid article,
  .summary-grid article,
  .threat-grid article,
  .ban-grid article {
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

  .roster-grid,
  .summary-grid,
  .threat-grid {
    grid-template-columns: 1fr;
  }

  .hero-list ul li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .matrix-table th,
  .matrix-table td {
    font-size: 0.9rem;
    padding: 0.4rem;
  }
}
</style>
