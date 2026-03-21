<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import HeroSearchSelect from '@/components/HeroSearchSelect.vue'
import { useHeroPools } from '@/composables/useHeroPools'
import type { HeroStatsDictionary } from '@/services/HeroStatsDataSource'
import { heroStatsDataSource, heroStatsFilter } from '@/services/currentHeroStatsDataSource'
import { buildMatchupWinRateMatrix, type MatchupWinRateMatrix } from '@/services/heroStatsUtils'
import { matchupThresholds } from '@/services/matchupThresholds'
import {
  buildCounterCandidates,
  buildPoolStrengthRows,
  buildWeakLinkRows,
  findBestCounterCandidates,
  getMostThreateningHero,
  summarizeRoster,
} from '@/services/rosterAnalysisUtils'

type HeroEntry = {
  id: number
  name: string
}

type DraftPlayer = 'A' | 'B'
type DraftAction = 'pick' | 'ban-opponent' | 'ban-self'

type DraftTurn = {
  player: DraftPlayer
  action: DraftAction
  actionIndex: number
  actionsInTurn: number
}

type DraftRecord = {
  player: DraftPlayer
  action: DraftAction
  heroId: number
}

type RecommendationRow = {
  heroName: string
  winningMatchupsInPool: number
  losingMatchupsInPool: number
  counterWinningMatchups: number
  counterAverageWinRate: number
  bestOpponent: string | null
  bestOpponentWinRate: number | null
}

type BanRecommendationRow = {
  heroName: string
  averageWinRate: number
  winningMatchups: number
}

type ForecastRecommendationRow = {
  heroName: string
  winningMatchups: number
  averageWinRate: number
}

type MatchVictoryCondition = 'most-games' | 'all-heroes'

const draftType = ref<'banquest' | 'blanket'>('banquest')
const matchVictoryCondition = ref<MatchVictoryCondition>('most-games')
const banquestRosterSize = ref<2 | 4 | 6 | 8>(4)

const loading = ref(true)
const allHeroes = ref<HeroEntry[]>([])
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

const heroById = computed(() => {
  const dictionary = new Map<number, HeroEntry>()
  for (const hero of sourceHeroes.value) {
    dictionary.set(hero.id, hero)
  }
  return dictionary
})

const buildPickRecommendationBundle = (
  candidateHeroNames: string[],
  opponentRosterHeroNames: string[],
  victoryCondition: MatchVictoryCondition,
): { explanation: string | null; rows: RecommendationRow[] } => {
  const strengthRows = buildPoolStrengthRows(candidateHeroNames, matchupMatrix.value)
  const counterSearch = findBestCounterCandidates(candidateHeroNames, opponentRosterHeroNames, matchupMatrix.value)
  const counterMap = new Map((counterSearch?.candidates ?? []).map((row) => [row.heroName, row]))

  const rows: RecommendationRow[] = [...strengthRows]
    .map((row) => {
      const counter = counterMap.get(row.heroName)
      let bestOpponent: string | null = null
      let bestOpponentWinRate: number | null = null

      for (const opponent of opponentRosterHeroNames) {
        const winRate = matchupMatrix.value[row.heroName]?.[opponent] ?? null
        if (winRate == null) {
          continue
        }
        if (bestOpponentWinRate == null || winRate > bestOpponentWinRate) {
          bestOpponentWinRate = winRate
          bestOpponent = opponent
        }
      }

      return {
        heroName: row.heroName,
        winningMatchupsInPool: row.winningMatchups,
        losingMatchupsInPool: row.losingMatchups,
        counterWinningMatchups: counter?.winningMatchups ?? 0,
        counterAverageWinRate: counter?.averageWinRate ?? 0,
        bestOpponent,
        bestOpponentWinRate,
      }
    })
    .sort((a, b) => {
      if (victoryCondition === 'all-heroes') {
        const bestDiff = (b.bestOpponentWinRate ?? -1) - (a.bestOpponentWinRate ?? -1)
        if (bestDiff !== 0) {
          return bestDiff
        }
        const counterDiff = b.counterWinningMatchups - a.counterWinningMatchups
        if (counterDiff !== 0) {
          return counterDiff
        }
        return (
          a.losingMatchupsInPool - b.losingMatchupsInPool ||
          b.winningMatchupsInPool - a.winningMatchupsInPool ||
          b.counterAverageWinRate - a.counterAverageWinRate
        )
      }

      const counterDiff = b.counterWinningMatchups - a.counterWinningMatchups
      if (counterDiff !== 0) {
        return counterDiff
      }

      return (
        a.losingMatchupsInPool - b.losingMatchupsInPool ||
        b.winningMatchupsInPool - a.winningMatchupsInPool ||
        b.counterAverageWinRate - a.counterAverageWinRate
      )
    })
    .slice(0, 10)

  if (!counterSearch) {
    return {
      explanation:
        victoryCondition === 'all-heroes'
          ? 'No counter context yet. Recommendations prioritize specialists that can win into at least one opponent hero.'
          : 'No counter context yet. Recommendations are based on overall pool strength.',
      rows,
    }
  }

  const thresholdNote =
    counterSearch.threshold < matchupThresholds.winningWinRateLowerBound
      ? ` Winning threshold was tuned down to ${counterSearch.threshold}% to find viable options.`
      : ''

  if (counterSearch.strategy === 'full') {
    return {
      explanation:
        victoryCondition === 'all-heroes'
          ? `Strong specialists found. For all-heroes matches, prioritize picks with a dominant matchup into at least one opponent hero.${thresholdNote}`
          : `Counter picks found that beat all ${counterSearch.rosterSize} opponent heroes at > ${counterSearch.threshold}% win rate.${thresholdNote}`,
      rows,
    }
  }

  if (counterSearch.strategy === 'one-miss') {
    return {
      explanation:
        victoryCondition === 'all-heroes'
          ? `Specialist counters found that beat ${counterSearch.requiredWinningMatchups}/${counterSearch.rosterSize} opponent heroes. This helps cover specific opponent heroes with multiple favorable picks.${thresholdNote}`
          : `Counter picks found that beat ${counterSearch.requiredWinningMatchups}/${counterSearch.rosterSize} opponent heroes. This is a practical counter-pick because the remaining bad matchup can be banned or played around.${thresholdNote}`,
      rows,
    }
  }

  return {
    explanation:
      victoryCondition === 'all-heroes'
        ? `No full counter profile found. Last-resort picks focus on having at least one strong matchup into the opponent roster.${thresholdNote}`
        : `No full counter profile found. Last-resort picks were selected that beat at least ${counterSearch.requiredWinningMatchups}/${counterSearch.rosterSize} opponent heroes.${thresholdNote}`,
    rows,
  }
}

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

const formatWinRate = (value: number | null) => (value == null ? '--' : `${value.toFixed(1)}%`)
const getMatchupWinRate = (hero1: string, hero2: string) => matchupMatrix.value[hero1]?.[hero2] ?? null

const getPlayerLabel = (player: DraftPlayer) => (player === 'A' ? 'Leader (Player A)' : 'Follower (Player B)')

const buildBanquestTurns = (rosterSize: number): DraftTurn[] => {
  const rounds: DraftTurn[] = []
  const intermediateRounds = Math.max(0, (rosterSize - 2) / 2)

  rounds.push({ player: 'A', action: 'pick', actionIndex: 1, actionsInTurn: 1 })
  rounds.push({ player: 'B', action: 'pick', actionIndex: 1, actionsInTurn: 2 })
  rounds.push({ player: 'B', action: 'pick', actionIndex: 2, actionsInTurn: 2 })

  for (let i = 0; i < intermediateRounds; i += 1) {
    rounds.push({ player: 'A', action: 'pick', actionIndex: 1, actionsInTurn: 2 })
    rounds.push({ player: 'A', action: 'pick', actionIndex: 2, actionsInTurn: 2 })
    rounds.push({ player: 'B', action: 'pick', actionIndex: 1, actionsInTurn: 2 })
    rounds.push({ player: 'B', action: 'pick', actionIndex: 2, actionsInTurn: 2 })
  }

  rounds.push({ player: 'A', action: 'pick', actionIndex: 1, actionsInTurn: 1 })

  return rounds
}

// Banquest flow
const banquestTurns = computed(() => buildBanquestTurns(banquestRosterSize.value))

const banquestRecords = ref<DraftRecord[]>([])

const banquestPickRecords = computed(() => banquestRecords.value.filter((record) => record.action === 'pick'))
const banquestPendingOpponentBanA = ref<number | null>(null)
const banquestPendingOpponentBanB = ref<number | null>(null)
const banquestRevealedOpponentBanA = ref<number | null>(null)
const banquestRevealedOpponentBanB = ref<number | null>(null)
const banquestPendingSelfBanA = ref<number | null>(null)
const banquestPendingSelfBanB = ref<number | null>(null)
const banquestRevealedSelfBanA = ref<number | null>(null)
const banquestRevealedSelfBanB = ref<number | null>(null)

