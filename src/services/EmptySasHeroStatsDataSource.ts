import type {
  HeroStats,
  HeroStatsDataSource,
  HeroStatsDictionary,
  HeroStatsFilter,
  MatchupStats,
} from './HeroStatsDataSource'

import sasCsvRaw from '@/data/empty/sas.csv?raw'

const parseHeroNames = (csvRaw: string): string[] => {
  const tokens = csvRaw
    .replace(/\uFEFF/g, '')
    .split(/[\r\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  const uniqueNames: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token)
      uniqueNames.push(token)
    }
  }

  return uniqueNames
}

const heroes = parseHeroNames(sasCsvRaw)
const heroSet = new Set(heroes)

const buildZeroStats = (heroName: string): HeroStats => ({
  heroName,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  pickRate: 0,
})

export class EmptySasHeroStatsDataSource implements HeroStatsDataSource {
  async getHeroes(filter?: HeroStatsFilter): Promise<string[]> {
    if (filter?.minGamesPlayed && filter.minGamesPlayed > 0) {
      return []
    }

    return [...heroes]
  }

  async getHeroStats(heroName: string, filter?: HeroStatsFilter): Promise<HeroStats | null> {
    if (!heroSet.has(heroName)) {
      return null
    }

    if (filter?.minGamesPlayed && filter.minGamesPlayed > 0) {
      return null
    }

    return buildZeroStats(heroName)
  }

  async getAsDictionary(filter?: HeroStatsFilter): Promise<HeroStatsDictionary> {
    if (filter?.minGamesPlayed && filter.minGamesPlayed > 0) {
      return {}
    }

    const dictionary: HeroStatsDictionary = {}
    for (const heroName of heroes) {
      dictionary[heroName] = buildZeroStats(heroName)
    }
    return dictionary
  }

  async getMatchupStats(hero1: string, hero2: string, _filter?: HeroStatsFilter): Promise<MatchupStats | null> {
    if (hero1 === hero2) {
      return null
    }

    // Matchups involving SAS heroes are currently unknown and should not be
    // interpreted as 0% win rate.
    if (heroSet.has(hero1) || heroSet.has(hero2)) {
      return null
    }

    return null
  }
}

export const emptySasHeroStatsDataSource = new EmptySasHeroStatsDataSource()
