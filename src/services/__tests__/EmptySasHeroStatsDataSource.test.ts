import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/empty/sas.csv?raw', () => ({
  default: 'Rosie the Riveter, George Washington, Wyatt Earp, John Henry',
}))

describe('EmptySasHeroStatsDataSource', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('loads hero names from sas.csv', async () => {
    const { EmptySasHeroStatsDataSource } = await import('../EmptySasHeroStatsDataSource')
    const dataSource = new EmptySasHeroStatsDataSource()
    const heroes = await dataSource.getHeroes()

    expect(heroes).toEqual(['Rosie the Riveter', 'George Washington', 'Wyatt Earp', 'John Henry'])
  })

  it('returns unknown matchup stats when one side belongs to sas heroes', async () => {
    const { EmptySasHeroStatsDataSource } = await import('../EmptySasHeroStatsDataSource')
    const dataSource = new EmptySasHeroStatsDataSource()
    const matchup = await dataSource.getMatchupStats('Rosie the Riveter', 'Sherlock Holmes', {
      minMatchupGames: 8,
    })

    expect(matchup).toBeNull()
  })
})