const banquestPickedHeroIds = computed(() => new Set(banquestPickRecords.value.map((record) => record.heroId)))

const banquestRosterA = computed(() =>
  banquestPickRecords.value
    .filter((record) => record.player === 'A')
    .map((record) => heroById.value.get(record.heroId))
    .filter((hero): hero is HeroEntry => Boolean(hero)),
)
const banquestRosterB = computed(() =>
  banquestPickRecords.value
    .filter((record) => record.player === 'B')
    .map((record) => heroById.value.get(record.heroId))
    .filter((hero): hero is HeroEntry => Boolean(hero)),
)

const banquestRosterANames = computed(() => banquestRosterA.value.map((hero) => hero.name))
const banquestRosterBNames = computed(() => banquestRosterB.value.map((hero) => hero.name))

const banquestRosterAAfterOpponentBans = computed(() =>
  banquestRosterA.value.filter((hero) => hero.id !== banquestRevealedOpponentBanB.value),
)
const banquestRosterBAfterOpponentBans = computed(() =>
  banquestRosterB.value.filter((hero) => hero.id !== banquestRevealedOpponentBanA.value),
)

const banquestRosterAAfterBans = computed(() =>
  banquestRosterAAfterOpponentBans.value.filter((hero) => hero.id !== banquestRevealedSelfBanA.value),
)
const banquestRosterBAfterBans = computed(() =>
  banquestRosterBAfterOpponentBans.value.filter((hero) => hero.id !== banquestRevealedSelfBanB.value),
)

const banquestRosterANamesAfterOpponentBans = computed(() =>
  banquestRosterAAfterOpponentBans.value.map((hero) => hero.name),
)
const banquestRosterBNamesAfterOpponentBans = computed(() =>
  banquestRosterBAfterOpponentBans.value.map((hero) => hero.name),
)
const banquestRosterANamesAfterBans = computed(() => banquestRosterAAfterBans.value.map((hero) => hero.name))
const banquestRosterBNamesAfterBans = computed(() => banquestRosterBAfterBans.value.map((hero) => hero.name))

const banquestTotalActions = computed(() => banquestTurns.value.length)
const banquestPicksComplete = computed(() => banquestPickRecords.value.length >= banquestTotalActions.value)
const banquestOpponentBansRevealed = computed(
  () => banquestRevealedOpponentBanA.value != null && banquestRevealedOpponentBanB.value != null,
)
const banquestSelfBansRevealed = computed(
  () => banquestRevealedSelfBanA.value != null && banquestRevealedSelfBanB.value != null,
)
const banquestIsComplete = computed(() => banquestPicksComplete.value && banquestSelfBansRevealed.value)
const banquestInOpponentBanPhase = computed(() => banquestPicksComplete.value && !banquestOpponentBansRevealed.value)
const banquestInSelfBanPhase = computed(
  () => banquestPicksComplete.value && banquestOpponentBansRevealed.value && !banquestSelfBansRevealed.value,
)
const banquestCurrentTurn = computed(() => banquestTurns.value[banquestPickRecords.value.length] ?? null)

const banquestPickSelectableHeroes = computed(() =>
  sourceHeroes.value.filter((hero) => !banquestPickedHeroIds.value.has(hero.id)),
)
const banquestOpponentBanSelectableForA = computed(() => banquestRosterB.value)
const banquestOpponentBanSelectableForB = computed(() => banquestRosterA.value)
const banquestSelfBanSelectableForA = computed(() => banquestRosterAAfterOpponentBans.value)
const banquestSelfBanSelectableForB = computed(() => banquestRosterBAfterOpponentBans.value)

const banquestTurnTitle = computed(() => {
  if (!banquestCurrentTurn.value) {
    if (banquestInOpponentBanPhase.value) {
      return 'Opponent ban selections: choose secretly, then reveal together'
    }
    if (banquestInSelfBanPhase.value) {
      return 'Self-ban selections: choose secretly, then reveal together'
    }
    return 'Draft complete'
  }

  const step = banquestPickRecords.value.length + 1
  return `Step ${step}/${banquestTotalActions.value}: ${getPlayerLabel(banquestCurrentTurn.value.player)} pick ${banquestCurrentTurn.value.actionIndex}/${banquestCurrentTurn.value.actionsInTurn}`
})

const banquestPickRecommendationBundle = computed(() => {
  if (!banquestCurrentTurn.value) {
    return { explanation: null as string | null, rows: [] as RecommendationRow[] }
  }

  const candidateHeroNames = banquestPickSelectableHeroes.value.map((hero) => hero.name)
  const opponentRosterNames =
    banquestCurrentTurn.value.player === 'A' ? banquestRosterBNames.value : banquestRosterANames.value

  return buildPickRecommendationBundle(candidateHeroNames, opponentRosterNames, matchVictoryCondition.value)
})

const buildOpponentBanRecommendations = (
  targetRoster: string[],
  opponentRoster: string[],
): BanRecommendationRow[] => {
  return opponentRoster
    .map((opponentHeroName) => {
      const winRates = targetRoster
        .map((targetHeroName) => matchupMatrix.value[opponentHeroName]?.[targetHeroName])
        .filter((value): value is number => value != null)

      const averageWinRate =
        winRates.length > 0 ? Number((winRates.reduce((sum, value) => sum + value, 0) / winRates.length).toFixed(1)) : 0

      return {
        heroName: opponentHeroName,
        averageWinRate,
        winningMatchups: winRates.filter((value) => value > matchupThresholds.winningWinRateLowerBound).length,
      }
    })
    .sort((a, b) => b.averageWinRate - a.averageWinRate || b.winningMatchups - a.winningMatchups)
}

const banquestBanRecommendationsA = computed<BanRecommendationRow[]>(() =>
  buildOpponentBanRecommendations(banquestRosterANames.value, banquestRosterBNames.value),
)
const banquestBanRecommendationsB = computed<BanRecommendationRow[]>(() =>
  buildOpponentBanRecommendations(banquestRosterBNames.value, banquestRosterANames.value),
)
const banquestSelfBanRecommendationsA = computed<BanRecommendationRow[]>(() =>
  buildWeakLinkRows(
    banquestRosterANamesAfterOpponentBans.value,
    banquestRosterBNamesAfterOpponentBans.value,
    matchupMatrix.value,
  ),
)
const banquestSelfBanRecommendationsB = computed<BanRecommendationRow[]>(() =>
  buildWeakLinkRows(
    banquestRosterBNamesAfterOpponentBans.value,
    banquestRosterANamesAfterOpponentBans.value,
    matchupMatrix.value,
  ),
)

const banquestSuggestedBanA = computed(() => banquestBanRecommendationsA.value[0]?.heroName ?? null)
const banquestSuggestedBanB = computed(() => banquestBanRecommendationsB.value[0]?.heroName ?? null)
const banquestSuggestedSelfBanA = computed(() => banquestSelfBanRecommendationsA.value[0]?.heroName ?? null)
const banquestSuggestedSelfBanB = computed(() => banquestSelfBanRecommendationsB.value[0]?.heroName ?? null)

const makeBanquestAction = (heroId: number) => {
  if (banquestPicksComplete.value || !banquestCurrentTurn.value) {
    return
  }

  if (!banquestPickSelectableHeroes.value.some((hero) => hero.id === heroId)) {
    return
  }

  banquestRecords.value = [
    ...banquestRecords.value,
    {
      player: banquestCurrentTurn.value.player,
      action: banquestCurrentTurn.value.action,
      heroId,
    },
  ]
}

const undoLastBanquestAction = () => {
  if (banquestPicksComplete.value) {
    return
  }

  if (banquestRecords.value.length === 0) {
    return
  }

  banquestRecords.value = banquestRecords.value.slice(0, -1)
}

const resetBanquestDraft = () => {
  banquestRecords.value = []
  banquestPendingOpponentBanA.value = null
  banquestPendingOpponentBanB.value = null
  banquestRevealedOpponentBanA.value = null
  banquestRevealedOpponentBanB.value = null
  banquestPendingSelfBanA.value = null
  banquestPendingSelfBanB.value = null
  banquestRevealedSelfBanA.value = null
  banquestRevealedSelfBanB.value = null
}

const setBanquestOpponentBanSelection = (player: DraftPlayer, heroId: number) => {
  if (!banquestInOpponentBanPhase.value) {
    return
  }

  if (player === 'A') {
    if (!banquestOpponentBanSelectableForA.value.some((hero) => hero.id === heroId)) {
      return
    }
    banquestPendingOpponentBanA.value = heroId
    return
  }

  if (!banquestOpponentBanSelectableForB.value.some((hero) => hero.id === heroId)) {
    return
  }
  banquestPendingOpponentBanB.value = heroId
}

