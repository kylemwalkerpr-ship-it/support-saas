# Support SaaS

Next.js application deployed to Cloudflare Workers with OpenNext.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run pages:build
```

This runs `opennextjs-cloudflare build`, which first creates the optimized Next.js production build and then adapts it into the `.open-next/` Worker bundle used by Wrangler.

## Deploy

```bash
npm run deploy
```

For Cloudflare Workers Builds, use these commands:

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

The deploy step expects the compiled OpenNext config and Worker bundle from the build step. Running only `npx wrangler deploy` in a fresh build environment fails before upload because `.open-next/` has not been generated yet.
