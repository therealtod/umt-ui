import type {
  HeroStats,
  HeroStatsDataSource,
  HeroStatsDictionary,
  HeroStatsFilter,
  MatchupStats,
} from './HeroStatsDataSource'

const HERO_STATS: HeroStatsDictionary = {
  'Sherlock Holmes': {
    heroName: 'Sherlock Holmes',
    gamesPlayed: 620,
    wins: 360,
    losses: 260,
    winRate: 58.1,
    pickRate: 22.4,
  },
  Bigfoot: {
    heroName: 'Bigfoot',
    gamesPlayed: 510,
    wins: 274,
    losses: 236,
    winRate: 53.7,
    pickRate: 18.2,
  },
  Alice: {
    heroName: 'Alice',
    gamesPlayed: 455,
    wins: 240,
    losses: 215,
    winRate: 52.7,
    pickRate: 16.9,
  },
  Medusa: {
    heroName: 'Medusa',
    gamesPlayed: 560,
    wins: 324,
    losses: 236,
    winRate: 57.9,
    pickRate: 19.1,
  },
  Dracula: {
    heroName: 'Dracula',
    gamesPlayed: 390,
    wins: 191,
    losses: 199,
    winRate: 49,
    pickRate: 12.4,
  },
  'Sun Wukong': {
    heroName: 'Sun Wukong',
    gamesPlayed: 430,
    wins: 223,
    losses: 207,
    winRate: 51.9,
    pickRate: 15.1,
  },
}

type PairSeed = {
  hero1: string
  hero2: string
  hero1WinRate: number
  gamesPlayed: number
}

const MATCHUP_SEEDS: PairSeed[] = [
  { hero1: 'Sherlock Holmes', hero2: 'Bigfoot', hero1WinRate: 56, gamesPlayed: 82 },
  { hero1: 'Sherlock Holmes', hero2: 'Alice', hero1WinRate: 62, gamesPlayed: 75 },
  { hero1: 'Sherlock Holmes', hero2: 'Medusa', hero1WinRate: 45, gamesPlayed: 96 },
  { hero1: 'Sherlock Holmes', hero2: 'Dracula', hero1WinRate: 64, gamesPlayed: 69 },
  { hero1: 'Sherlock Holmes', hero2: 'Sun Wukong', hero1WinRate: 57, gamesPlayed: 71 },
  { hero1: 'Bigfoot', hero2: 'Alice', hero1WinRate: 52, gamesPlayed: 63 },
  { hero1: 'Bigfoot', hero2: 'Medusa', hero1WinRate: 39, gamesPlayed: 80 },
  { hero1: 'Bigfoot', hero2: 'Dracula', hero1WinRate: 61, gamesPlayed: 58 },
  { hero1: 'Bigfoot', hero2: 'Sun Wukong', hero1WinRate: 58, gamesPlayed: 65 },
  { hero1: 'Alice', hero2: 'Medusa', hero1WinRate: 42, gamesPlayed: 73 },
  { hero1: 'Alice', hero2: 'Dracula', hero1WinRate: 55, gamesPlayed: 62 },
  { hero1: 'Alice', hero2: 'Sun Wukong', hero1WinRate: 47, gamesPlayed: 67 },
  { hero1: 'Medusa', hero2: 'Dracula', hero1WinRate: 66, gamesPlayed: 70 },
  { hero1: 'Medusa', hero2: 'Sun Wukong', hero1WinRate: 59, gamesPlayed: 77 },
  { hero1: 'Dracula', hero2: 'Sun Wukong', hero1WinRate: 44, gamesPlayed: 60 },
]

const MATCHUP_LOOKUP = new Map<string, MatchupStats>()

for (const seed of MATCHUP_SEEDS) {
  const hero1Wins = Math.round((seed.gamesPlayed * seed.hero1WinRate) / 100)
  const hero2Wins = seed.gamesPlayed - hero1Wins
  MATCHUP_LOOKUP.set(`${seed.hero1}|${seed.hero2}`, {
    hero1: seed.hero1,
    hero2: seed.hero2,
    gamesPlayed: seed.gamesPlayed,
    hero1Wins,
    hero2Wins,
    hero1WinRate: seed.hero1WinRate,
  })
  MATCHUP_LOOKUP.set(`${seed.hero2}|${seed.hero1}`, {
    hero1: seed.hero2,
    hero2: seed.hero1,
    gamesPlayed: seed.gamesPlayed,
    hero1Wins: hero2Wins,
    hero2Wins: hero1Wins,
    hero1WinRate: Number((100 - seed.hero1WinRate).toFixed(1)),
  })
}

export class MockHeroStatsDataSource implements HeroStatsDataSource {
  async getHeroes(filter?: HeroStatsFilter): Promise<string[]> {
    if (!filter?.minGamesPlayed) {
      return Object.keys(HERO_STATS)
    }

    const dictionary = await this.getAsDictionary(filter)
    return Object.keys(dictionary)
  }

  async getHeroStats(heroName: string, filter?: HeroStatsFilter): Promise<HeroStats | null> {
    const stats = HERO_STATS[heroName]
    if (!stats) {
      return null
    }

    if (filter?.minGamesPlayed && stats.gamesPlayed < filter.minGamesPlayed) {
      return null
    }

    return { ...stats }
  }

  async getAsDictionary(filter?: HeroStatsFilter): Promise<HeroStatsDictionary> {
    if (!filter?.minGamesPlayed) {
      return { ...HERO_STATS }
    }

    const filtered: HeroStatsDictionary = {}
    for (const [heroName, stats] of Object.entries(HERO_STATS)) {
      if (stats.gamesPlayed >= filter.minGamesPlayed) {
        filtered[heroName] = { ...stats }
      }
    }

    return filtered
  }

  async getMatchupStats(hero1: string, hero2: string, filter?: HeroStatsFilter): Promise<MatchupStats | null> {
    if (hero1 === hero2) {
      return null
    }

    const stats = MATCHUP_LOOKUP.get(`${hero1}|${hero2}`) ?? null
    if (!stats) {
      return null
    }

    if (filter?.minMatchupGames && stats.gamesPlayed < filter.minMatchupGames) {
      return null
    }

    return stats
  }
}

export const mockHeroStatsDataSource = new MockHeroStatsDataSource()
