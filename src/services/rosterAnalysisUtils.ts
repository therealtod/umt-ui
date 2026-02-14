import { matchupThresholds } from './matchupThresholds'
import type { HeroStatsDictionary } from './HeroStatsDataSource'
import type { MatchupWinRateMatrix } from './heroStatsUtils'

export type CounterCandidate = {
  heroName: string
  winningMatchups: number
  averageWinRate: number
}

export type CounterSearchStrategy = 'full' | 'one-miss' | 'half'

export type CounterSearchResult = {
  strategy: CounterSearchStrategy
  threshold: number
  requiredWinningMatchups: number
  rosterSize: number
  candidates: CounterCandidate[]
}

export type PoolStrengthRow = {
  heroName: string
  losingMatchups: number
  winningMatchups: number
}

export type RosterSummary = {
  heroCount: number
  averageWinRate: number
  averagePickRate: number
  totalGamesPlayed: number
}

export type ThreatSummary = {
  heroName: string
  averageWinRate: number
  winningMatchups: number
}

export type WeakLinkSummary = {
  heroName: string
  averageWinRate: number
  winningMatchups: number
}

export const computeCounterThreshold = (rosterSize: number) => Math.floor(rosterSize / 2) + 1

export const buildCounterCandidates = (
  candidateHeroNames: string[],
  targetRosterHeroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
  winningThreshold = matchupThresholds.winningWinRateLowerBound,
): CounterCandidate[] => {
  if (targetRosterHeroNames.length === 0) {
    return []
  }

  return candidateHeroNames
    .map((heroName) => {
      let winningMatchups = 0
      let trackedMatchups = 0
      let winRateTotal = 0

      for (const rosterHeroName of targetRosterHeroNames) {
        const winRate = matchupMatrix[heroName]?.[rosterHeroName]
        if (winRate == null) {
          continue
        }

        trackedMatchups += 1
        winRateTotal += winRate

        if (winRate > winningThreshold) {
          winningMatchups += 1
        }
      }

      const averageWinRate = trackedMatchups > 0 ? Number((winRateTotal / trackedMatchups).toFixed(1)) : 0

      return {
        heroName,
        winningMatchups,
        averageWinRate,
      }
    })
    .sort((a, b) => b.winningMatchups - a.winningMatchups || b.averageWinRate - a.averageWinRate)
}

export const buildPotentialCounters = (
  candidateHeroNames: string[],
  targetRosterHeroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
  winningThreshold = matchupThresholds.winningWinRateLowerBound,
  requiredWinningMatchups = computeCounterThreshold(targetRosterHeroNames.length),
): CounterCandidate[] => {
  return buildCounterCandidates(
    candidateHeroNames,
    targetRosterHeroNames,
    matchupMatrix,
    winningThreshold,
  ).filter(
    (entry) => entry.winningMatchups >= requiredWinningMatchups,
  )
}

export const findBestCounterCandidates = (
  candidateHeroNames: string[],
  targetRosterHeroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
  startThreshold = matchupThresholds.winningWinRateLowerBound,
  minThreshold = 50,
  thresholdStep = 5,
): CounterSearchResult | null => {
  const rosterSize = targetRosterHeroNames.length
  if (rosterSize === 0 || candidateHeroNames.length === 0) {
    return null
  }

  const oneMissRequirement = Math.max(1, rosterSize - 1)

  for (let threshold = startThreshold; threshold >= minThreshold; threshold -= thresholdStep) {
    const fullCounters = buildPotentialCounters(
      candidateHeroNames,
      targetRosterHeroNames,
      matchupMatrix,
      threshold,
      rosterSize,
    )
    if (fullCounters.length > 0) {
      return {
        strategy: 'full',
        threshold,
        requiredWinningMatchups: rosterSize,
        rosterSize,
        candidates: fullCounters,
      }
    }

    if (oneMissRequirement < rosterSize) {
      const oneMissCounters = buildPotentialCounters(
        candidateHeroNames,
        targetRosterHeroNames,
        matchupMatrix,
        threshold,
        oneMissRequirement,
      )
      if (oneMissCounters.length > 0) {
        return {
          strategy: 'one-miss',
          threshold,
          requiredWinningMatchups: oneMissRequirement,
          rosterSize,
          candidates: oneMissCounters,
        }
      }
    }
  }

  const halfRequirement = Math.max(1, Math.ceil(rosterSize / 2))
  for (let threshold = startThreshold; threshold >= minThreshold; threshold -= thresholdStep) {
    const halfCounters = buildPotentialCounters(
      candidateHeroNames,
      targetRosterHeroNames,
      matchupMatrix,
      threshold,
      halfRequirement,
    )
    if (halfCounters.length > 0) {
      return {
        strategy: 'half',
        threshold,
        requiredWinningMatchups: halfRequirement,
        rosterSize,
        candidates: halfCounters,
      }
    }
  }

  return null
}

