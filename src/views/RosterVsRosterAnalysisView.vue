<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import HeroSearchSelect from '@/components/HeroSearchSelect.vue'
import { useHeroPools } from '@/composables/useHeroPools'
import { HERO_POOL_PRESETS } from '@/data/hero_pool_presets'
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

type AnalyticsSource = 'all' | 'custom' | `preset:${string}`

const defaultPresetId =
  HERO_POOL_PRESETS.find((preset) => preset.id === 'officially-released-heroes')?.id ?? HERO_POOL_PRESETS[0]?.id
const defaultAnalyticsSource: AnalyticsSource = defaultPresetId ? `preset:${defaultPresetId}` : 'all'

const loading = ref(true)
const allHeroes = ref<HeroEntry[]>([])
const rosterOneIds = ref<number[]>([])
const rosterTwoIds = ref<number[]>([])

const analyticsSource = ref<AnalyticsSource>(defaultAnalyticsSource)
const selectedAnalyticsPoolId = ref('')

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

const selectedAnalyticsPool = computed(() =>
  pools.value.find((pool) => pool.id === selectedAnalyticsPoolId.value) ?? null,
)
const selectedPreset = computed(() => {
  if (!analyticsSource.value.startsWith('preset:')) {
    return null
  }
  const presetId = analyticsSource.value.slice('preset:'.length)
  return HERO_POOL_PRESETS.find((preset) => preset.id === presetId) ?? null
})

