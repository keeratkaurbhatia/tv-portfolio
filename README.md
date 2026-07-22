# K–TV

An uncanny late-night television portfolio for a creative developer. Projects
air as individual channels, an automated presenter reads short bulletins, and
live builds can be explored inside the broadcast.

## What it includes

- a cinematic station-ident landing experience
- project channels populated from deployed links and GitHub repository data
- cached generated narration with a deliberately damaged broadcast treatment
- an interactive in-frame project feed with a full-screen handoff
- private Master Control for editing portfolio content
- durable portfolio, credential, and session storage with Cloudflare D1

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` and provide the required runtime values.
The local site is available at the URL printed by the development server.

## Validation

```bash
npm run lint
npm run build
```

## Deployment

This is a full-stack Vinext application, not a static export. The narration,
Master Control, saved portfolio content, authentication, and D1 persistence
require a Cloudflare Workers-compatible deployment. GitHub Pages alone cannot
run those server features.

For Cloudflare Workers Builds, connect the GitHub repository and use:

- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Production branch: `main`

Create a D1 database, expose its ID to the build as
`CLOUDFLARE_D1_DATABASE_ID`, and bind it to the Worker as `DB`. The optional
`CLOUDFLARE_D1_DATABASE_NAME` build variable defaults to the local preview
database name; set it to the real D1 database name in production. Database
migrations live in `drizzle/`.

## Environment variables

- `GEMINI_API_KEY` — generates and caches project bulletin narration
- `PORTFOLIO_SETUP_CODE` — a private, one-time code used only to establish the first Master Control password
- `CLOUDFLARE_D1_DATABASE_ID` — the production D1 database ID used during the cloud build
- `CLOUDFLARE_D1_DATABASE_NAME` — the production D1 database name used during the cloud build

Never commit `.env.local`; environment files are ignored by Git.
