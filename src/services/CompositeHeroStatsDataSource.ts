import type {
  HeroStats,
  HeroStatsDataSource,
  HeroStatsDictionary,
  HeroStatsFilter,
  MatchupStats,
} from './HeroStatsDataSource'

const cloneHeroStats = (stats: HeroStats): HeroStats => ({ ...stats })
const cloneMatchupStats = (stats: MatchupStats): MatchupStats => ({ ...stats })

export class CompositeHeroStatsDataSource implements HeroStatsDataSource {
  private readonly sources: HeroStatsDataSource[]

  constructor(sources: HeroStatsDataSource[]) {
    this.sources = [...sources]
  }

  async getHeroes(filter?: HeroStatsFilter): Promise<string[]> {
    const seen = new Set<string>()
    const merged: string[] = []

    for (const source of this.sources) {
      const heroes = await source.getHeroes(filter)
      for (const heroName of heroes) {
        if (!seen.has(heroName)) {
          seen.add(heroName)
          merged.push(heroName)
        }
      }
    }

    return merged
  }

  async getHeroStats(heroName: string, filter?: HeroStatsFilter): Promise<HeroStats | null> {
    let fallback: HeroStats | null = null

    for (const source of this.sources) {
      const stats = await source.getHeroStats(heroName, filter)
      if (!stats) {
        continue
      }

      if (stats.gamesPlayed > 0) {
        return cloneHeroStats(stats)
      }

      if (!fallback || stats.gamesPlayed > fallback.gamesPlayed) {
        fallback = stats
      }
    }

    return fallback ? cloneHeroStats(fallback) : null
  }

  async getAsDictionary(filter?: HeroStatsFilter): Promise<HeroStatsDictionary> {
    const merged: HeroStatsDictionary = {}

    for (const source of this.sources) {
      const dictionary = await source.getAsDictionary(filter)
      for (const [heroName, stats] of Object.entries(dictionary)) {
        const existing = merged[heroName]
        if (!existing) {
          merged[heroName] = cloneHeroStats(stats)
          continue
        }

        if (existing.gamesPlayed === 0 && stats.gamesPlayed > 0) {
          merged[heroName] = cloneHeroStats(stats)
          continue
        }

        if (stats.gamesPlayed > existing.gamesPlayed) {
          merged[heroName] = cloneHeroStats(stats)
        }
      }
    }

    return merged
  }

  async getMatchupStats(hero1: string, hero2: string, filter?: HeroStatsFilter): Promise<MatchupStats | null> {
    for (const source of this.sources) {
      const stats = await source.getMatchupStats(hero1, hero2, filter)
      if (stats) {
        return cloneMatchupStats(stats)
      }
    }

    return null
  }
}
