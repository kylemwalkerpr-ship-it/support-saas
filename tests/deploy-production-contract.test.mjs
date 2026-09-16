import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOW_PATH = ".github/workflows/deploy.yml";
const DEPLOY_SCRIPT_PATH = "scripts/deploy-production.mjs";
const PRODUCTION_URL = "https://support.yousafeconsultancy.com/";
const WORKFLOW_NAME = "Deploy YouSafe Support SaaS";
const OFFICIAL_REF = "refs/heads/main";

function readRepoFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readRepoJson(relativePath) {
  return JSON.parse(readRepoFile(relativePath));
}

function activeWorkflowLines(workflowText) {
  return workflowText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.replace(/\s+#.*$/, ""));
}

function getStepBlocks(workflowText) {
  const lines = workflowText.split(/\r?\n/);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*- name:/.test(lines[index])) starts.push(index);
  }
  return starts.map((start, position) => {
    const end =
      position + 1 < starts.length ? starts[position + 1] : lines.length;
    return lines.slice(start, end).join("\n");
  });
}

function findStepBlock(workflowText, predicate) {
  return getStepBlocks(workflowText).find(predicate) ?? null;
}

function baseEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.GITHUB_ACTIONS;
  delete env.GITHUB_REF;
  delete env.GITHUB_WORKFLOW;
  delete env.CONTRACT_SENTINEL;
  return { ...env, ...overrides };
}

