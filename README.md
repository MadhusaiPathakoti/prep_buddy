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

Hosted on [Vercel](https://vercel.com) (free Hobby plan): import this GitHub repo at [vercel.com/new](https://vercel.com/new), it auto-detects Vite (build command `npm run build`, output `dist`) — no extra config needed. Every push to `main` redeploys automatically; every other branch/PR gets its own preview URL.
