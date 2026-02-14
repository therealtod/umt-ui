import { CsvHeroStatsDataSource } from './CsvHeroStatsDataSource'
import type { HeroStatsFilter } from './HeroStatsDataSource'

export const heroStatsFilter: HeroStatsFilter = {
  minMatchupGames: 8,
}

export const heroStatsDataSource = new CsvHeroStatsDataSource({
  minMatchupGames: heroStatsFilter.minMatchupGames,
})
