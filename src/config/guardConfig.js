// Reads and validates the guard settings once, when the app starts.
// dotenv must already be loaded (it is the first line of app.js).
const MODES = ["off", "monitor", "enforce"];
const FAIL_MODES = ["open", "closed"];

function loadGuardConfig() {
  const mode = (process.env.GUARD_MODE || "enforce").trim().toLowerCase();
  const failMode = (process.env.GUARD_FAIL_MODE || "closed").trim().toLowerCase();
  const url = (process.env.GUARD_URL || "").trim().replace(/\/+$/, ""); // no trailing slash
  const key = (process.env.GUARD_KEY || "").trim();
  const timeoutMs = Number(process.env.GUARD_TIMEOUT_MS || 3000);

  if (!MODES.includes(mode)) {
    throw new Error(`GUARD_MODE must be one of: ${MODES.join(", ")} (got "${mode}")`);
  }
  if (!FAIL_MODES.includes(failMode)) {
    throw new Error(`GUARD_FAIL_MODE must be one of: ${FAIL_MODES.join(", ")} (got "${failMode}")`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("GUARD_TIMEOUT_MS must be a positive number");
  }
  // Refuse to start silently unprotected
  if (mode !== "off" && (!url || !key)) {
    throw new Error("GUARD_URL and GUARD_KEY are required unless GUARD_MODE=off");
  }

  // Never print the key
  console.log(`[guard] mode=${mode} failMode=${failMode} url=${url || "-"} timeout=${timeoutMs}ms`);

  return Object.freeze({ mode, failMode, url, key, timeoutMs });
}

module.exports = loadGuardConfig();