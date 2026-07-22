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

Deployment metadata lives in `.openai/hosting.json`, and database migrations
live in `drizzle/`.

## Environment variables

- `GEMINI_API_KEY` — generates and caches project bulletin narration
- `PORTFOLIO_OWNER_EMAIL` — identifies who may initialize Master Control in production

Never commit `.env.local`; environment files are ignored by Git.
