#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const REQUIRED_WORKFLOW = "Deploy YouSafe Support SaaS";
const REQUIRED_REF = "refs/heads/main";

const violations = [];

if (process.env.GITHUB_ACTIONS !== "true") {
  violations.push(
    `GITHUB_ACTIONS must be exactly "true" (received: ${JSON.stringify(process.env.GITHUB_ACTIONS ?? null)})`,
  );
}
if (process.env.GITHUB_REF !== REQUIRED_REF) {
  violations.push(
    `GITHUB_REF must be exactly "${REQUIRED_REF}" (received: ${JSON.stringify(process.env.GITHUB_REF ?? null)})`,
  );
}
if (process.env.GITHUB_WORKFLOW !== REQUIRED_WORKFLOW) {
  violations.push(
    `GITHUB_WORKFLOW must be exactly "${REQUIRED_WORKFLOW}" (received: ${JSON.stringify(process.env.GITHUB_WORKFLOW ?? null)})`,
  );
}

if (violations.length > 0) {
  console.error(
    "Refusing to deploy: this script only runs in the official GitHub Actions production context.",
  );
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("Deploying YouSafe Support SaaS with local Wrangler...");
const child = spawnSync("npx", ["wrangler", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, OPEN_NEXT_DEPLOY: "true" },
});

if (child.error) {
  console.error(`Failed to start npx wrangler deploy: ${child.error.message}`);
  process.exit(1);
}

if (child.signal) {
  console.error(
    `npx wrangler deploy was terminated by signal ${child.signal}.`,
  );
  process.exit(1);
}

if (child.status !== 0) {
  console.error(`npx wrangler deploy exited with status ${child.status}.`);
  process.exit(child.status ?? 1);
}

console.log("npx wrangler deploy completed successfully.");
