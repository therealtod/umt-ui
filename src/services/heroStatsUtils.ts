import type { HeroStatsDataSource, HeroStatsFilter } from './HeroStatsDataSource'

export type MatchupWinRateMatrix = Record<string, Record<string, number | null>>

export const buildMatchupWinRateMatrix = async (
  dataSource: HeroStatsDataSource,
  heroNames: string[],
  filter?: HeroStatsFilter,
): Promise<MatchupWinRateMatrix> => {
  const matrix: MatchupWinRateMatrix = {}

  for (const rowHero of heroNames) {
    matrix[rowHero] = {}
    for (const columnHero of heroNames) {
      matrix[rowHero][columnHero] = rowHero === columnHero ? null : 0
    }
  }

  const pairRequests: Array<Promise<void>> = []

  for (const rowHero of heroNames) {
    for (const columnHero of heroNames) {
      if (rowHero === columnHero) {
        continue
      }

      pairRequests.push(
        dataSource.getMatchupStats(rowHero, columnHero, filter).then((stats) => {
          if (!matrix[rowHero]) {
            matrix[rowHero] = {}
          }
          matrix[rowHero][columnHero] = stats ? stats.hero1WinRate : null
        }),
      )
    }
  }

  await Promise.all(pairRequests)
  return matrix
}
