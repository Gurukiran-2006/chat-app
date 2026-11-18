const config = require("../config/guardConfig");

const DECISIONS = ["allow", "flag", "block"];

const fail = (error) => ({ ok: false, error });
const isTimeout = (err) => err?.name === "TimeoutError" || err?.name === "AbortError";

// Always RESOLVES, never throws. The caller checks `result.ok`:
//   { ok: true, decision, risk, signals, flags, latencyMs, version, roundTripMs }
//   { ok: false, error }
async function scanText(text, { userId, conversationId } = {}) {
  const started = Date.now();

  let res;
  try {
    res = await fetch(`${config.url}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Guard-Key": config.key,
      },
      body: JSON.stringify({
        text,
        mode: config.mode, // fields that are undefined are dropped by JSON.stringify
        user_id: userId ? String(userId) : undefined,
        conversation_id: conversationId ? String(conversationId) : undefined,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (err) {
    if (isTimeout(err)) return fail(`guard timed out after ${config.timeoutMs} ms`);
    return fail("guard unreachable");
  }

  // A 401 means our key and the guard's key differ: a configuration bug, so be loud
  if (res.status === 401) {
    console.error("[guard] 401 Unauthorized: GUARD_KEY does not match the guard service key");
    return fail("guard rejected our key (configuration error)");
  }
  if (!res.ok) return fail(`guard returned HTTP ${res.status}`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    if (isTimeout(err)) return fail(`guard timed out after ${config.timeoutMs} ms`);
    return fail("guard returned invalid JSON");
  }

  // Don't trust a reply just because it arrived: check its shape
  if (!data || !DECISIONS.includes(data.decision) || typeof data.risk !== "number") {
    return fail("guard returned an unexpected response shape");
  }

  return {
    ok: true,
    decision: data.decision,
    risk: data.risk,
    signals: data.signals ?? {},
    flags: Array.isArray(data.flags) ? data.flags : [],
    latencyMs: typeof data.latency_ms === "number" ? data.latency_ms : null,
    version: data.version ?? null,
    roundTripMs: Date.now() - started,
  };
}

module.exports = { scanText };