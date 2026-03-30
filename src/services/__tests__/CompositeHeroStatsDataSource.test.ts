import { describe, expect, it } from 'vitest'
import { CompositeHeroStatsDataSource } from '../CompositeHeroStatsDataSource'
import type { HeroStatsDataSource } from '../HeroStatsDataSource'

const primarySource: HeroStatsDataSource = {
  async getHeroes() {
    return ['Alice']
  },
  async getHeroStats(heroName) {
    if (heroName !== 'Alice') {
      return null
    }
    return {
      heroName: 'Alice',
      gamesPlayed: 10,
      wins: 6,
      losses: 4,
      winRate: 60,
      pickRate: 50,
    }
  },
  async getAsDictionary() {
    return {
      Alice: {
        heroName: 'Alice',
        gamesPlayed: 10,
        wins: 6,
        losses: 4,
        winRate: 60,
        pickRate: 50,
      },
    }
  },
  async getMatchupStats(hero1, hero2) {
    if (hero1 === 'Alice' && hero2 === 'Rosie') {
      return null
    }
    return null
  },
}

const secondarySource: HeroStatsDataSource = {
  async getHeroes() {
    return ['Rosie']
  },
  async getHeroStats(heroName) {
    if (heroName !== 'Rosie') {
      return null
    }
    return {
      heroName: 'Rosie',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      pickRate: 0,
    }
  },
  async getAsDictionary() {
    return {
      Rosie: {
        heroName: 'Rosie',
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pickRate: 0,
      },
    }
  },
  async getMatchupStats(hero1, hero2) {
    if (hero1 === hero2) {
      return null
    }
    if (hero1 === 'Rosie' || hero2 === 'Rosie') {
      return {
        hero1,
        hero2,
        gamesPlayed: 0,
        hero1Wins: 0,
        hero2Wins: 0,
        hero1WinRate: 0,
      }
    }
    return null
  },
}

describe('CompositeHeroStatsDataSource', () => {
  it('merges heroes and falls back to secondary matchup data', async () => {
    const dataSource = new CompositeHeroStatsDataSource([primarySource, secondarySource])

    await expect(dataSource.getHeroes()).resolves.toEqual(['Alice', 'Rosie'])
    await expect(dataSource.getHeroStats('Alice')).resolves.toMatchObject({ gamesPlayed: 10 })
    await expect(dataSource.getHeroStats('Rosie')).resolves.toMatchObject({ gamesPlayed: 0 })

    const matchup = await dataSource.getMatchupStats('Alice', 'Rosie')
    expect(matchup).not.toBeNull()
    expect(matchup?.gamesPlayed).toBe(0)
    expect(matchup?.hero1WinRate).toBe(0)
  })
})