const revealBanquestOpponentBans = () => {
  if (!banquestInOpponentBanPhase.value) {
    return
  }
  if (banquestPendingOpponentBanA.value == null || banquestPendingOpponentBanB.value == null) {
    return
  }
  banquestRevealedOpponentBanA.value = banquestPendingOpponentBanA.value
  banquestRevealedOpponentBanB.value = banquestPendingOpponentBanB.value
}

const setBanquestSelfBanSelection = (player: DraftPlayer, heroId: number) => {
  if (!banquestInSelfBanPhase.value) {
    return
  }

  if (player === 'A') {
    if (!banquestSelfBanSelectableForA.value.some((hero) => hero.id === heroId)) {
      return
    }
    banquestPendingSelfBanA.value = heroId
    return
  }

  if (!banquestSelfBanSelectableForB.value.some((hero) => hero.id === heroId)) {
    return
  }
  banquestPendingSelfBanB.value = heroId
}

const revealBanquestSelfBans = () => {
  if (!banquestInSelfBanPhase.value) {
    return
  }
  if (banquestPendingSelfBanA.value == null || banquestPendingSelfBanB.value == null) {
    return
  }
  banquestRevealedSelfBanA.value = banquestPendingSelfBanA.value
  banquestRevealedSelfBanB.value = banquestPendingSelfBanB.value
}

const banquestBannedByAName = computed(() => {
  return banquestRevealedOpponentBanA.value != null
    ? heroById.value.get(banquestRevealedOpponentBanA.value)?.name ?? 'none'
    : 'none'
})
const banquestBannedByBName = computed(() => {
  return banquestRevealedOpponentBanB.value != null
    ? heroById.value.get(banquestRevealedOpponentBanB.value)?.name ?? 'none'
    : 'none'
})
const banquestSelfBannedByAName = computed(() => {
  return banquestRevealedSelfBanA.value != null ? heroById.value.get(banquestRevealedSelfBanA.value)?.name ?? 'none' : 'none'
})
const banquestSelfBannedByBName = computed(() => {
  return banquestRevealedSelfBanB.value != null ? heroById.value.get(banquestRevealedSelfBanB.value)?.name ?? 'none' : 'none'
})

const banquestRosterASummary = computed(() =>
  summarizeRoster(banquestRosterANamesAfterBans.value, heroStatsDictionary.value),
)
const banquestRosterBSummary = computed(() =>
  summarizeRoster(banquestRosterBNamesAfterBans.value, heroStatsDictionary.value),
)

const banquestComparison = computed(() => ({
  winRateDiff: Number(
    (banquestRosterASummary.value.averageWinRate - banquestRosterBSummary.value.averageWinRate).toFixed(1),
  ),
  pickRateDiff: Number(
    (banquestRosterASummary.value.averagePickRate - banquestRosterBSummary.value.averagePickRate).toFixed(1),
  ),
}))

const banquestMostThreateningToA = computed(() =>
  getMostThreateningHero(
    banquestRosterBNamesAfterBans.value,
    banquestRosterANamesAfterBans.value,
    matchupMatrix.value,
  ),
)
const banquestMostThreateningToB = computed(() =>
  getMostThreateningHero(
    banquestRosterANamesAfterBans.value,
    banquestRosterBNamesAfterBans.value,
    matchupMatrix.value,
  ),
)

// Blanket flow
const blanketLockedAIds = ref<number[]>([])
const blanketLockedBIds = ref<number[]>([])
const blanketEliminatedIds = ref<number[]>([])
const blanketRoundSelectionsA = ref<number[]>([])
const blanketRoundSelectionsB = ref<number[]>([])
const blanketRoundHistory = ref<
  Array<{
    round: number
    mirrors: string[]
    lockedA: string[]
    lockedB: string[]
  }>
>([])
const blanketPendingOpponentBanA = ref<number | null>(null)
const blanketPendingOpponentBanB = ref<number | null>(null)
const blanketRevealedOpponentBanA = ref<number | null>(null)
const blanketRevealedOpponentBanB = ref<number | null>(null)
const blanketPendingSelfBanA = ref<number | null>(null)
const blanketPendingSelfBanB = ref<number | null>(null)
const blanketRevealedSelfBanA = ref<number | null>(null)
const blanketRevealedSelfBanB = ref<number | null>(null)
const blanketFirstRoundPickCount = ref(4)
const blanketTargetRosterSize = ref<number | null>(null)

const blanketLockedA = computed(() =>
  blanketLockedAIds.value
    .map((id) => heroById.value.get(id))
    .filter((hero): hero is HeroEntry => Boolean(hero)),
)
const blanketLockedB = computed(() =>
  blanketLockedBIds.value
    .map((id) => heroById.value.get(id))
    .filter((hero): hero is HeroEntry => Boolean(hero)),
)

const blanketLockedANames = computed(() => blanketLockedA.value.map((hero) => hero.name))
const blanketLockedBNames = computed(() => blanketLockedB.value.map((hero) => hero.name))
const blanketConfiguredRosterSize = computed(() => blanketTargetRosterSize.value ?? blanketFirstRoundPickCount.value)
const blanketMaxInitialPickCount = computed(() => Math.min(8, Math.max(2, sourceHeroes.value.length)))
const blanketInitialPickOptions = computed(() => {
  const options: number[] = []
  for (let count = 2; count <= blanketMaxInitialPickCount.value; count += 1) {
    options.push(count)
  }
  return options
})
const blanketCanConfigureFirstRound = computed(
  () => blanketRoundHistory.value.length === 0 && blanketLockedAIds.value.length === 0 && blanketLockedBIds.value.length === 0,
)

const blanketRemainingHeroes = computed(() => {
  const unavailable = new Set<number>([
    ...blanketLockedAIds.value,
    ...blanketLockedBIds.value,
    ...blanketEliminatedIds.value,
  ])
  return sourceHeroes.value.filter((hero) => !unavailable.has(hero.id))
})

const blanketNeededA = computed(() => Math.max(0, blanketConfiguredRosterSize.value - blanketLockedAIds.value.length))
const blanketNeededB = computed(() => Math.max(0, blanketConfiguredRosterSize.value - blanketLockedBIds.value.length))

const blanketDraftComplete = computed(
  () =>
    blanketLockedAIds.value.length >= blanketConfiguredRosterSize.value &&
    blanketLockedBIds.value.length >= blanketConfiguredRosterSize.value,
)
const blanketInBanPhase = computed(() => blanketDraftComplete.value)
const blanketOpponentBansRevealed = computed(
  () => blanketRevealedOpponentBanA.value != null && blanketRevealedOpponentBanB.value != null,
)
const blanketSelfBansRevealed = computed(() => blanketRevealedSelfBanA.value != null && blanketRevealedSelfBanB.value != null)
const blanketInOpponentBanPhase = computed(() => blanketDraftComplete.value && !blanketOpponentBansRevealed.value)
const blanketInSelfBanPhase = computed(
  () => blanketDraftComplete.value && blanketOpponentBansRevealed.value && !blanketSelfBansRevealed.value,
)
const blanketIsComplete = computed(() => blanketDraftComplete.value && blanketSelfBansRevealed.value)

const blanketSelectableForA = computed(() => {
  const selectedSet = new Set(blanketRoundSelectionsA.value)
  return blanketRemainingHeroes.value.filter((hero) => !selectedSet.has(hero.id))
})
const blanketSelectableForB = computed(() => {
  const selectedSet = new Set(blanketRoundSelectionsB.value)
  return blanketRemainingHeroes.value.filter((hero) => !selectedSet.has(hero.id))
})

const blanketCanRevealRound = computed(() => {
  if (blanketDraftComplete.value) {
    return false
  }

  return (
    blanketRoundSelectionsA.value.length === blanketNeededA.value &&
    blanketRoundSelectionsB.value.length === blanketNeededB.value
  )
})

const blanketRoundNumber = computed(() => blanketRoundHistory.value.length + 1)

const addBlanketSelection = (player: DraftPlayer, heroId: number) => {
  if (blanketDraftComplete.value) {
    return
  }

  if (!blanketRemainingHeroes.value.some((hero) => hero.id === heroId)) {
    return
  }

  if (player === 'A') {
    if (blanketRoundSelectionsA.value.includes(heroId) || blanketRoundSelectionsA.value.length >= blanketNeededA.value) {
      return
    }
    blanketRoundSelectionsA.value = [...blanketRoundSelectionsA.value, heroId]
    return
  }

  if (blanketRoundSelectionsB.value.includes(heroId) || blanketRoundSelectionsB.value.length >= blanketNeededB.value) {
    return
  }
  blanketRoundSelectionsB.value = [...blanketRoundSelectionsB.value, heroId]
}

const removeBlanketSelection = (player: DraftPlayer, heroId: number) => {
  if (player === 'A') {
    blanketRoundSelectionsA.value = blanketRoundSelectionsA.value.filter((id) => id !== heroId)
    return
  }

  blanketRoundSelectionsB.value = blanketRoundSelectionsB.value.filter((id) => id !== heroId)
}

