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

- Build command: leave blank, or use `npm run pages:build`
- Deploy command: `npx wrangler deploy`

`wrangler.toml` defines a custom build command, so `npx wrangler deploy` generates `.open-next/` before uploading. The OpenNext config intentionally uses `open-next.cloudflare.config.ts` so Wrangler does not bypass its custom build step by auto-delegating directly to `opennextjs-cloudflare deploy`.
