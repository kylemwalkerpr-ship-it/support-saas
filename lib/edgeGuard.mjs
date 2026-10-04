// Edge guard for the support Worker (Sanitization Brief Phases 5-6).
// Plain ESM (not TS) so `node --test` can import it. Mirrors portal
// lib/edgeGuard.ts: native rate limiting for sensitive mutating endpoints and
// redaction of internal diagnostics from /api error bodies. Missing bindings
// fail open. Wrapped around the OpenNext handler by edge-worker.mjs.
const MUTATING = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RATE_RULES = [
  {
    // Public customer chat widget: unauthenticated, AI-backed, writes rows.
    binding: "RL_WIDGET",
    bucket: "widget",
    test: (p) => p === "/api/chat/widget"
  },
  {
    binding: "RL_TRANSLATE",
    bucket: "translate",
    test: (p) => p === "/api/translate" || p.startsWith("/api/translate/")
  },
  {
    // Staff write actions (refunds, replies, moderation, macros, roles).
    binding: "RL_STAFF",
    bucket: "staff",
    test: (p) => p.startsWith("/api/support/")
  }
];
function matchRateRule(method, pathname) {
  if (!MUTATING.has(method.toUpperCase())) return null;
  if (!pathname.startsWith("/api/")) return null;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const rule of RATE_RULES) if (rule.test(p)) return rule;
  return null;
}
const YOUSAFE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*yousafeconsultancy\.com$/;
function corsFor(request) {
  const origin = request.headers.get("origin") || "";
  return YOUSAFE_ORIGIN.test(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
const TOO_MANY_MESSAGE = "Too many requests. Please wait a minute and try again.";
async function rateLimitRequest(request, env) {
  let rule = null;
  try {
    rule = matchRateRule(request.method, new URL(request.url).pathname);
  } catch {
    return null;
  }
  if (!rule) return null;
  const binding = env?.[rule.binding];
  if (!binding || typeof binding.limit !== "function") return null;
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
  try {
    const { success } = await binding.limit({ key: `${rule.bucket}:${ip}` });
    if (success) return null;
  } catch {
    return null;
  }
  return new Response(JSON.stringify({ error: TOO_MANY_MESSAGE, data: null, meta: { retryAfter: 60 } }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      ...corsFor(request)
    }
  });
}
const GENERIC_ERROR = "Something went wrong. Please try again.";
const INTERNAL_PATTERNS = [
  /invalid input syntax for/i,
  /violates (foreign key|unique|check|not-null|exclusion|row-level security)/i,
  /duplicate key value/i,
  /\brelation "[^"]+" does not exist/i,
  /\bcolumn "?[\w.]+"? (of relation "[^"]+" )?does not exist/i,
  /could not find the .+ in the schema cache/i,
  /syntax error at or near/i,
  /permission denied for (table|schema|relation|function|sequence)/i,
  /\bPGRST\d{3}\b/,
  /JSON object requested, multiple \(or no\) rows returned/i,
  /Cannot coerce the result to a single JSON object/i,
  /\bfunction [\w.]+\(.*\) does not exist/i,
  /\bnull value in column\b/i,
  /value too long for type/i,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|EvalError)\b/,
  /Cannot read propert(y|ies) of/i,
  /\bis not a function\b/i,
  /\bis not defined\b/i,
  /Unexpected (token|end of JSON input)/i,
  /is not valid JSON/i,
  /\n\s+at\s+\S.*:\d+:\d+/,
  /\bat\s+[\w$.<>]+\s+\((?:file:|\/|[A-Za-z]:\\|webpack|node:)/,
  /\/var\/task\/|\/home\/runner\/|node_modules\/|\.open-next\/|webpack-internal:|\.next\/server\//i,
  /\bfetch failed\b/i,
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/,
  /\bD1_(ERROR|EXEC_ERROR|TYPE_ERROR)\b|\bSQLITE_[A-Z]+\b/,
  /\b[a-z0-9]{20}\.supabase\.co\b/i,
  /\bservice[_ ]role\b/i,
  /\bjwt (expired|malformed)\b|\binvalid signature\b/i,
  /Network connection lost|Worker exceeded|exceeded (CPU|resource) limits?/i
];
function looksInternal(text) {
  if (!text) return false;
  return INTERNAL_PATTERNS.some((re) => re.test(text));
}
const PG_CODE = /^(PGRST\d{3}|[0-9]{2}[0-9A-Z]{3})$/;
const DROP_KEYS = /* @__PURE__ */ new Set(["stack", "stacktrace", "hint", "sql", "query", "trace"]);
function redactValue(value, depth = 0) {
  if (depth > 8) return [value, false];
  if (typeof value === "string") return looksInternal(value) ? [GENERIC_ERROR, true] : [value, false];
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const [nv, c] = redactValue(v, depth + 1);
      changed ||= c;
      return nv;
    });
    return [out, changed];
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (DROP_KEYS.has(key) && v != null && v !== "") {
        changed = true;
        continue;
      }
      if (key === "code" && typeof v === "string" && PG_CODE.test(v)) {
        changed = true;
        continue;
      }
      if ((key === "details" || key === "detail") && typeof v === "string" && looksInternal(v)) {
        changed = true;
        continue;
      }
      const [nv, c] = redactValue(v, depth + 1);
      changed ||= c;
      out[k] = nv;
    }
    return [out, changed];
  }
  return [value, false];
}
const MAX_INSPECT_BYTES = 64 * 1024;
async function redactErrorResponse(request, response) {
  if (response.status < 400) return response;
  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return response;
  }
  if (!pathname.startsWith("/api/")) return response;
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  const isJson = ct.includes("json");
  const isText = ct.startsWith("text/plain") || ct === "";
  if (!isJson && !isText) return response;
  if (ct.includes("event-stream")) return response;
  const len = Number(response.headers.get("content-length") || "0");
  if (len > MAX_INSPECT_BYTES) return response;
  if (!response.body) return response;
  let text;
  try {
    text = await response.text();
  } catch {
    return new Response(JSON.stringify({ error: GENERIC_ERROR }), {
      status: response.status,
      headers: response.headers
    });
  }
  let out = text;
  if (text.length <= MAX_INSPECT_BYTES) {
    if (isJson) {
      try {
        const [redacted, changed] = redactValue(JSON.parse(text));
        if (changed) out = JSON.stringify(redacted);
      } catch {
        if (looksInternal(text)) out = JSON.stringify({ error: GENERIC_ERROR });
      }
    } else if (looksInternal(text)) {
      out = GENERIC_ERROR;
    }
  }
  const headers = new Headers(response.headers);
  if (out !== text) {
    console.error("[edge-guard] redacted internal error detail", response.status, pathname, text.slice(0, 500));
    headers.delete("content-length");
  }
  return new Response(out, { status: response.status, statusText: response.statusText, headers });
}
export {
  GENERIC_ERROR,
  RATE_RULES,
  TOO_MANY_MESSAGE,
  looksInternal,
  matchRateRule,
  rateLimitRequest,
  redactErrorResponse,
  redactValue
};
