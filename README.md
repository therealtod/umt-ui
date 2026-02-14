# umt-ui

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

## Hero CSV Data

The app reads hero statistics from CSV files in `src/data/uml/` using the CSV data source.

Required files:
- `src/data/uml/winrate.csv`
- `src/data/uml/plays.csv`

CSV format:
- The first row is the header and must list all hero names.
- The first column of each row is the row hero name.
- Cells are numeric values indexed by row hero vs column hero.
  - `winrate.csv`: win rate percentage of row hero vs column hero.
  - `plays.csv`: number of games played for row hero vs column hero.

Notes:
- Header hero order must match the row order.
- Empty cells or non-numeric values are treated as missing data.
- The app will post-process the data:
  - If both `Yennefer` and `Triss` exist, they are merged into `Yennefer&Triss`.
  - If both `Buffy Giles` and `Buffy Xander` exist, they are merged into `Buffy`.

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