function runDeployScript({ env, stubExitCode = 0 }) {
  const dir = mkdtempSync(join(tmpdir(), "support-deploy-contract-"));
  const capturePath = join(dir, "npx-invocation.txt");
  const stubPath = join(dir, "npx");
  writeFileSync(
    stubPath,
    [
      "#!/bin/sh",
      `CAPTURE=${JSON.stringify(capturePath)}`,
      'printf "%s\\n" "$OPEN_NEXT_DEPLOY" "$CONTRACT_SENTINEL" > "$CAPTURE"',
      'printf "%s\\n" "$@" >> "$CAPTURE"',
      `exit ${stubExitCode}`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const result = spawnSync(
    process.execPath,
    [join(repoRoot, DEPLOY_SCRIPT_PATH)],
    {
      cwd: repoRoot,
      env: { ...env, PATH: `${dir}:${env.PATH ?? ""}` },
      encoding: "utf8",
    },
  );

  const captured = existsSync(capturePath)
    ? readFileSync(capturePath, "utf8")
    : null;
  rmSync(dir, { recursive: true, force: true });
  return { result, captured };
}

function assertDeployScriptExists() {
  assert.ok(
    existsSync(join(repoRoot, DEPLOY_SCRIPT_PATH)),
    `${DEPLOY_SCRIPT_PATH} must exist`,
  );
}

test("package.json pins devDependencies.wrangler to exactly 4.132.0", () => {
  const pkg = readRepoJson("package.json");
  assert.ok(pkg.devDependencies, "package.json must declare devDependencies");
  assert.equal(pkg.devDependencies.wrangler, "4.132.0");
});

test("package.json scripts.deploy runs node scripts/deploy-production.mjs", () => {
  const pkg = readRepoJson("package.json");
  assert.equal(pkg.scripts?.deploy, "node scripts/deploy-production.mjs");
});

test("package-lock.json resolves wrangler 4.132.0 for the root devDependency", () => {
  const lock = readRepoJson("package-lock.json");
  assert.equal(lock.packages[""]?.devDependencies?.wrangler, "4.132.0");
  assert.equal(lock.packages["node_modules/wrangler"]?.version, "4.132.0");
});

test("workflow no longer invokes opennextjs-cloudflare deploy or npm run deploy", () => {
  const lines = activeWorkflowLines(readRepoFile(WORKFLOW_PATH));
  const offenders = lines.filter(
    (line) =>
      /opennextjs-cloudflare\s+deploy/.test(line) ||
      /\bnpm run deploy\b/.test(line),
  );
  assert.deepEqual(
    offenders,
    [],
    "workflow must not run opennextjs-cloudflare deploy (directly or via npm run deploy)",
  );
});

test("workflow builds the OpenNext artifact with npm run pages:build", () => {
  const lines = activeWorkflowLines(readRepoFile(WORKFLOW_PATH));
  assert.ok(
    lines.some((line) => /npm run pages:build/.test(line)),
    "workflow must run `npm run pages:build`",
  );
});

test("workflow deploy step is gated to non-pull_request events", () => {
  const deployStep = findStepBlock(readRepoFile(WORKFLOW_PATH), (block) =>
    block.includes("node scripts/deploy-production.mjs"),
  );
  assert.ok(
    deployStep,
    "workflow must deploy via node scripts/deploy-production.mjs",
  );
  assert.match(
    deployStep,
    /if:\s*github\.event_name\s*!=\s*'pull_request'/,
    "deploy step must be gated to non-PR events",
  );
});

test("workflow retries deployment three times, backs off 30s then 60s, then exits 1", () => {
  const deployStep = findStepBlock(readRepoFile(WORKFLOW_PATH), (block) =>
    block.includes("node scripts/deploy-production.mjs"),
  );
  assert.ok(
    deployStep,
    "workflow must deploy via node scripts/deploy-production.mjs",
  );
  assert.match(
    deployStep,
    /for attempt in 1 2 3\b/,
    "expected exactly three bounded deploy attempts",
  );
  const firstBackoff = deployStep.indexOf("sleep 30");
  const secondBackoff = deployStep.indexOf("sleep 60");
  assert.notEqual(firstBackoff, -1, "expected a 30s backoff for the first retry");
  assert.notEqual(
    secondBackoff,
    -1,
    "expected a 60s backoff for the second retry",
  );
  assert.ok(
    firstBackoff < secondBackoff,
    "expected the 30s backoff before the 60s backoff",
  );
  const exhausted = deployStep.indexOf("Deployment failed after 3 attempts");
  const explicitExit = deployStep.indexOf("exit 1");
  assert.notEqual(exhausted, -1, "expected an explicit exhaustion message");
  assert.notEqual(
    explicitExit,
    -1,
    "expected an explicit exit 1 after exhausted attempts",
  );
  assert.ok(
    exhausted < explicitExit,
    "exit 1 must follow the exhaustion message",
  );
});

test("workflow smoke-checks the production URL after deploy and fails closed", () => {
  const blocks = getStepBlocks(readRepoFile(WORKFLOW_PATH));
  const deployIndex = blocks.findIndex((block) =>
    block.includes("node scripts/deploy-production.mjs"),
  );
  assert.notEqual(
    deployIndex,
    -1,
    "workflow must deploy via node scripts/deploy-production.mjs",
  );
  const smokeIndex = blocks.findIndex(
    (block) => /smoke/i.test(block) && block.includes(PRODUCTION_URL),
  );
  assert.notEqual(
    smokeIndex,
    -1,
    `expected a smoke step hitting ${PRODUCTION_URL}`,
  );
  assert.ok(smokeIndex > deployIndex, "smoke check must run after deploy");
  const smokeStep = blocks[smokeIndex];
  assert.match(smokeStep, /curl\b/, "smoke check must use curl");
  assert.match(
    smokeStep,
    /if:\s*github\.event_name\s*!=\s*'pull_request'/,
    "smoke check must only run for real deployments",
  );
  assert.match(smokeStep, /exit 1/, "smoke check must fail closed");
});

test("deploy script exists", () => {
  assertDeployScriptExists();
});

test("deploy script blocks non-GitHub context before invoking wrangler", () => {
  assertDeployScriptExists();
  const contexts = [
    { label: "GITHUB_ACTIONS unset", env: baseEnv() },
    { label: "GITHUB_ACTIONS=false", env: baseEnv({ GITHUB_ACTIONS: "false" }) },
  ];
  for (const context of contexts) {
    const { result, captured } = runDeployScript({
      env: context.env,
      stubExitCode: 0,
    });
    assert.notEqual(
      result.status,
      0,
      `expected nonzero exit for ${context.label}`,
    );
    assert.equal(captured, null, `wrangler must not run for ${context.label}`);
  }
});

test("deploy script blocks non-main refs before invoking wrangler", () => {
  assertDeployScriptExists();
  const { result, captured } = runDeployScript({
    env: baseEnv({
      GITHUB_ACTIONS: "true",
      GITHUB_REF: "refs/heads/release",
      GITHUB_WORKFLOW: WORKFLOW_NAME,
    }),
  });
  assert.notEqual(result.status, 0, "expected nonzero exit for a non-main ref");
  assert.equal(captured, null, "wrangler must not run for a non-main ref");
});

test("deploy script blocks unexpected workflow names before invoking wrangler", () => {
  assertDeployScriptExists();
  const { result, captured } = runDeployScript({
    env: baseEnv({
      GITHUB_ACTIONS: "true",
      GITHUB_REF: OFFICIAL_REF,
      GITHUB_WORKFLOW: "Build Only",
    }),
  });
  assert.notEqual(
    result.status,
    0,
    "expected nonzero exit for an unexpected workflow name",
  );
  assert.equal(
    captured,
    null,
    "wrangler must not run for an unexpected workflow name",
  );
});

test("official context invokes local npx wrangler deploy with OPEN_NEXT_DEPLOY=true and inherited env", () => {
  assertDeployScriptExists();
  const { result, captured } = runDeployScript({
    env: baseEnv({
      GITHUB_ACTIONS: "true",
      GITHUB_REF: OFFICIAL_REF,
      GITHUB_WORKFLOW: WORKFLOW_NAME,
      CONTRACT_SENTINEL: "inherited-value",
    }),
    stubExitCode: 0,
  });
  assert.equal(
    result.status,
    0,
    "official context must exit 0 when wrangler succeeds",
  );
  assert.ok(captured, "expected npx to be invoked in official context");
  const invocation = captured.split(/\r?\n/);
  assert.equal(invocation[0], "true", "OPEN_NEXT_DEPLOY must be true");
  assert.equal(
    invocation[1],
    "inherited-value",
    "child process must inherit the parent environment",
  );
  assert.equal(
    invocation[2],
    "wrangler",
    "first npx argument must select wrangler",
  );
  assert.equal(invocation[3], "deploy", "second npx argument must be deploy");
});

test("deploy script propagates nonzero wrangler status", () => {
  assertDeployScriptExists();
  const { result } = runDeployScript({
    env: baseEnv({
      GITHUB_ACTIONS: "true",
      GITHUB_REF: OFFICIAL_REF,
      GITHUB_WORKFLOW: WORKFLOW_NAME,
    }),
    stubExitCode: 7,
  });
  assert.equal(result.status, 7, "script must propagate the child exit status");
});