const revealBlanketRound = () => {
  if (!blanketCanRevealRound.value) {
    return
  }

  if (blanketRoundHistory.value.length === 0) {
    blanketTargetRosterSize.value = blanketFirstRoundPickCount.value
  }

  const picksA = new Set(blanketRoundSelectionsA.value)
  const picksB = new Set(blanketRoundSelectionsB.value)

  const mirrorIds = [...picksA].filter((id) => picksB.has(id))
  const lockAIds = [...picksA].filter((id) => !picksB.has(id))
  const lockBIds = [...picksB].filter((id) => !picksA.has(id))

  blanketLockedAIds.value = [...new Set([...blanketLockedAIds.value, ...lockAIds])]
  blanketLockedBIds.value = [...new Set([...blanketLockedBIds.value, ...lockBIds])]
  blanketEliminatedIds.value = [...new Set([...blanketEliminatedIds.value, ...mirrorIds])]

  blanketRoundHistory.value = [
    ...blanketRoundHistory.value,
    {
      round: blanketRoundNumber.value,
      mirrors: mirrorIds.map((id) => heroById.value.get(id)?.name ?? String(id)),
      lockedA: lockAIds.map((id) => heroById.value.get(id)?.name ?? String(id)),
      lockedB: lockBIds.map((id) => heroById.value.get(id)?.name ?? String(id)),
    },
  ]

  blanketRoundSelectionsA.value = []
  blanketRoundSelectionsB.value = []
}

const resetBlanketRoundSelections = () => {
  blanketRoundSelectionsA.value = []
  blanketRoundSelectionsB.value = []
}

const resetBlanketDraft = () => {
  blanketLockedAIds.value = []
  blanketLockedBIds.value = []
  blanketEliminatedIds.value = []
  blanketRoundSelectionsA.value = []
  blanketRoundSelectionsB.value = []
  blanketRoundHistory.value = []
  blanketPendingOpponentBanA.value = null
  blanketPendingOpponentBanB.value = null
  blanketRevealedOpponentBanA.value = null
  blanketRevealedOpponentBanB.value = null
  blanketPendingSelfBanA.value = null
  blanketPendingSelfBanB.value = null
  blanketRevealedSelfBanA.value = null
  blanketRevealedSelfBanB.value = null
  blanketTargetRosterSize.value = null
}

const blanketPickRecommendationsA = computed(() =>
  buildPickRecommendationBundle(
    blanketSelectableForA.value.map((hero) => hero.name),
    blanketLockedBNames.value,
    matchVictoryCondition.value,
  ),
)
const blanketPickRecommendationsB = computed(() =>
  buildPickRecommendationBundle(
    blanketSelectableForB.value.map((hero) => hero.name),
    blanketLockedANames.value,
    matchVictoryCondition.value,
  ),
)

const forecastOpponentNextPicks = (
  candidateHeroNames: string[],
  targetLockedRosterHeroNames: string[],
  pickCount: number,
): string[] => {
  if (pickCount <= 0 || targetLockedRosterHeroNames.length === 0 || candidateHeroNames.length === 0) {
    return []
  }

  return buildCounterCandidates(candidateHeroNames, targetLockedRosterHeroNames, matchupMatrix.value)
    .slice(0, pickCount)
    .map((entry) => entry.heroName)
}

const blanketCanShowForecastRecommendations = computed(
  () =>
    !blanketDraftComplete.value &&
    blanketLockedANames.value.length > 0 &&
    blanketLockedBNames.value.length > 0,
)

const blanketPredictedPicksForA = computed(() =>
  forecastOpponentNextPicks(
    blanketRemainingHeroes.value.map((hero) => hero.name),
    blanketLockedANames.value,
    blanketNeededB.value,
  ),
)

const blanketPredictedPicksForB = computed(() =>
  forecastOpponentNextPicks(
    blanketRemainingHeroes.value.map((hero) => hero.name),
    blanketLockedBNames.value,
    blanketNeededA.value,
  ),
)

const blanketForecastCounterRecommendationsA = computed<ForecastRecommendationRow[]>(() => {
  if (!blanketCanShowForecastRecommendations.value) {
    return []
  }

  const forecastRoster = [...new Set([...blanketLockedBNames.value, ...blanketPredictedPicksForA.value])]
  const counterSearch = findBestCounterCandidates(
    blanketSelectableForA.value.map((hero) => hero.name),
    forecastRoster,
    matchupMatrix.value,
  )
  return (counterSearch?.candidates ?? []).slice(0, 8)
})

const blanketForecastCounterRecommendationsB = computed<ForecastRecommendationRow[]>(() => {
  if (!blanketCanShowForecastRecommendations.value) {
    return []
  }

  const forecastRoster = [...new Set([...blanketLockedANames.value, ...blanketPredictedPicksForB.value])]
  const counterSearch = findBestCounterCandidates(
    blanketSelectableForB.value.map((hero) => hero.name),
    forecastRoster,
    matchupMatrix.value,
  )
  return (counterSearch?.candidates ?? []).slice(0, 8)
})

const blanketMirrorDenyRecommendationsForA = computed(() => {
  const selectable = new Set(blanketSelectableForA.value.map((hero) => hero.name))
  return blanketPredictedPicksForA.value.filter((heroName) => selectable.has(heroName))
})

const blanketMirrorDenyRecommendationsForB = computed(() => {
  const selectable = new Set(blanketSelectableForB.value.map((hero) => hero.name))
  return blanketPredictedPicksForB.value.filter((heroName) => selectable.has(heroName))
})

const blanketRosterAAfterOpponentBans = computed(() =>
  blanketLockedA.value.filter((hero) => hero.id !== blanketRevealedOpponentBanB.value),
)
const blanketRosterBAfterOpponentBans = computed(() =>
  blanketLockedB.value.filter((hero) => hero.id !== blanketRevealedOpponentBanA.value),
)

const blanketRosterAAfterBans = computed(() =>
  blanketRosterAAfterOpponentBans.value.filter((hero) => hero.id !== blanketRevealedSelfBanA.value),
)
const blanketRosterBAfterBans = computed(() =>
  blanketRosterBAfterOpponentBans.value.filter((hero) => hero.id !== blanketRevealedSelfBanB.value),
)

const blanketRosterANamesAfterOpponentBans = computed(() =>
  blanketRosterAAfterOpponentBans.value.map((hero) => hero.name),
)
const blanketRosterBNamesAfterOpponentBans = computed(() =>
  blanketRosterBAfterOpponentBans.value.map((hero) => hero.name),
)
const blanketRosterANamesAfterBans = computed(() => blanketRosterAAfterBans.value.map((hero) => hero.name))
const blanketRosterBNamesAfterBans = computed(() => blanketRosterBAfterBans.value.map((hero) => hero.name))

const blanketOpponentBanSelectableForA = computed(() => blanketLockedB.value)
const blanketOpponentBanSelectableForB = computed(() => blanketLockedA.value)
const blanketSelfBanSelectableForA = computed(() => blanketRosterAAfterOpponentBans.value)
const blanketSelfBanSelectableForB = computed(() => blanketRosterBAfterOpponentBans.value)

const blanketBanRecommendationsA = computed<BanRecommendationRow[]>(() =>
  buildOpponentBanRecommendations(blanketLockedANames.value, blanketLockedBNames.value),
)
const blanketBanRecommendationsB = computed<BanRecommendationRow[]>(() =>
  buildOpponentBanRecommendations(blanketLockedBNames.value, blanketLockedANames.value),
)

const blanketSelfBanRecommendationsA = computed<BanRecommendationRow[]>(() =>
  buildWeakLinkRows(
    blanketRosterANamesAfterOpponentBans.value,
    blanketRosterBNamesAfterOpponentBans.value,
    matchupMatrix.value,
  ),
)
const blanketSelfBanRecommendationsB = computed<BanRecommendationRow[]>(() =>
  buildWeakLinkRows(
    blanketRosterBNamesAfterOpponentBans.value,
    blanketRosterANamesAfterOpponentBans.value,
    matchupMatrix.value,
  ),
)

const blanketSuggestedBanA = computed(() => blanketBanRecommendationsA.value[0]?.heroName ?? null)
const blanketSuggestedBanB = computed(() => blanketBanRecommendationsB.value[0]?.heroName ?? null)
const blanketSuggestedSelfBanA = computed(() => blanketSelfBanRecommendationsA.value[0]?.heroName ?? null)
const blanketSuggestedSelfBanB = computed(() => blanketSelfBanRecommendationsB.value[0]?.heroName ?? null)

