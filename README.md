# PrepBuddy

A practice web app for competitive exam aspirants. Each module contains small games designed to build calculation speed and accuracy.

## Speed Math module

- **Tables Practice** — multiplication drills across any combination of tables from 1 to 30 (e.g. `28 × 17`). Pick which tables to drill, get instant right/wrong feedback, and skip a question you don't know.
- **Squares & Cubes** — squares and cubes of 1 to 30, in squares-only, cubes-only, or mixed mode.
- **Ratios to Percentage** — convert fractions to percentages to two decimal places (e.g. `1/9 = 11.11`), with a basic (1/n) and advanced (n/d) difficulty.

Every game auto-advances on a correct answer, clears the box for another try on a wrong one, and tracks accuracy, time, and mistakes per session. Session history is stored locally in the browser (no account or server needed).

## Tech

Vite + React + TypeScript + Tailwind CSS, client-only (no backend). Routing uses `HashRouter` so it works on any static host without server-side rewrite rules.

## Development

```bash
npm install
npm run dev
```

## Deployment

Pushing to `main` builds the app and deploys it to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

The Vite `base` in `vite.config.ts` is set to `/prep_buddy/` to match this repo's GitHub Pages URL. If you fork or rename the repo, update `base` to match.