export const buildPoolStrengthRows = (
  heroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
): PoolStrengthRow[] => {
  return heroNames.map((heroName) => {
    let losingMatchups = 0
    let winningMatchups = 0

    for (const opponentHeroName of heroNames) {
      if (heroName === opponentHeroName) {
        continue
      }

      const winRate = matchupMatrix[heroName]?.[opponentHeroName]
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

    return { heroName, losingMatchups, winningMatchups }
  })
}

export const summarizeRoster = (
  rosterHeroNames: string[],
  heroStatsDictionary: HeroStatsDictionary,
): RosterSummary => {
  if (rosterHeroNames.length === 0) {
    return {
      heroCount: 0,
      averageWinRate: 0,
      averagePickRate: 0,
      totalGamesPlayed: 0,
    }
  }

  const totals = rosterHeroNames.reduce(
    (acc, heroName) => {
      const stats = heroStatsDictionary[heroName]
      acc.winRate += stats?.winRate ?? 0
      acc.pickRate += stats?.pickRate ?? 0
      acc.gamesPlayed += stats?.gamesPlayed ?? 0
      return acc
    },
    { winRate: 0, pickRate: 0, gamesPlayed: 0 },
  )

  return {
    heroCount: rosterHeroNames.length,
    averageWinRate: Number((totals.winRate / rosterHeroNames.length).toFixed(1)),
    averagePickRate: Number((totals.pickRate / rosterHeroNames.length).toFixed(1)),
    totalGamesPlayed: totals.gamesPlayed,
  }
}

export const getMostThreateningHero = (
  opponentRosterHeroNames: string[],
  targetRosterHeroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
): ThreatSummary | null => {
  if (opponentRosterHeroNames.length === 0 || targetRosterHeroNames.length === 0) {
    return null
  }

  const threats = opponentRosterHeroNames.map((opponentHeroName) => {
    const winRates = targetRosterHeroNames
      .map((targetHeroName) => matchupMatrix[opponentHeroName]?.[targetHeroName])
      .filter((value): value is number => value != null)

    const averageWinRate =
      winRates.length > 0 ? Number((winRates.reduce((sum, value) => sum + value, 0) / winRates.length).toFixed(1)) : 0

    return {
      heroName: opponentHeroName,
      averageWinRate,
      winningMatchups: winRates.filter((value) => value > matchupThresholds.winningWinRateLowerBound).length,
    }
  })

  return (
    threats.sort((a, b) => b.averageWinRate - a.averageWinRate || b.winningMatchups - a.winningMatchups)[0] ?? null
  )
}

export const buildWeakLinkRows = (
  rosterHeroNames: string[],
  opponentRosterHeroNames: string[],
  matchupMatrix: MatchupWinRateMatrix,
): WeakLinkSummary[] => {
  if (rosterHeroNames.length === 0 || opponentRosterHeroNames.length === 0) {
    return []
  }

  return rosterHeroNames
    .map((heroName) => {
      const winRates = opponentRosterHeroNames
        .map((opponentHeroName) => matchupMatrix[heroName]?.[opponentHeroName])
        .filter((value): value is number => value != null)

      const averageWinRate =
        winRates.length > 0 ? Number((winRates.reduce((sum, value) => sum + value, 0) / winRates.length).toFixed(1)) : 0

      return {
        heroName,
        averageWinRate,
        winningMatchups: winRates.filter((value) => value > matchupThresholds.winningWinRateLowerBound).length,
      }
    })
    .sort((a, b) => a.averageWinRate - b.averageWinRate || a.winningMatchups - b.winningMatchups)
}