const sourceHeroes = computed(() => {
  if (analyticsSource.value === 'all') {
    return allHeroes.value
  }

  if (selectedPreset.value) {
    return allHeroes.value.filter((hero) => selectedPreset.value?.heroNameSet.has(hero.name))
  }

  if (!selectedAnalyticsPool.value) {
    return []
  }

  const allowedNames = new Set(selectedAnalyticsPool.value.heroNames)
  return allHeroes.value.filter((hero) => allowedNames.has(hero.name))
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

const toggleBan = (roster: 'one' | 'two', heroName: string, checked: boolean) => {
  const target = roster === 'one' ? selectedBanFromRosterOne : selectedBanFromRosterTwo
  if (checked) {
    if (target.value.length < banCount.value && !target.value.includes(heroName)) {
      target.value = [...target.value, heroName]
    }
  } else {
    target.value = target.value.filter((name) => name !== heroName)
  }
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

const getTopThreateningHeroes = (
  opponentRoster: HeroEntry[],
  targetRoster: HeroEntry[],
  count: number,
): ThreatSummary[] => {
  if (opponentRoster.length === 0 || targetRoster.length === 0) {
    return []
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

  return threats
    .sort((a, b) => b.averageWinRate - a.averageWinRate || b.winningMatchups - a.winningMatchups)
    .slice(0, count)
}

const mostThreateningToRosterOne = computed(() =>
  getTopThreateningHeroes(rosterTwo.value, rosterOne.value, banCount.value),
)
const mostThreateningToRosterTwo = computed(() =>
  getTopThreateningHeroes(rosterOne.value, rosterTwo.value, banCount.value),
)

const suggestedBansByRosterOne = computed(() => mostThreateningToRosterOne.value.map((t) => t.heroName))
const suggestedBansByRosterTwo = computed(() => mostThreateningToRosterTwo.value.map((t) => t.heroName))

const selectedBanFromRosterTwo = ref<string[]>([])
const selectedBanFromRosterOne = ref<string[]>([])

const banCount = ref(1)
const maxBanCount = computed(() => Math.min(rosterOne.value.length, rosterTwo.value.length))

const rosterTwoBanOptions = computed(() => rosterTwo.value.map((hero) => hero.name))
const rosterOneBanOptions = computed(() => rosterOne.value.map((hero) => hero.name))

watch(
  [rosterTwoBanOptions, suggestedBansByRosterOne],
  ([banOptions, suggestedBans]) => {
    const newBans: string[] = []
    for (const suggestedBan of suggestedBans) {
      if (banOptions.includes(suggestedBan) && newBans.length < banCount.value && !newBans.includes(suggestedBan)) {
        newBans.push(suggestedBan)
      }
    }
    if (newBans.length > 0) {
      selectedBanFromRosterTwo.value = newBans
    }
  },
  { immediate: true },
)

watch(
  [rosterOneBanOptions, suggestedBansByRosterTwo],
  ([banOptions, suggestedBans]) => {
    const newBans: string[] = []
    for (const suggestedBan of suggestedBans) {
      if (banOptions.includes(suggestedBan) && newBans.length < banCount.value && !newBans.includes(suggestedBan)) {
        newBans.push(suggestedBan)
      }
    }
    if (newBans.length > 0) {
      selectedBanFromRosterOne.value = newBans
    }
  },
  { immediate: true },
)

watch(banCount, () => {
  selectedBanFromRosterOne.value = selectedBanFromRosterOne.value.slice(0, banCount.value)
  selectedBanFromRosterTwo.value = selectedBanFromRosterTwo.value.slice(0, banCount.value)
})

const rosterOneAfterBans = computed(() => {
  if (selectedBanFromRosterOne.value.length === 0) {
    return rosterOne.value
  }

  const bannedSet = new Set(selectedBanFromRosterOne.value)
  return rosterOne.value.filter((hero) => !bannedSet.has(hero.name))
})

const rosterTwoAfterBans = computed(() => {
  if (selectedBanFromRosterTwo.value.length === 0) {
    return rosterTwo.value
  }

  const bannedSet = new Set(selectedBanFromRosterTwo.value)
  return rosterTwo.value.filter((hero) => !bannedSet.has(hero.name))
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
  getTopThreateningHeroes(rosterTwoAfterBans.value, rosterOneAfterBans.value, banCount.value),
)
const mostThreateningToRosterTwoAfterBans = computed(() =>
  getTopThreateningHeroes(rosterOneAfterBans.value, rosterTwoAfterBans.value, banCount.value),
)

const formatWinRate = (value: number | null) => (value == null ? '--' : `${value.toFixed(1)}%`)

const getMatchupCellClass = (value: number | null) => {
  if (value == null) {
    return 'matchup-cell-empty'
  }

  if (value <= matchupThresholds.hardLosingWinRateUpperBound) {
    return 'matchup-cell-hard-bad'
  }

  if (value >= matchupThresholds.hardWinningWinRateLowerBound) {
    return 'matchup-cell-hard-good'
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
        <h2>Analytics Source</h2>
        <div class="controls-row">
          <label>
            <span>Use hero set</span>
            <select v-model="analyticsSource">
              <option value="all">All Heroes</option>
              <option v-for="preset in HERO_POOL_PRESETS" :key="preset.id" :value="`preset:${preset.id}`">
                {{ preset.label }}
              </option>
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
        <p v-if="analyticsSource === 'custom' && pools.length === 0">No custom pools available yet.</p>
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
        <h2>Bans</h2>
        <div class="ban-controls">
          <label class="ban-count-control">
            <span>Number of bans per side:</span>
            <select v-model="banCount">
              <option v-for="n in Math.max(0, maxBanCount)" :key="`ban-count-${n}`" :value="n">
                {{ n }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="banCount > 0" class="ban-grid">
          <article>
            <h3>Roster 1 Bans (from Roster 2)</h3>
            <p v-if="rosterTwoBanOptions.length === 0">No heroes in Roster 2 to ban.</p>
            <ul v-else class="ban-check-list">
              <li v-for="heroName in rosterTwoBanOptions" :key="`ban-r1-${heroName}`">
                <label>
                  <input
                    type="checkbox"
                    :value="heroName"
                    :checked="selectedBanFromRosterTwo.includes(heroName)"
                    @change="(e) => toggleBan('two', heroName, (e.target as HTMLInputElement).checked)"
                  />
                  <span>{{ heroName }}</span>
                </label>
              </li>
            </ul>
          </article>

          <article>
            <h3>Roster 2 Bans (from Roster 1)</h3>
            <p v-if="rosterOneBanOptions.length === 0">No heroes in Roster 1 to ban.</p>
            <ul v-else class="ban-check-list">
              <li v-for="heroName in rosterOneBanOptions" :key="`ban-r2-${heroName}`">
                <label>
                  <input
                    type="checkbox"
                    :value="heroName"
                    :checked="selectedBanFromRosterOne.includes(heroName)"
                    @change="(e) => toggleBan('one', heroName, (e.target as HTMLInputElement).checked)"
                  />
                  <span>{{ heroName }}</span>
                </label>
              </li>
            </ul>
          </article>
        </div>
        <p v-else>Set a ban count to enable bans.</p>
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
        <h2>Top {{ banCount }} Most Threatening Opponent Heroes (Before Bans)</h2>
        <p v-if="mostThreateningToRosterOne.length === 0 || mostThreateningToRosterTwo.length === 0">
          Select heroes in both rosters to identify the biggest threats.
        </p>
        <div v-else class="threat-grid">
          <article>
            <h3>Threats to Roster 1</h3>
            <ul class="threat-list">
              <li v-for="(threat, index) in mostThreateningToRosterOne" :key="`threat-r1-${index}`">
                <strong>#{{ index + 1 }} {{ threat.heroName }}</strong>
                - {{ threat.averageWinRate.toFixed(1) }}% avg WR ({{ threat.winningMatchups }} winning matchups)
              </li>
            </ul>
          </article>

          <article>
            <h3>Threats to Roster 2</h3>
            <ul class="threat-list">
              <li v-for="(threat, index) in mostThreateningToRosterTwo" :key="`threat-r2-${index}`">
                <strong>#{{ index + 1 }} {{ threat.heroName }}</strong>
                - {{ threat.averageWinRate.toFixed(1) }}% avg WR ({{ threat.winningMatchups }} winning matchups)
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section>
        <h2>Comparison Summary (After Selected Bans)</h2>
        <p>
          Current bans:
          Roster 1 bans <strong>{{ selectedBanFromRosterTwo.length > 0 ? selectedBanFromRosterTwo.join(', ') : 'none' }}</strong>,
          Roster 2 bans
          <strong>{{ selectedBanFromRosterOne.length > 0 ? selectedBanFromRosterOne.join(', ') : 'none' }}</strong>.
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
        <h2>Top {{ banCount }} Most Threatening Opponent Heroes (After Selected Bans)</h2>
        <p v-if="mostThreateningToRosterOneAfterBans.length === 0 || mostThreateningToRosterTwoAfterBans.length === 0">
          Post-ban threats are unavailable with the current roster sizes.
        </p>
        <div v-else class="threat-grid">
          <article>
            <h3>Threats to Roster 1</h3>
            <ul class="threat-list">
              <li v-for="(threat, index) in mostThreateningToRosterOneAfterBans" :key="`post-threat-r1-${index}`">
                <strong>#{{ index + 1 }} {{ threat.heroName }}</strong>
                - {{ threat.averageWinRate.toFixed(1) }}% avg WR ({{ threat.winningMatchups }} winning matchups)
              </li>
            </ul>
          </article>

          <article>
            <h3>Threats to Roster 2</h3>
            <ul class="threat-list">
              <li v-for="(threat, index) in mostThreateningToRosterTwoAfterBans" :key="`post-threat-r2-${index}`">
                <strong>#{{ index + 1 }} {{ threat.heroName }}</strong>
                - {{ threat.averageWinRate.toFixed(1) }}% avg WR ({{ threat.winningMatchups }} winning matchups)
              </li>
            </ul>
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

.matrix-table td.matchup-cell-hard-good {
  background: #14532d;
  color: #dcfce7;
  font-weight: 700;
}

.matrix-table td.matchup-cell-neutral {
  background: #4a3b1f;
  color: #fff0c9;
}

.matrix-table td.matchup-cell-bad {
  background: #53252b;
  color: #ffdfe1;
}

.matrix-table td.matchup-cell-hard-bad {
  background: #7f1d1d;
  color: #fee2e2;
  font-weight: 700;
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

.ban-controls {
  margin-bottom: 1rem;
}

.ban-count-control {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.ban-check-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.ban-check-list li label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}

.threat-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.threat-list li {
  margin-bottom: 0.5rem;
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