const setBlanketOpponentBanSelection = (player: DraftPlayer, heroId: number) => {
  if (!blanketInOpponentBanPhase.value) {
    return
  }

  if (player === 'A') {
    if (!blanketOpponentBanSelectableForA.value.some((hero) => hero.id === heroId)) {
      return
    }
    blanketPendingOpponentBanA.value = heroId
    return
  }

  if (!blanketOpponentBanSelectableForB.value.some((hero) => hero.id === heroId)) {
    return
  }
  blanketPendingOpponentBanB.value = heroId
}

const revealBlanketOpponentBans = () => {
  if (!blanketInOpponentBanPhase.value) {
    return
  }
  if (blanketPendingOpponentBanA.value == null || blanketPendingOpponentBanB.value == null) {
    return
  }
  blanketRevealedOpponentBanA.value = blanketPendingOpponentBanA.value
  blanketRevealedOpponentBanB.value = blanketPendingOpponentBanB.value
}

const setBlanketSelfBanSelection = (player: DraftPlayer, heroId: number) => {
  if (!blanketInSelfBanPhase.value) {
    return
  }

  if (player === 'A') {
    if (!blanketSelfBanSelectableForA.value.some((hero) => hero.id === heroId)) {
      return
    }
    blanketPendingSelfBanA.value = heroId
    return
  }

  if (!blanketSelfBanSelectableForB.value.some((hero) => hero.id === heroId)) {
    return
  }
  blanketPendingSelfBanB.value = heroId
}

const revealBlanketSelfBans = () => {
  if (!blanketInSelfBanPhase.value) {
    return
  }
  if (blanketPendingSelfBanA.value == null || blanketPendingSelfBanB.value == null) {
    return
  }
  blanketRevealedSelfBanA.value = blanketPendingSelfBanA.value
  blanketRevealedSelfBanB.value = blanketPendingSelfBanB.value
}

const blanketBannedByAName = computed(() => {
  return blanketRevealedOpponentBanA.value != null
    ? heroById.value.get(blanketRevealedOpponentBanA.value)?.name ?? 'none'
    : 'none'
})
const blanketBannedByBName = computed(() => {
  return blanketRevealedOpponentBanB.value != null
    ? heroById.value.get(blanketRevealedOpponentBanB.value)?.name ?? 'none'
    : 'none'
})
const blanketSelfBannedByAName = computed(() => {
  return blanketRevealedSelfBanA.value != null ? heroById.value.get(blanketRevealedSelfBanA.value)?.name ?? 'none' : 'none'
})
const blanketSelfBannedByBName = computed(() => {
  return blanketRevealedSelfBanB.value != null ? heroById.value.get(blanketRevealedSelfBanB.value)?.name ?? 'none' : 'none'
})

const blanketRosterASummary = computed(() =>
  summarizeRoster(blanketRosterANamesAfterBans.value, heroStatsDictionary.value),
)
const blanketRosterBSummary = computed(() =>
  summarizeRoster(blanketRosterBNamesAfterBans.value, heroStatsDictionary.value),
)

const blanketComparison = computed(() => ({
  winRateDiff: Number(
    (blanketRosterASummary.value.averageWinRate - blanketRosterBSummary.value.averageWinRate).toFixed(1),
  ),
  pickRateDiff: Number(
    (blanketRosterASummary.value.averagePickRate - blanketRosterBSummary.value.averagePickRate).toFixed(1),
  ),
}))

const blanketMostThreateningToA = computed(() =>
  getMostThreateningHero(
    blanketRosterBNamesAfterBans.value,
    blanketRosterANamesAfterBans.value,
    matchupMatrix.value,
  ),
)
const blanketMostThreateningToB = computed(() =>
  getMostThreateningHero(
    blanketRosterANamesAfterBans.value,
    blanketRosterBNamesAfterBans.value,
    matchupMatrix.value,
  ),
)

watch(banquestRosterSize, () => {
  resetBanquestDraft()
})

watch(
  sourceHeroes,
  (heroes) => {
    const allowedIds = new Set(heroes.map((hero) => hero.id))
    banquestRecords.value = banquestRecords.value.filter((record) => allowedIds.has(record.heroId))

    blanketLockedAIds.value = blanketLockedAIds.value.filter((id) => allowedIds.has(id))
    blanketLockedBIds.value = blanketLockedBIds.value.filter((id) => allowedIds.has(id))
    blanketEliminatedIds.value = blanketEliminatedIds.value.filter((id) => allowedIds.has(id))
    blanketRoundSelectionsA.value = blanketRoundSelectionsA.value.filter((id) => allowedIds.has(id))
    blanketRoundSelectionsB.value = blanketRoundSelectionsB.value.filter((id) => allowedIds.has(id))
    if (banquestPendingOpponentBanA.value != null && !allowedIds.has(banquestPendingOpponentBanA.value)) {
      banquestPendingOpponentBanA.value = null
    }
    if (banquestPendingOpponentBanB.value != null && !allowedIds.has(banquestPendingOpponentBanB.value)) {
      banquestPendingOpponentBanB.value = null
    }
    if (banquestRevealedOpponentBanA.value != null && !allowedIds.has(banquestRevealedOpponentBanA.value)) {
      banquestRevealedOpponentBanA.value = null
    }
    if (banquestRevealedOpponentBanB.value != null && !allowedIds.has(banquestRevealedOpponentBanB.value)) {
      banquestRevealedOpponentBanB.value = null
    }
    if (banquestPendingSelfBanA.value != null && !allowedIds.has(banquestPendingSelfBanA.value)) {
      banquestPendingSelfBanA.value = null
    }
    if (banquestPendingSelfBanB.value != null && !allowedIds.has(banquestPendingSelfBanB.value)) {
      banquestPendingSelfBanB.value = null
    }
    if (banquestRevealedSelfBanA.value != null && !allowedIds.has(banquestRevealedSelfBanA.value)) {
      banquestRevealedSelfBanA.value = null
    }
    if (banquestRevealedSelfBanB.value != null && !allowedIds.has(banquestRevealedSelfBanB.value)) {
      banquestRevealedSelfBanB.value = null
    }
    if (blanketPendingOpponentBanA.value != null && !allowedIds.has(blanketPendingOpponentBanA.value)) {
      blanketPendingOpponentBanA.value = null
    }
    if (blanketPendingOpponentBanB.value != null && !allowedIds.has(blanketPendingOpponentBanB.value)) {
      blanketPendingOpponentBanB.value = null
    }
    if (blanketRevealedOpponentBanA.value != null && !allowedIds.has(blanketRevealedOpponentBanA.value)) {
      blanketRevealedOpponentBanA.value = null
    }
    if (blanketRevealedOpponentBanB.value != null && !allowedIds.has(blanketRevealedOpponentBanB.value)) {
      blanketRevealedOpponentBanB.value = null
    }
    if (blanketPendingSelfBanA.value != null && !allowedIds.has(blanketPendingSelfBanA.value)) {
      blanketPendingSelfBanA.value = null
    }
    if (blanketPendingSelfBanB.value != null && !allowedIds.has(blanketPendingSelfBanB.value)) {
      blanketPendingSelfBanB.value = null
    }
    if (blanketRevealedSelfBanA.value != null && !allowedIds.has(blanketRevealedSelfBanA.value)) {
      blanketRevealedSelfBanA.value = null
    }
    if (blanketRevealedSelfBanB.value != null && !allowedIds.has(blanketRevealedSelfBanB.value)) {
      blanketRevealedSelfBanB.value = null
    }

    const nextMaxInitial = Math.min(8, Math.max(2, heroes.length))
    if (blanketFirstRoundPickCount.value > nextMaxInitial) {
      blanketFirstRoundPickCount.value = nextMaxInitial
    }
    if (blanketFirstRoundPickCount.value < 2) {
      blanketFirstRoundPickCount.value = 2
    }
    if (blanketTargetRosterSize.value != null) {
      blanketTargetRosterSize.value = Math.max(2, Math.min(blanketTargetRosterSize.value, nextMaxInitial))
    }
  },
  { immediate: true },
)
</script>

