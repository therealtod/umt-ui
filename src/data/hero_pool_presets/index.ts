export type HeroPoolPreset = {
  id: string
  label: string
  heroNames: string[]
  heroNameSet: Set<string>
}

type PresetModule = Record<string, unknown>

const presetModules = import.meta.glob('./*.ts', { eager: true }) as Record<string, PresetModule>

const toKebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

const toTitleCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()

const findHeroArrayExport = (moduleExports: PresetModule): string[] | null => {
  for (const exportValue of Object.values(moduleExports)) {
    if (Array.isArray(exportValue) && exportValue.every((item) => typeof item === 'string')) {
      return [...exportValue]
    }
  }
  return null
}

export const HERO_POOL_PRESETS: HeroPoolPreset[] = Object.entries(presetModules)
  .flatMap(([modulePath, moduleExports]) => {
    const fileNameWithExtension = modulePath.split('/').pop() ?? ''
    const fileName = fileNameWithExtension.replace(/\.ts$/, '')

    if (!fileName || fileName === 'index') {
      return []
    }

    const heroNames = findHeroArrayExport(moduleExports)
    if (!heroNames || heroNames.length === 0) {
      return []
    }

    return [
      {
        id: toKebabCase(fileName),
        label: toTitleCase(fileName),
        heroNames,
        heroNameSet: new Set(heroNames),
      },
    ]
  })
  .sort((a, b) => a.label.localeCompare(b.label))
