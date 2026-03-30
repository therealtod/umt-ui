import { CompositeHeroStatsDataSource } from './CompositeHeroStatsDataSource'
import { CsvHeroStatsDataSource } from './CsvHeroStatsDataSource'
import { EmptySasHeroStatsDataSource } from './EmptySasHeroStatsDataSource'
import type { HeroStatsFilter } from './HeroStatsDataSource'

export const heroStatsFilter: HeroStatsFilter = {
  minMatchupGames: 8,
}

const csvDataSource = new CsvHeroStatsDataSource({
  minMatchupGames: heroStatsFilter.minMatchupGames,
})
const emptySasDataSource = new EmptySasHeroStatsDataSource()

export const heroStatsDataSource = new CompositeHeroStatsDataSource([csvDataSource, emptySasDataSource])
