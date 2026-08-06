(() => {
  "use strict";
  const MAIN_KEY = "fifa-tournament-hub-v1";
  const NONCRITICAL_KEYS = [
    "fifa10-sync-history-v1",
    "fifa-universe-v2-mode",
    "fifa-universe-v2-player",
    "fifa-universe-v2-passport-chart",
    "fifa10-schedule-minutes"
  ];

  const clone = value => {
    try { return structuredClone(value); } catch (_) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
  };

  function compactBlackBox(rows, level) {
    const source = Array.isArray(rows) ? rows : [];
    const limits = level === 1 ? { keep: 40, snapshots: 10 }
      : level === 2 ? { keep: 20, snapshots: 4 }
      : { keep: 8, snapshots: 1 };
    const selected = source.slice(-limits.keep);
    return selected.map((event, index) => {
      if (!event || typeof event !== "object") return event;
      const copy = { ...event };
      const distanceFromLatest = selected.length - 1 - index;
      if (distanceFromLatest >= limits.snapshots && copy.snapshot) {
        copy.snapshotDigest = {
          capturedAt: copy.snapshot?.capturedAt || copy.at || null,
          drawStatus: copy.snapshot?.draw?.status || null,
          championshipStatus: copy.snapshot?.championshipOS?.status || null,
          groupResults: copy.groupResults ?? null,
          championshipResults: copy.championshipResults ?? null
        };
        delete copy.snapshot;
      }
      return copy;
    });
  }

  function compactState(input, level = 1) {
    const state = clone(input);
    const draft = state?.seasonSystem?.fifa10Draft;
    if (!draft || typeof draft !== "object") return state;
    draft.blackBox = compactBlackBox(draft.blackBox, level);
    const forecastLimit = level === 1 ? 45 : level === 2 ? 20 : 8;
    const milestoneLimit = level === 1 ? 80 : level === 2 ? 35 : 15;
    if (Array.isArray(draft.forecastLedger)) draft.forecastLedger = draft.forecastLedger.slice(-forecastLimit);
    if (Array.isArray(draft.milestoneLedger)) draft.milestoneLedger = draft.milestoneLedger.slice(-milestoneLimit);
    return state;
  }

  function cleanupNonCritical() {
    NONCRITICAL_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
  }

  function write(key, value) {
    localStorage.setItem(key, value);
    return true;
  }

  function setMainState(state) {
    const attempts = [
      { level: 0, value: state },
      { level: 1, value: null },
      { level: 2, value: null },
      { level: 3, value: null }
    ];
    let lastError = null;
    for (let i = 0; i < attempts.length; i += 1) {
      try {
        if (i === 0) {
          write(MAIN_KEY, JSON.stringify(state));
        } else {
          if (i === 2) cleanupNonCritical();
          const compacted = compactState(state, attempts[i].level);
          write(MAIN_KEY, JSON.stringify(compacted));
          try {
            window.dispatchEvent(new CustomEvent("fifa:storage-compacted", { detail: { level: attempts[i].level } }));
          } catch (_) {}
        }
        return true;
      } catch (error) {
        lastError = error;
        if (!(error && (error.name === "QuotaExceededError" || error.code === 22 || /quota/i.test(String(error.message || error))))) {
          throw error;
        }
      }
    }
    console.error("QuotaSafe Storage could not persist main state after compaction.", lastError);
    return false;
  }

  function emergencyCompactCurrent() {
    try {
      const raw = localStorage.getItem(MAIN_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      cleanupNonCritical();
      return setMainState(compactState(parsed, 3));
    } catch (error) {
      console.warn("Emergency storage compaction skipped.", error);
      return false;
    }
  }

  window.FIFA_STORAGE_SAFE = {
    MAIN_KEY,
    setMainState,
    compactState,
    cleanupNonCritical,
    emergencyCompactCurrent
  };

  // Reclaim space once on boot if the persisted payload is already unusually large.
  try {
    const raw = localStorage.getItem(MAIN_KEY) || "";
    if (raw.length > 3_600_000) emergencyCompactCurrent();
  } catch (_) {}
})();
