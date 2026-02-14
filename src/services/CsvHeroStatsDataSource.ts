import type {
  HeroStats,
  HeroStatsDataSource,
  HeroStatsDictionary,
  HeroStatsFilter,
  MatchupStats,
} from './HeroStatsDataSource'

import playsCsvRaw from '@/data/uml/plays.csv?raw'
import winrateCsvRaw from '@/data/uml/winrate.csv?raw'

type Matrix = Record<string, Record<string, number | null>>

const parseCsvMatrix = (csvRaw: string): { heroes: string[]; matrix: Matrix } => {
  const lines = csvRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { heroes: [], matrix: {} }
  }

  const headerLine = lines[0]
  if (!headerLine) {
    return { heroes: [], matrix: {} }
  }

  const headerCells = headerLine.replace(/^\uFEFF/, '').split(',')
  const heroes = headerCells.slice(1).map((cell) => cell.trim())
  const matrix: Matrix = {}

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const rowLine = lines[rowIndex]
    if (!rowLine) {
      continue
    }

    const cells = rowLine.split(',')
    const rowHero = cells[0]?.trim()

    if (!rowHero) {
      continue
    }

    if (!matrix[rowHero]) {
      matrix[rowHero] = {}
    }

    for (let columnIndex = 1; columnIndex <= heroes.length; columnIndex += 1) {
      const heroName = heroes[columnIndex - 1]
      if (!heroName) {
        continue
      }

      const valueRaw = cells[columnIndex]
      const value = valueRaw == null ? Number.NaN : Number(valueRaw)
      matrix[rowHero][heroName] = Number.isFinite(value) ? value : null
    }
  }

  return { heroes, matrix }
}

const playsParsed = parseCsvMatrix(playsCsvRaw)
const winrateParsed = parseCsvMatrix(winrateCsvRaw)

const sumNullable = (a: number | null, b: number | null): number | null => {
  if (a == null && b == null) {
    return null
  }

  return (a ?? 0) + (b ?? 0)
}

const bestNullable = (a: number | null, b: number | null): number | null => {
  if (a == null && b == null) {
    return null
  }

  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY)
}

const ensureRow = (matrix: Matrix, rowHero: string): Record<string, number | null> => {
  if (!matrix[rowHero]) {
    matrix[rowHero] = {}
  }
  return matrix[rowHero]
}

type MergeRule = {
  heroA: string
  heroB: string
  mergedHero: string
}

const applyMergeRulePostProcessing = (
  sourceHeroes: string[],
  sourcePlaysMatrix: Matrix,
  sourceWinrateMatrix: Matrix,
  mergeRule: MergeRule,
): { heroes: string[]; playsMatrix: Matrix; winrateMatrix: Matrix } => {
  const { heroA, heroB, mergedHero } = mergeRule

  if (!sourceHeroes.includes(heroA) || !sourceHeroes.includes(heroB)) {
    return {
      heroes: [...sourceHeroes],
      playsMatrix: sourcePlaysMatrix,
      winrateMatrix: sourceWinrateMatrix,
    }
  }

  const heroesWithoutMerged = sourceHeroes.filter((heroName) => heroName !== mergedHero)
  const heroesWithoutParts = heroesWithoutMerged.filter((heroName) => heroName !== heroA && heroName !== heroB)
  const insertAt = Math.min(heroesWithoutMerged.indexOf(heroA), heroesWithoutMerged.indexOf(heroB))
  const processedHeroes = [...heroesWithoutParts]
  processedHeroes.splice(insertAt, 0, mergedHero)

  const mergedPlaysRow = ensureRow(sourcePlaysMatrix, mergedHero)
  const mergedWinrateRow = ensureRow(sourceWinrateMatrix, mergedHero)

  for (const opponent of heroesWithoutParts) {
    const gamesFromMergedToOpponent = sumNullable(
      sourcePlaysMatrix[heroA]?.[opponent] ?? null,
      sourcePlaysMatrix[heroB]?.[opponent] ?? null,
    )
    const gamesFromOpponentToMerged = sumNullable(
      sourcePlaysMatrix[opponent]?.[heroA] ?? null,
      sourcePlaysMatrix[opponent]?.[heroB] ?? null,
    )

    mergedPlaysRow[opponent] = gamesFromMergedToOpponent
    ensureRow(sourcePlaysMatrix, opponent)[mergedHero] = gamesFromOpponentToMerged

    const mergedWinrateVsOpponent = bestNullable(
      sourceWinrateMatrix[opponent]?.[heroA] ?? null,
      sourceWinrateMatrix[opponent]?.[heroB] ?? null,
    )

    ensureRow(sourceWinrateMatrix, opponent)[mergedHero] = mergedWinrateVsOpponent
    mergedWinrateRow[opponent] = mergedWinrateVsOpponent == null ? null : Number((100 - mergedWinrateVsOpponent).toFixed(1))
  }

  mergedPlaysRow[mergedHero] = null
  mergedWinrateRow[mergedHero] = null

  delete sourcePlaysMatrix[heroA]
  delete sourcePlaysMatrix[heroB]
  delete sourceWinrateMatrix[heroA]
  delete sourceWinrateMatrix[heroB]

  for (const row of Object.values(sourcePlaysMatrix)) {
    delete row[heroA]
    delete row[heroB]
  }
  for (const row of Object.values(sourceWinrateMatrix)) {
    delete row[heroA]
    delete row[heroB]
  }

  return {
    heroes: processedHeroes,
    playsMatrix: sourcePlaysMatrix,
    winrateMatrix: sourceWinrateMatrix,
  }
}