<template>
  <main class="draft-page">
    <h1>Draft Assistant</h1>
    <p v-if="loading">Loading hero statistics...</p>

    <template v-else>
      <section>
        <h2>Draft Flow</h2>
        <div class="controls-row">
          <label>
            <span>Type</span>
            <select v-model="draftType">
              <option value="banquest">Banquest</option>
              <option value="blanket">Blanket (arsenal)</option>
            </select>
          </label>
          <label>
            <span>Match victory condition</span>
            <select v-model="matchVictoryCondition">
              <option value="most-games">Win most games</option>
              <option value="all-heroes">Win with all heroes in roster</option>
            </select>
          </label>
        </div>
        <div class="helper-text">
          <template v-if="matchVictoryCondition === 'most-games'">
            Each game assigns a hero from the roster. Once used, that hero cannot be used in later games.
          </template>
          <template v-else>
            Both players can pick any hero for game 1. After a win, the winning hero is locked out for that player,
            while the losing hero can be used again. To win the match, a player must win with every hero in their roster.
          </template>
        </div>
      </section>

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

      <template v-if="draftType === 'banquest'">
        <section>
          <h2>Draft Type</h2>
          <p>
            Current mode: <strong>Banquest</strong>. The leader (Player A) opens with 1 pick, the follower (Player B)
            picks 2, then they alternate picking 2 until both reach the roster size. The leader closes with the last
            single pick, followed by simultaneous opponent bans and self-bans.
          </p>
          <div class="controls-row">
            <label>
              <span>Roster size (leader and follower)</span>
              <select v-model.number="banquestRosterSize">
                <option :value="2">2v2</option>
                <option :value="4">4v4</option>
                <option :value="6">6v6</option>
                <option :value="8">8v8</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2>Draft Progress</h2>
          <p>{{ banquestTurnTitle }}</p>
          <div class="actions">
            <button type="button" :disabled="banquestRecords.length === 0 || banquestPicksComplete" @click="undoLastBanquestAction">
              Undo Last Action
            </button>
            <button type="button" :disabled="banquestRecords.length === 0" @click="resetBanquestDraft">
              Reset Draft
            </button>
          </div>
        </section>

        <section v-if="!banquestPicksComplete">
          <h2>Make Pick</h2>
          <HeroSearchSelect
            :options="banquestPickSelectableHeroes"
            button-label="Lock Pick"
            empty-text="No heroes available"
            @select="makeBanquestAction"
          />
        </section>

        <section>
          <template v-if="!banquestPicksComplete">
            <h2>Recommended Picks</h2>
            <p>{{ banquestPickRecommendationBundle.explanation }}</p>
            <p v-if="banquestPickRecommendationBundle.rows.length === 0">
              No recommendations available for the current state.
            </p>
            <ul v-else>
              <li v-for="entry in banquestPickRecommendationBundle.rows" :key="entry.heroName">
                <strong>{{ entry.heroName }}</strong>: {{ entry.losingMatchupsInPool }} losing,
                {{ entry.winningMatchupsInPool }} winning matchups in remaining pool
                <span v-if="entry.counterWinningMatchups > 0">
                  ; counters opponent core with {{ entry.counterWinningMatchups }} winning matchup{{
                    entry.counterWinningMatchups === 1 ? '' : 's'
                  }}
                  ({{ entry.counterAverageWinRate.toFixed(1) }}% avg)
                </span>
                <span v-if="matchVictoryCondition === 'all-heroes' && entry.bestOpponent && entry.bestOpponentWinRate != null">
                  ; best into {{ entry.bestOpponent }} ({{ entry.bestOpponentWinRate.toFixed(1) }}%)
                </span>
              </li>
            </ul>
          </template>

          <template v-else-if="banquestInOpponentBanPhase">
            <h2>Simultaneous Opponent Ban</h2>
            <p>Both players select one opponent hero secretly, then reveal at the same time.</p>
            <div class="roster-grid">
              <article>
                <h3>Player A Ban Recommendation</h3>
                <p v-if="banquestSuggestedBanA">Suggested ban: <strong>{{ banquestSuggestedBanA }}</strong></p>
                <ul>
                  <li v-for="entry in banquestBanRecommendationsA.slice(0, 8)" :key="`ban-a-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg into A,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="banquestOpponentBanSelectableForA"
                  button-label="Set Hidden Ban For A"
                  empty-text="No heroes available"
                  @select="(heroId) => setBanquestOpponentBanSelection('A', heroId)"
                />
                <p>Hidden selection: {{ banquestPendingOpponentBanA != null ? heroById.get(banquestPendingOpponentBanA)?.name : 'not selected' }}</p>
              </article>
              <article>
                <h3>Player B Ban Recommendation</h3>
                <p v-if="banquestSuggestedBanB">Suggested ban: <strong>{{ banquestSuggestedBanB }}</strong></p>
                <ul>
                  <li v-for="entry in banquestBanRecommendationsB.slice(0, 8)" :key="`ban-b-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg into B,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="banquestOpponentBanSelectableForB"
                  button-label="Set Hidden Ban For B"
                  empty-text="No heroes available"
                  @select="(heroId) => setBanquestOpponentBanSelection('B', heroId)"
                />
                <p>Hidden selection: {{ banquestPendingOpponentBanB != null ? heroById.get(banquestPendingOpponentBanB)?.name : 'not selected' }}</p>
              </article>
            </div>
            <div class="actions">
              <button
                type="button"
                :disabled="banquestPendingOpponentBanA == null || banquestPendingOpponentBanB == null"
                @click="revealBanquestOpponentBans"
              >
                Reveal Opponent Bans
              </button>
            </div>
          </template>

          <template v-else-if="banquestInSelfBanPhase">
            <h2>Simultaneous Self-Ban</h2>
            <p>Both players select one hero from their own roster secretly, then reveal at the same time.</p>
            <div class="roster-grid">
              <article>
                <h3>Player A Self-Ban Recommendation</h3>
                <p v-if="banquestSuggestedSelfBanA">Suggested self-ban: <strong>{{ banquestSuggestedSelfBanA }}</strong></p>
                <ul>
                  <li v-for="entry in banquestSelfBanRecommendationsA.slice(0, 8)" :key="`self-ban-a-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% average win rate,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="banquestSelfBanSelectableForA"
                  button-label="Set Hidden Self-Ban For A"
                  empty-text="No heroes available"
                  @select="(heroId) => setBanquestSelfBanSelection('A', heroId)"
                />
                <p>Hidden selection: {{ banquestPendingSelfBanA != null ? heroById.get(banquestPendingSelfBanA)?.name : 'not selected' }}</p>
              </article>
              <article>
                <h3>Player B Self-Ban Recommendation</h3>
                <p v-if="banquestSuggestedSelfBanB">Suggested self-ban: <strong>{{ banquestSuggestedSelfBanB }}</strong></p>
                <ul>
                  <li v-for="entry in banquestSelfBanRecommendationsB.slice(0, 8)" :key="`self-ban-b-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% average win rate,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="banquestSelfBanSelectableForB"
                  button-label="Set Hidden Self-Ban For B"
                  empty-text="No heroes available"
                  @select="(heroId) => setBanquestSelfBanSelection('B', heroId)"
                />
                <p>Hidden selection: {{ banquestPendingSelfBanB != null ? heroById.get(banquestPendingSelfBanB)?.name : 'not selected' }}</p>
              </article>
            </div>
            <div class="actions">
              <button
                type="button"
                :disabled="banquestPendingSelfBanA == null || banquestPendingSelfBanB == null"
                @click="revealBanquestSelfBans"
              >
                Reveal Self-Bans
              </button>
            </div>
          </template>
        </section>

        <section class="roster-grid">
          <article>
            <h2>Leader (Player A) Roster ({{ banquestRosterA.length }})</h2>
            <ul>
              <li v-if="banquestRosterA.length === 0">No picks yet.</li>
              <li v-for="hero in banquestRosterA" :key="`a-${hero.id}`">{{ hero.name }}</li>
            </ul>
          </article>

          <article>
            <h2>Follower (Player B) Roster ({{ banquestRosterB.length }})</h2>
            <ul>
              <li v-if="banquestRosterB.length === 0">No picks yet.</li>
              <li v-for="hero in banquestRosterB" :key="`b-${hero.id}`">{{ hero.name }}</li>
            </ul>
          </article>
        </section>

        <section v-if="banquestIsComplete">
          <h2>Ban Results</h2>
          <p>Leader opponent-banned: <strong>{{ banquestBannedByAName }}</strong></p>
          <p>Follower opponent-banned: <strong>{{ banquestBannedByBName }}</strong></p>
          <p>Leader self-banned: <strong>{{ banquestSelfBannedByAName }}</strong></p>
          <p>Follower self-banned: <strong>{{ banquestSelfBannedByBName }}</strong></p>
        </section>

        <section v-if="banquestIsComplete" class="summary-grid">
          <article>
            <h2>Leader Summary (After Bans)</h2>
            <p>Heroes: {{ banquestRosterASummary.heroCount }}</p>
            <p>Average Win Rate: {{ banquestRosterASummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ banquestRosterASummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ banquestRosterASummary.totalGamesPlayed }}</p>
          </article>

          <article>
            <h2>Follower Summary (After Bans)</h2>
            <p>Heroes: {{ banquestRosterBSummary.heroCount }}</p>
            <p>Average Win Rate: {{ banquestRosterBSummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ banquestRosterBSummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ banquestRosterBSummary.totalGamesPlayed }}</p>
          </article>
        </section>

        <section v-if="banquestIsComplete">
          <h2>Roster vs Roster Outcome (After Bans)</h2>
          <p>Win Rate Difference (A - B): {{ banquestComparison.winRateDiff }}%</p>
          <p>Pick Rate Difference (A - B): {{ banquestComparison.pickRateDiff }}%</p>
          <p v-if="banquestMostThreateningToA">
            Most threatening hero into Leader: {{ banquestMostThreateningToA.heroName }}
            ({{ banquestMostThreateningToA.averageWinRate.toFixed(1) }}% avg)
          </p>
          <p v-if="banquestMostThreateningToB">
            Most threatening hero into Follower: {{ banquestMostThreateningToB.heroName }}
            ({{ banquestMostThreateningToB.averageWinRate.toFixed(1) }}% avg)
          </p>
        </section>

        <section v-if="banquestIsComplete">
          <h2>Matchup Crosstable (After Bans)</h2>
          <div class="table-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Player A \\ Player B</th>
                  <th v-for="hero in banquestRosterBAfterBans" :key="`head-b-${hero.id}`">{{ hero.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="heroA in banquestRosterAAfterBans" :key="`row-a-${heroA.id}`">
                  <th>{{ heroA.name }}</th>
                  <td
                    v-for="heroB in banquestRosterBAfterBans"
                    :key="`cell-${heroA.id}-${heroB.id}`"
                    :class="getMatchupCellClass(getMatchupWinRate(heroA.name, heroB.name))"
                  >
                    {{ formatWinRate(getMatchupWinRate(heroA.name, heroB.name)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <template v-else>
        <section>
          <h2>Draft Type</h2>
          <p>
            Current mode: <strong>Blanket</strong>. Players secretly choose heroes each round, mirror picks are
            eliminated, unique picks are locked. The number of secret picks per player in round 1 defines the roster
            size target for both players. Then opponent-ban and self-ban phases are applied.
          </p>
        </section>

        <section>
          <h2>Blanket Round {{ blanketRoundNumber }}</h2>
          <div class="controls-row">
            <label>
              <span>Round 1 picks per player (defines roster size)</span>
              <select v-model.number="blanketFirstRoundPickCount" :disabled="!blanketCanConfigureFirstRound">
                <option v-for="count in blanketInitialPickOptions" :key="`blanket-size-${count}`" :value="count">
                  {{ count }}
                </option>
              </select>
            </label>
          </div>
          <p>Target roster size: {{ blanketConfiguredRosterSize }} heroes per player.</p>
          <p v-if="blanketDraftComplete">Draft rounds complete. Proceed with bans below.</p>
          <p v-else>
            Needed picks this round: Player A {{ blanketNeededA }}, Player B {{ blanketNeededB }}.
          </p>
          <div class="actions">
            <button type="button" :disabled="blanketDraftComplete || !blanketCanRevealRound" @click="revealBlanketRound">
              Reveal Round
            </button>
            <button
              type="button"
              :disabled="blanketDraftComplete || (blanketRoundSelectionsA.length === 0 && blanketRoundSelectionsB.length === 0)"
              @click="resetBlanketRoundSelections"
            >
              Reset Round Selections
            </button>
            <button type="button" @click="resetBlanketDraft">Reset Blanket Draft</button>
          </div>
        </section>

        <section class="roster-grid" v-if="!blanketDraftComplete">
          <article>
            <h2>Player A Secret Picks</h2>
            <HeroSearchSelect
              :options="blanketSelectableForA"
              button-label="Select For A"
              empty-text="No heroes available"
              @select="(heroId) => addBlanketSelection('A', heroId)"
            />
            <ul>
              <li v-if="blanketRoundSelectionsA.length === 0">No picks selected yet.</li>
              <li v-for="heroId in blanketRoundSelectionsA" :key="`sa-${heroId}`">
                <span>{{ heroById.get(heroId)?.name ?? heroId }}</span>
                <button type="button" @click="removeBlanketSelection('A', heroId)">Remove</button>
              </li>
            </ul>
          </article>

          <article>
            <h2>Player B Secret Picks</h2>
            <HeroSearchSelect
              :options="blanketSelectableForB"
              button-label="Select For B"
              empty-text="No heroes available"
              @select="(heroId) => addBlanketSelection('B', heroId)"
            />
            <ul>
              <li v-if="blanketRoundSelectionsB.length === 0">No picks selected yet.</li>
              <li v-for="heroId in blanketRoundSelectionsB" :key="`sb-${heroId}`">
                <span>{{ heroById.get(heroId)?.name ?? heroId }}</span>
                <button type="button" @click="removeBlanketSelection('B', heroId)">Remove</button>
              </li>
            </ul>
          </article>
        </section>

        <section class="roster-grid" v-if="!blanketDraftComplete">
          <article>
            <h2>Recommendations For Player A</h2>
            <p>{{ blanketPickRecommendationsA.explanation }}</p>
            <ul>
              <li v-for="entry in blanketPickRecommendationsA.rows" :key="`ra-${entry.heroName}`">
                <strong>{{ entry.heroName }}</strong>: {{ entry.losingMatchupsInPool }} losing,
                {{ entry.winningMatchupsInPool }} winning in remaining pool
                <span v-if="entry.counterWinningMatchups > 0">
                  ; counters B locked roster with {{ entry.counterWinningMatchups }} winning matchup{{
                    entry.counterWinningMatchups === 1 ? '' : 's'
                  }}
                  ({{ entry.counterAverageWinRate.toFixed(1) }}% avg)
                </span>
                <span v-if="matchVictoryCondition === 'all-heroes' && entry.bestOpponent && entry.bestOpponentWinRate != null">
                  ; best into {{ entry.bestOpponent }} ({{ entry.bestOpponentWinRate.toFixed(1) }}%)
                </span>
              </li>
            </ul>
            <template v-if="blanketCanShowForecastRecommendations">
              <h3>Forecast-Based Suggestions</h3>
              <p>
                Predicted follower picks:
                <strong>{{ blanketPredictedPicksForA.length > 0 ? blanketPredictedPicksForA.join(', ') : 'none' }}</strong>
              </p>
              <p>Counter picks vs locked + predicted follower roster:</p>
              <ul>
                <li v-if="blanketForecastCounterRecommendationsA.length === 0">No forecast counter suggestions found.</li>
                <li v-for="entry in blanketForecastCounterRecommendationsA" :key="`forecast-a-${entry.heroName}`">
                  <strong>{{ entry.heroName }}</strong>: {{ entry.winningMatchups }} winning matchups,
                  {{ entry.averageWinRate.toFixed(1) }}% avg win rate
                </li>
              </ul>
              <p>
                Mirror-deny options:
                <strong>{{
                  blanketMirrorDenyRecommendationsForA.length > 0
                    ? blanketMirrorDenyRecommendationsForA.join(', ')
                    : 'none'
                }}</strong>
              </p>
            </template>
          </article>

          <article>
            <h2>Recommendations For Player B</h2>
            <p>{{ blanketPickRecommendationsB.explanation }}</p>
            <ul>
              <li v-for="entry in blanketPickRecommendationsB.rows" :key="`rb-${entry.heroName}`">
                <strong>{{ entry.heroName }}</strong>: {{ entry.losingMatchupsInPool }} losing,
                {{ entry.winningMatchupsInPool }} winning in remaining pool
                <span v-if="entry.counterWinningMatchups > 0">
                  ; counters A locked roster with {{ entry.counterWinningMatchups }} winning matchup{{
                    entry.counterWinningMatchups === 1 ? '' : 's'
                  }}
                  ({{ entry.counterAverageWinRate.toFixed(1) }}% avg)
                </span>
                <span v-if="matchVictoryCondition === 'all-heroes' && entry.bestOpponent && entry.bestOpponentWinRate != null">
                  ; best into {{ entry.bestOpponent }} ({{ entry.bestOpponentWinRate.toFixed(1) }}%)
                </span>
              </li>
            </ul>
            <template v-if="blanketCanShowForecastRecommendations">
              <h3>Forecast-Based Suggestions</h3>
              <p>
                Predicted leader picks:
                <strong>{{ blanketPredictedPicksForB.length > 0 ? blanketPredictedPicksForB.join(', ') : 'none' }}</strong>
              </p>
              <p>Counter picks vs locked + predicted leader roster:</p>
              <ul>
                <li v-if="blanketForecastCounterRecommendationsB.length === 0">No forecast counter suggestions found.</li>
                <li v-for="entry in blanketForecastCounterRecommendationsB" :key="`forecast-b-${entry.heroName}`">
                  <strong>{{ entry.heroName }}</strong>: {{ entry.winningMatchups }} winning matchups,
                  {{ entry.averageWinRate.toFixed(1) }}% avg win rate
                </li>
              </ul>
              <p>
                Mirror-deny options:
                <strong>{{
                  blanketMirrorDenyRecommendationsForB.length > 0
                    ? blanketMirrorDenyRecommendationsForB.join(', ')
                    : 'none'
                }}</strong>
              </p>
            </template>
          </article>
        </section>

        <section v-if="blanketRoundHistory.length > 0">
          <h2>Round History</h2>
          <ul>
            <li v-for="round in blanketRoundHistory" :key="`round-${round.round}`">
              Round {{ round.round }}:
              mirrors eliminated {{ round.mirrors.length > 0 ? round.mirrors.join(', ') : 'none' }};
              A locked {{ round.lockedA.length > 0 ? round.lockedA.join(', ') : 'none' }};
              B locked {{ round.lockedB.length > 0 ? round.lockedB.join(', ') : 'none' }}.
            </li>
          </ul>
        </section>

        <section class="roster-grid">
          <article>
            <h2>Player A Locked Roster ({{ blanketLockedA.length }}/{{ blanketConfiguredRosterSize }})</h2>
            <ul>
              <li v-if="blanketLockedA.length === 0">No locked heroes yet.</li>
              <li v-for="hero in blanketLockedA" :key="`la-${hero.id}`">{{ hero.name }}</li>
            </ul>
          </article>

          <article>
            <h2>Player B Locked Roster ({{ blanketLockedB.length }}/{{ blanketConfiguredRosterSize }})</h2>
            <ul>
              <li v-if="blanketLockedB.length === 0">No locked heroes yet.</li>
              <li v-for="hero in blanketLockedB" :key="`lb-${hero.id}`">{{ hero.name }}</li>
            </ul>
          </article>
        </section>

        <section v-if="blanketInBanPhase">
          <h2>Blanket Ban Phase</h2>
          <template v-if="blanketInOpponentBanPhase">
            <p>Both players select one opponent hero secretly, then reveal at the same time.</p>
            <div class="roster-grid">
              <article>
                <h3>Player A Opponent Ban</h3>
                <p v-if="blanketSuggestedBanA">Suggested ban: <strong>{{ blanketSuggestedBanA }}</strong></p>
                <ul>
                  <li v-for="entry in blanketBanRecommendationsA.slice(0, 8)" :key="`bbr-a-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg into A,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="blanketOpponentBanSelectableForA"
                  button-label="Set Hidden Ban For A"
                  empty-text="No heroes available"
                  @select="(heroId) => setBlanketOpponentBanSelection('A', heroId)"
                />
                <p>Hidden selection: {{ blanketPendingOpponentBanA != null ? heroById.get(blanketPendingOpponentBanA)?.name : 'not selected' }}</p>
              </article>
              <article>
                <h3>Player B Opponent Ban</h3>
                <p v-if="blanketSuggestedBanB">Suggested ban: <strong>{{ blanketSuggestedBanB }}</strong></p>
                <ul>
                  <li v-for="entry in blanketBanRecommendationsB.slice(0, 8)" :key="`bbr-b-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg into B,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="blanketOpponentBanSelectableForB"
                  button-label="Set Hidden Ban For B"
                  empty-text="No heroes available"
                  @select="(heroId) => setBlanketOpponentBanSelection('B', heroId)"
                />
                <p>Hidden selection: {{ blanketPendingOpponentBanB != null ? heroById.get(blanketPendingOpponentBanB)?.name : 'not selected' }}</p>
              </article>
            </div>
            <div class="actions">
              <button
                type="button"
                :disabled="blanketPendingOpponentBanA == null || blanketPendingOpponentBanB == null"
                @click="revealBlanketOpponentBans"
              >
                Reveal Opponent Bans
              </button>
            </div>
          </template>

          <template v-else-if="blanketInSelfBanPhase">
            <p>Both players select one hero from their own roster secretly, then reveal at the same time.</p>
            <div class="roster-grid">
              <article>
                <h3>Player A Self-Ban</h3>
                <p v-if="blanketSuggestedSelfBanA">Suggested self-ban: <strong>{{ blanketSuggestedSelfBanA }}</strong></p>
                <ul>
                  <li v-for="entry in blanketSelfBanRecommendationsA.slice(0, 8)" :key="`bsr-a-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="blanketSelfBanSelectableForA"
                  button-label="Set Hidden Self-Ban For A"
                  empty-text="No heroes available"
                  @select="(heroId) => setBlanketSelfBanSelection('A', heroId)"
                />
                <p>Hidden selection: {{ blanketPendingSelfBanA != null ? heroById.get(blanketPendingSelfBanA)?.name : 'not selected' }}</p>
              </article>
              <article>
                <h3>Player B Self-Ban</h3>
                <p v-if="blanketSuggestedSelfBanB">Suggested self-ban: <strong>{{ blanketSuggestedSelfBanB }}</strong></p>
                <ul>
                  <li v-for="entry in blanketSelfBanRecommendationsB.slice(0, 8)" :key="`bsr-b-${entry.heroName}`">
                    <strong>{{ entry.heroName }}</strong>: {{ entry.averageWinRate.toFixed(1) }}% avg,
                    {{ entry.winningMatchups }} winning matchup{{ entry.winningMatchups === 1 ? '' : 's' }}
                  </li>
                </ul>
                <HeroSearchSelect
                  :options="blanketSelfBanSelectableForB"
                  button-label="Set Hidden Self-Ban For B"
                  empty-text="No heroes available"
                  @select="(heroId) => setBlanketSelfBanSelection('B', heroId)"
                />
                <p>Hidden selection: {{ blanketPendingSelfBanB != null ? heroById.get(blanketPendingSelfBanB)?.name : 'not selected' }}</p>
              </article>
            </div>
            <div class="actions">
              <button
                type="button"
                :disabled="blanketPendingSelfBanA == null || blanketPendingSelfBanB == null"
                @click="revealBlanketSelfBans"
              >
                Reveal Self-Bans
              </button>
            </div>
          </template>

          <p v-else>Ban phase complete.</p>
        </section>

        <section v-if="blanketIsComplete">
          <h2>Ban Results</h2>
          <p>Player A opponent-banned: <strong>{{ blanketBannedByAName }}</strong></p>
          <p>Player B opponent-banned: <strong>{{ blanketBannedByBName }}</strong></p>
          <p>Player A self-banned: <strong>{{ blanketSelfBannedByAName }}</strong></p>
          <p>Player B self-banned: <strong>{{ blanketSelfBannedByBName }}</strong></p>
        </section>

        <section v-if="blanketIsComplete" class="summary-grid">
          <article>
            <h2>Player A Summary (After Bans)</h2>
            <p>Heroes: {{ blanketRosterASummary.heroCount }}</p>
            <p>Average Win Rate: {{ blanketRosterASummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ blanketRosterASummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ blanketRosterASummary.totalGamesPlayed }}</p>
          </article>

          <article>
            <h2>Player B Summary (After Bans)</h2>
            <p>Heroes: {{ blanketRosterBSummary.heroCount }}</p>
            <p>Average Win Rate: {{ blanketRosterBSummary.averageWinRate }}%</p>
            <p>Average Pick Rate: {{ blanketRosterBSummary.averagePickRate }}%</p>
            <p>Total Games Logged: {{ blanketRosterBSummary.totalGamesPlayed }}</p>
          </article>
        </section>

        <section v-if="blanketIsComplete">
          <h2>Roster vs Roster Outcome (After Bans)</h2>
          <p>Win Rate Difference (A - B): {{ blanketComparison.winRateDiff }}%</p>
          <p>Pick Rate Difference (A - B): {{ blanketComparison.pickRateDiff }}%</p>
          <p v-if="blanketMostThreateningToA">
            Most threatening hero into Player A: {{ blanketMostThreateningToA.heroName }}
            ({{ blanketMostThreateningToA.averageWinRate.toFixed(1) }}% avg)
          </p>
          <p v-if="blanketMostThreateningToB">
            Most threatening hero into Player B: {{ blanketMostThreateningToB.heroName }}
            ({{ blanketMostThreateningToB.averageWinRate.toFixed(1) }}% avg)
          </p>
        </section>

        <section v-if="blanketIsComplete">
          <h2>Matchup Crosstable (After Bans)</h2>
          <div class="table-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>Player A \\ Player B</th>
                  <th v-for="hero in blanketRosterBAfterBans" :key="`bhead-${hero.id}`">{{ hero.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="heroA in blanketRosterAAfterBans" :key="`brow-${heroA.id}`">
                  <th>{{ heroA.name }}</th>
                  <td
                    v-for="heroB in blanketRosterBAfterBans"
                    :key="`bcell-${heroA.id}-${heroB.id}`"
                    :class="getMatchupCellClass(getMatchupWinRate(heroA.name, heroB.name))"
                  >
                    {{ formatWinRate(getMatchupWinRate(heroA.name, heroB.name)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.draft-page {
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
.summary-grid article {
  border: 1px solid #2b3d57;
  border-radius: 8px;
  padding: 1rem;
  background: #0f172a;
}

.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}

.helper-text {
  margin-top: 0.6rem;
  color: #9fb2cc;
}

.roster-grid,
.summary-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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

@media (max-width: 768px) {
  .draft-page {
    gap: 0.9rem;
  }

  section,
  .roster-grid article,
  .summary-grid article {
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
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
