# umt-ui

## Developer Commands

```sh
npm run dev          # dev server
npm run build        # type-check + build (do NOT skip vue-tsc)
npm run preview      # preview production build
npm run test:unit    # Vitest unit tests
npm run lint         # ESLint
npm run format       # Prettier format (src/ only)
```

## Project-Specific Notes

- TypeScript uses `vue-tsc` (not bare `tsc`) because `.vue` imports need Volar-aware type info
- Build runs `type-check` → `build-only`; always run `npm run build` to catch type errors
- Tests: jsdom environment, located in `src/**/__tests__/*`, exclude `e2e/**`
- Hero stats data lives in `src/data/uml/`: `winrate.csv` and `plays.csv`
  - Cells are row hero vs column hero values
  - `Yennefer`+`Triss` → merged; `Buffy Giles`+`Buffy Xander` → merged

## Style

- Prettier: single quotes, no semicolons, 100 print width
- ESLint: flat config with `@vue/eslint-config-typescript` + Vitest plugin

## Architecture

- Vue 3 + Vite + Pinia + Vue Router
- `@/` alias → `src/`
- Composables at `src/composables/`, stores at `src/stores/`, services at `src/services/`