const baseHeroes = playsParsed.heroes.length > 0 ? playsParsed.heroes : winrateParsed.heroes
const postProcessedYenneferTriss = applyMergeRulePostProcessing(
  baseHeroes,
  playsParsed.matrix,
  winrateParsed.matrix,
  { heroA: 'Yennefer', heroB: 'Triss', mergedHero: 'Yennefer&Triss' },
)
const postProcessed = applyMergeRulePostProcessing(
  postProcessedYenneferTriss.heroes,
  postProcessedYenneferTriss.playsMatrix,
  postProcessedYenneferTriss.winrateMatrix,
  { heroA: 'Buffy Giles', heroB: 'Buffy Xander', mergedHero: 'Buffy' },
)
const heroes = postProcessed.heroes
const playsMatrix = postProcessed.playsMatrix
const winrateMatrix = postProcessed.winrateMatrix

const getWinrateValue = (hero1: string, hero2: string): number | null => {
  return winrateMatrix[hero2]?.[hero1] ?? null
}

const buildHeroStatsDictionary = (minMatchupGames: number): HeroStatsDictionary => {
  const dictionary: HeroStatsDictionary = {}

  let totalHeroAppearances = 0
  const computedRows: Array<{ heroName: string; gamesPlayed: number; winsFloat: number }> = []

  for (const heroName of heroes) {
    let gamesPlayed = 0
    let winsFloat = 0

    for (const opponentName of heroes) {
      if (heroName === opponentName) {
        continue
      }

      const games = playsMatrix[heroName]?.[opponentName]
      const winRate = getWinrateValue(heroName, opponentName)

      if (
        games == null ||
        winRate == null ||
        games < minMatchupGames ||
        winRate < 0 ||
        winRate > 100
      ) {
        continue
      }

      gamesPlayed += games
      winsFloat += (games * winRate) / 100
    }

    computedRows.push({ heroName, gamesPlayed, winsFloat })
    totalHeroAppearances += gamesPlayed
  }

  for (const row of computedRows) {
    const wins = Math.round(row.winsFloat)
    const losses = Math.max(0, row.gamesPlayed - wins)
    const winRate = row.gamesPlayed > 0 ? Number(((wins / row.gamesPlayed) * 100).toFixed(1)) : 0
    const pickRate =
      totalHeroAppearances > 0 ? Number(((row.gamesPlayed / totalHeroAppearances) * 100).toFixed(2)) : 0

    dictionary[row.heroName] = {
      heroName: row.heroName,
      gamesPlayed: row.gamesPlayed,
      wins,
      losses,
      winRate,
      pickRate,
    }
  }

  return dictionary
}

type CsvHeroStatsDataSourceOptions = {
  minMatchupGames?: number
}

export class CsvHeroStatsDataSource implements HeroStatsDataSource {
  private readonly minMatchupGames: number

  constructor(options?: CsvHeroStatsDataSourceOptions) {
    this.minMatchupGames = Math.max(0, options?.minMatchupGames ?? 0)
  }

  private resolveMinMatchupGames(filter?: HeroStatsFilter): number {
    return Math.max(0, filter?.minMatchupGames ?? this.minMatchupGames)
  }

  async getHeroes(filter?: HeroStatsFilter): Promise<string[]> {
    if (!filter?.minGamesPlayed) {
      return [...heroes]
    }

    const dictionary = await this.getAsDictionary(filter)
    return Object.keys(dictionary)
  }

  async getHeroStats(heroName: string, filter?: HeroStatsFilter): Promise<HeroStats | null> {
    const dictionary = await this.getAsDictionary(filter)
    const stats = dictionary[heroName]
    if (!stats) {
      return null
    }

    return { ...stats }
  }

  async getAsDictionary(filter?: HeroStatsFilter): Promise<HeroStatsDictionary> {
    const dictionary = buildHeroStatsDictionary(this.resolveMinMatchupGames(filter))

    if (!filter?.minGamesPlayed) {
      return { ...dictionary }
    }

    const filtered: HeroStatsDictionary = {}
    for (const [heroName, stats] of Object.entries(dictionary)) {
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

    const games = playsMatrix[hero1]?.[hero2]
    const hero1WinRate = getWinrateValue(hero1, hero2)
    const minMatchupGames = this.resolveMinMatchupGames(filter)

    if (
      games == null ||
      hero1WinRate == null ||
      games < minMatchupGames ||
      hero1WinRate < 0 ||
      hero1WinRate > 100
    ) {
      return null
    }

    const hero1Wins = Math.round((games * hero1WinRate) / 100)
    const hero2Wins = games - hero1Wins

    return {
      hero1,
      hero2,
      gamesPlayed: games,
      hero1Wins,
      hero2Wins,
      hero1WinRate: Number(hero1WinRate.toFixed(1)),
    }
  }
}

export const csvHeroStatsDataSource = new CsvHeroStatsDataSource()
