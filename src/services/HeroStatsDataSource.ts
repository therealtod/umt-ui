export interface HeroStatsFilter {
  startDate?: string
  endDate?: string
  minGamesPlayed?: number
  minMatchupGames?: number
  [key: string]: unknown
}

export interface HeroStats {
  heroName: string
  gamesPlayed: number
  wins: number
  losses: number
  winRate: number
  pickRate?: number
}

export interface MatchupStats {
  hero1: string
  hero2: string
  gamesPlayed: number
  hero1Wins: number
  hero2Wins: number
  hero1WinRate: number
}

export type HeroStatsDictionary = Record<string, HeroStats>

export interface HeroStatsDataSource {
  getHeroes(filter?: HeroStatsFilter): Promise<string[]>
  getHeroStats(heroName: string, filter?: HeroStatsFilter): Promise<HeroStats | null>
  getAsDictionary(filter?: HeroStatsFilter): Promise<HeroStatsDictionary>
  getMatchupStats(hero1: string, hero2: string, filter?: HeroStatsFilter): Promise<MatchupStats | null>
}
