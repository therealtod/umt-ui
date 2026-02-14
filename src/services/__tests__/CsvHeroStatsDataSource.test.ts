import { beforeEach, describe, expect, it, vi } from 'vitest'

const playsCsv = `
,Yennefer,Triss,Buffy Giles,Buffy Xander,OppA,OppB
Yennefer,0,0,0,0,10,5
Triss,0,0,0,0,6,7
Buffy Giles,0,0,0,0,8,4
Buffy Xander,0,0,0,0,3,9
OppA,10,6,8,3,0,0
OppB,5,7,4,9,0,0
`

const winrateCsv = `
,Yennefer,Triss,Buffy Giles,Buffy Xander,OppA,OppB
Yennefer,0,0,0,0,0,0
Triss,0,0,0,0,0,0
Buffy Giles,0,0,0,0,0,0
Buffy Xander,0,0,0,0,0,0
OppA,60,45,55,70,0,0
OppB,52,62,40,58,0,0
`

vi.mock('@/data/uml/plays.csv?raw', () => ({ default: playsCsv }))
vi.mock('@/data/uml/winrate.csv?raw', () => ({ default: winrateCsv }))

describe('CsvHeroStatsDataSource post-processing', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('merges Yennefer and Triss into Yennefer&Triss', async () => {
    const { CsvHeroStatsDataSource } = await import('../CsvHeroStatsDataSource')
    const dataSource = new CsvHeroStatsDataSource()
    const heroes = await dataSource.getHeroes()

    expect(heroes).toContain('Yennefer&Triss')
    expect(heroes).not.toContain('Yennefer')
    expect(heroes).not.toContain('Triss')
  })

  it('merges Buffy Giles and Buffy Xander into Buffy', async () => {
    const { CsvHeroStatsDataSource } = await import('../CsvHeroStatsDataSource')
    const dataSource = new CsvHeroStatsDataSource()
    const heroes = await dataSource.getHeroes()

    expect(heroes).toContain('Buffy')
    expect(heroes).not.toContain('Buffy Giles')
    expect(heroes).not.toContain('Buffy Xander')
  })

  it('uses best winrate and summed games for Yennefer&Triss', async () => {
    const { CsvHeroStatsDataSource } = await import('../CsvHeroStatsDataSource')
    const dataSource = new CsvHeroStatsDataSource()
    const stats = await dataSource.getMatchupStats('Yennefer&Triss', 'OppA')

    expect(stats).not.toBeNull()
    expect(stats?.gamesPlayed).toBe(16)
    expect(stats?.hero1WinRate).toBe(60)
  })

  it('uses best winrate and summed games for Buffy', async () => {
    const { CsvHeroStatsDataSource } = await import('../CsvHeroStatsDataSource')
    const dataSource = new CsvHeroStatsDataSource()
    const stats = await dataSource.getMatchupStats('Buffy', 'OppB')

    expect(stats).not.toBeNull()
    expect(stats?.gamesPlayed).toBe(13)
    expect(stats?.hero1WinRate).toBe(58)
  })
})
