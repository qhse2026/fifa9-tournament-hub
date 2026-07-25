import { TRACKS, getTrack } from "../tracks/index.js";
import { RaceSession, formatTime } from "./race-session.js?v=45.0.2";
import {
  getDriverName,
  setDriverName,
  getLocalRecord,
  fetchLeaderboard
} from "../cloud/leaderboard-service.js";

const STATE_KEY = "fifa9_formula_reborn_v45_state";

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  selectedTrackId: "oruc-reis-coastal",
  activeTab: "challenge",
  metric: "lap",
  playerName: "",
  settings: {
    camera: "chase",
    abs: true,
    tractionControl: "medium",
    racingLine: "corners",
    steeringAssist: "low",
    brakeAssist: "off",
    cameraShake: "low",
    quality: "auto",
    audioMuted: false,
    ghost: "personal"
  },
  statistics: {
    attempts: 0,
    completedSessions: 0,
    cleanLaps: 0
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    return {
      ...clone(DEFAULT_STATE),
      ...saved,
      settings: { ...clone(DEFAULT_STATE.settings), ...(saved.settings || {}) },
      statistics: { ...clone(DEFAULT_STATE.statistics), ...(saved.statistics || {}) }
    };
  } catch {
    return clone(DEFAULT_STATE);
  }
}

const state = loadState();
let host = null;
let activeRace = null;
let leaderboardRows = [];
let leaderboardStatus = "idle";
let lastError = "";

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function track() {
  return getTrack(state.selectedTrackId);
}

function stars(value) {
  return "★".repeat(value) + "☆".repeat(Math.max(0, 5 - value));
}

function localRecord(trackId) {
  return getLocalRecord(trackId) || {};
}

function tabButton(id, label) {
  return `<button type="button" class="${state.activeTab === id ? "active" : ""}" data-fr45-action="tab" data-tab="${id}">${label}</button>`;
}

function circuitCards() {
  return TRACKS.map(item => {
    const record = localRecord(item.id);
    return `<button type="button" class="fr45-circuit-card ${item.id === state.selectedTrackId ? "active" : ""}"
      data-fr45-action="select-track" data-track="${item.id}" style="--fr45-accent:${item.accent}">
      <span>${String(TRACKS.indexOf(item) + 1).padStart(2, "0")}</span>
      <div>
        <strong>${esc(item.shortName)}</strong>
        <small>${esc(item.category)} · ${esc(item.location)}</small>
      </div>
      <em>${stars(item.difficulty)}</em>
      <footer>
        <b>${record.bestLapMs ? formatTime(record.bestLapMs) : "NO LAP"}</b>
        <small>${record.fiveLapTotalMs ? formatTime(record.fiveLapTotalMs) : "NO 5-LAP RESULT"}</small>
      </footer>
    </button>`;
  }).join("");
}

function trackHero(item) {
  const record = localRecord(item.id);
  return `<section class="fr45-track-hero" style="--fr45-accent:${item.accent};--fr45-sky:${item.sky}">
    <div>
      <span>PHASE 1 MASTERPIECE CIRCUIT</span>
      <h2>${esc(item.name)}</h2>
      <p>${esc(item.description)}</p>
      <div class="fr45-track-meta">
        <article><small>CATEGORY</small><b>${esc(item.category)}</b></article>
        <article><small>DIFFICULTY</small><b>${stars(item.difficulty)}</b></article>
        <article><small>WIDTH</small><b>${item.width.toFixed(1)} m</b></article>
        <article><small>OFFICIAL SESSION</small><b>5 LAPS</b></article>
      </div>
    </div>
    <aside>
      <article><small>PERSONAL FASTEST LAP</small><strong>${record.bestLapMs ? formatTime(record.bestLapMs) : "—"}</strong></article>
      <article><small>PERSONAL FIVE-LAP TOTAL</small><strong>${record.fiveLapTotalMs ? formatTime(record.fiveLapTotalMs) : "—"}</strong></article>
      <article><small>ATTEMPTS</small><strong>${record.attempts || 0}</strong></article>
    </aside>
  </section>`;
}

function challengeView() {
  const item = track();
  return `<section class="fr45-view">
    ${trackHero(item)}
    <section class="fr45-challenge-grid">
      <div class="fr45-briefing">
        <header><span>PRE-RACE BRIEFING</span><h3>Official Five-Lap Challenge</h3></header>
        <div class="fr45-signature-list">
          ${item.signatureSections.map(section => `<article>
            <span>${esc(section.name)}</span>
            <b>${esc(section.type.replaceAll("-", " ").toUpperCase())}</b>
            <small>Target ${section.targetSpeedKph} km/h</small>
          </article>`).join("")}
        </div>
        <div class="fr45-driving-tips">
          <strong>ENGINEER NOTES</strong>
          ${item.drivingTips.map(tip => `<p>• ${esc(tip)}</p>`).join("")}
        </div>
      </div>

      <div class="fr45-session-setup">
        <header><span>SESSION CONFIGURATION</span><h3>Driver & Assists</h3></header>
        <label><span>DRIVER NAME</span><input id="fr45DriverName" maxlength="40" value="${esc(getDriverName(state.playerName))}" /></label>
        <div class="fr45-setting-grid">
          ${selectSetting("camera", "CAMERA", [
            ["chase", "Chase"],
            ["close", "Close Chase"],
            ["nose", "Cockpit Lite"]
          ])}
          ${selectSetting("ghost", "GHOST", [
            ["personal", "Personal Best"],
            ["none", "No Ghost"]
          ])}
          ${selectSetting("tractionControl", "TRACTION CONTROL", [
            ["full", "Full"],
            ["medium", "Medium"],
            ["off", "Off"]
          ])}
          ${selectSetting("steeringAssist", "STEERING ASSIST", [
            ["low", "Low"],
            ["off", "Off"]
          ])}
          ${selectSetting("brakeAssist", "BRAKE ASSIST", [
            ["off", "Off"],
            ["low", "Low"]
          ])}
          ${selectSetting("cameraShake", "CAMERA SHAKE", [
            ["off", "Off"],
            ["low", "Low"],
            ["standard", "Standard"]
          ])}
          ${selectSetting("quality", "QUALITY", [
            ["auto", "Auto"],
            ["performance", "Performance"],
            ["balanced", "Balanced"],
            ["quality", "Quality"]
          ])}
          <label class="fr45-toggle-setting">
            <span>ABS</span>
            <input type="checkbox" data-fr45-setting="abs" ${state.settings.abs ? "checked" : ""} />
            <b>${state.settings.abs ? "ON" : "OFF"}</b>
          </label>
        </div>
        <button type="button" class="fr45-start-button" data-fr45-action="start-race">
          <span>START OFFICIAL SESSION</span>
          <strong>5 LAPS · ${esc(item.shortName)}</strong>
        </button>
      </div>
    </section>

    <section class="fr45-controls-guide">
      <article><b>W / ↑</b><span>Throttle</span></article>
      <article><b>S / ↓</b><span>Brake</span></article>
      <article><b>A D / ← →</b><span>Steering</span></article>
      <article><b>C</b><span>Change Camera</span></article>
      <article><b>R</b><span>Controlled Reset</span></article>
      <article><b>ESC</b><span>Pause</span></article>
    </section>

    <header class="fr45-section-title"><div><span>PHASE 1</span><h3>Three Masterpiece Circuits</h3></div><small>The remaining 22 circuits unlock only after the engine passes every acceptance gate.</small></header>
    <div class="fr45-circuit-grid">${circuitCards()}</div>
  </section>`;
}

function selectSetting(key, label, options) {
  const selected = state.settings[key];
  return `<label><span>${label}</span><select data-fr45-setting="${key}">
    ${options.map(([value, title]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${title}</option>`).join("")}
  </select></label>`;
}

function recordsView() {
  const item = track();
  return `<section class="fr45-view">
    ${trackHero(item)}
    <section class="fr45-record-toolbar">
      <div><span>GLOBAL RECORDS</span><h3>${esc(item.name)}</h3></div>
      <div class="fr45-metric-switch">
        <button type="button" class="${state.metric === "lap" ? "active" : ""}" data-fr45-action="metric" data-metric="lap">FASTEST LAP</button>
        <button type="button" class="${state.metric === "total" ? "active" : ""}" data-fr45-action="metric" data-metric="total">FIVE-LAP TOTAL</button>
      </div>
      <button type="button" data-fr45-action="refresh-records">↻ REFRESH</button>
    </section>
    <div class="fr45-leaderboard">${leaderboardMarkup()}</div>
    <header class="fr45-section-title"><div><span>CHANGE CIRCUIT</span><h3>Phase 1 Circuits</h3></div></header>
    <div class="fr45-circuit-grid">${circuitCards()}</div>
  </section>`;
}

function leaderboardMarkup() {
  if (leaderboardStatus === "loading") {
    return `<div class="fr45-empty-state"><strong>Loading global records…</strong></div>`;
  }
  if (leaderboardStatus === "error") {
    return `<div class="fr45-empty-state warning"><strong>Global records unavailable</strong><span>${esc(lastError)}</span><small>Local records remain available.</small></div>`;
  }
  if (!leaderboardRows.length) {
    return `<div class="fr45-empty-state"><strong>No official result yet</strong><span>Complete the first five-lap session on this circuit.</span></div>`;
  }
  return `<div class="fr45-record-table">
    <header><span>POS</span><b>DRIVER</b><em>TIME</em><small>PLATFORM</small><small>STATUS</small></header>
    ${leaderboardRows.map(row => `<article>
      <span>${row.rank || "—"}</span>
      <b>${esc(row.player_name || "Driver")}${row.verified ? "<i>VERIFIED</i>" : ""}</b>
      <em>${formatTime(row.time_ms)}</em>
      <small>${esc(row.platform || "—")} · ${esc(row.control_type || "—")}</small>
      <small class="${row.review_status === "accepted" ? "accepted" : "review"}">${esc(row.review_status || "local")}</small>
    </article>`).join("")}
  </div>`;
}

function settingsView() {
  return `<section class="fr45-view">
    <section class="fr45-settings-hero">
      <span>DRIVING SETTINGS</span>
      <h2>Build your driving profile</h2>
      <p>Official results store assist and control metadata. The vehicle specification remains equal for every player.</p>
    </section>
    <section class="fr45-settings-panel">
      <div class="fr45-setting-grid large">
        ${selectSetting("camera", "CAMERA", [["chase","Chase"],["close","Close Chase"],["nose","Cockpit Lite"]])}
        ${selectSetting("ghost", "PERSONAL GHOST", [["personal","Enabled"],["none","Disabled"]])}
        ${selectSetting("tractionControl", "TRACTION CONTROL", [["full","Full"],["medium","Medium"],["off","Off"]])}
        ${selectSetting("steeringAssist", "STEERING ASSIST", [["low","Low"],["off","Off"]])}
        ${selectSetting("brakeAssist", "BRAKE ASSIST", [["off","Off"],["low","Low"]])}
        ${selectSetting("cameraShake", "CAMERA SHAKE", [["off","Off"],["low","Low"],["standard","Standard"]])}
        ${selectSetting("quality", "GRAPHICS QUALITY", [["auto","Auto"],["performance","Performance"],["balanced","Balanced"],["quality","Quality"]])}
        <label class="fr45-toggle-setting">
          <span>ANTI-LOCK BRAKES</span>
          <input type="checkbox" data-fr45-setting="abs" ${state.settings.abs ? "checked" : ""} />
          <b>${state.settings.abs ? "ON" : "OFF"}</b>
        </label>
        <label class="fr45-toggle-setting">
          <span>AUDIO</span>
          <input type="checkbox" data-fr45-setting="audioMuted" ${state.settings.audioMuted ? "" : "checked"} />
          <b>${state.settings.audioMuted ? "MUTED" : "ON"}</b>
        </label>
      </div>
    </section>
  </section>`;
}

function statsView() {
  const rows = TRACKS.map(item => {
    const record = localRecord(item.id);
    return `<article>
      <div><strong>${esc(item.shortName)}</strong><small>${esc(item.category)}</small></div>
      <b>${record.bestLapMs ? formatTime(record.bestLapMs) : "—"}</b>
      <b>${record.fiveLapTotalMs ? formatTime(record.fiveLapTotalMs) : "—"}</b>
      <span>${record.attempts || 0}</span>
    </article>`;
  }).join("");
  return `<section class="fr45-view">
    <section class="fr45-settings-hero">
      <span>DRIVER STATISTICS</span>
      <h2>${esc(getDriverName(state.playerName))}</h2>
      <p>Formula Horizon Reborn V45 local career passport.</p>
    </section>
    <div class="fr45-stat-kpis">
      <article><small>ATTEMPTS</small><strong>${state.statistics.attempts}</strong></article>
      <article><small>COMPLETED SESSIONS</small><strong>${state.statistics.completedSessions}</strong></article>
      <article><small>CLEAN LAPS</small><strong>${state.statistics.cleanLaps}</strong></article>
      <article><small>MASTERPIECE CIRCUITS</small><strong>3</strong></article>
    </div>
    <section class="fr45-driver-table">
      <header><b>CIRCUIT</b><span>FASTEST LAP</span><span>FIVE-LAP TOTAL</span><span>ATTEMPTS</span></header>
      ${rows}
    </section>
  </section>`;
}

function render() {
  if (!host) return;
  document.body.classList.remove("fr45-race-active");
  const content =
    state.activeTab === "records" ? recordsView() :
    state.activeTab === "settings" ? settingsView() :
    state.activeTab === "stats" ? statsView() :
    challengeView();

  host.innerHTML = `<section class="fr45-app" data-no-translate>
    <header class="fr45-main-hero">
      <div>
        <span>V45.0.0 · PHASE 1</span>
        <h1>FORMULA HORIZON <b>REBORN</b></h1>
        <p>Real WebGL track geometry, braking-dependent physics and global five-lap competition.</p>
      </div>
      <aside><strong>3</strong><span>MASTERPIECE CIRCUITS</span></aside>
    </header>
    <nav class="fr45-tabs">
      ${tabButton("challenge", "CHALLENGE HUB")}
      ${tabButton("records", "GLOBAL RECORDS")}
      ${tabButton("settings", "DRIVING SETTINGS")}
      ${tabButton("stats", "DRIVER STATISTICS")}
    </nav>
    ${content}
  </section>`;

  bindHostEvents();
  if (state.activeTab === "records" && leaderboardStatus === "idle") loadLeaderboard();
}

function bindHostEvents() {
  host.onclick = async event => {
    const button = event.target.closest("[data-fr45-action]");
    if (!button) return;
    const action = button.dataset.fr45Action;

    if (action === "tab") {
      state.activeTab = button.dataset.tab || "challenge";
      saveState();
      render();
      return;
    }
    if (action === "select-track") {
      state.selectedTrackId = button.dataset.track;
      leaderboardStatus = "idle";
      leaderboardRows = [];
      saveState();
      render();
      return;
    }
    if (action === "metric") {
      state.metric = button.dataset.metric === "total" ? "total" : "lap";
      leaderboardStatus = "idle";
      leaderboardRows = [];
      saveState();
      render();
      return;
    }
    if (action === "refresh-records") {
      await loadLeaderboard();
      return;
    }
    if (action === "start-race") {
      await startRace();
    }
  };

  host.onchange = event => {
    const setting = event.target.dataset.fr45Setting;
    if (!setting) return;
    if (event.target.type === "checkbox") {
      if (setting === "audioMuted") state.settings[setting] = !event.target.checked;
      else state.settings[setting] = event.target.checked;
    } else {
      state.settings[setting] = event.target.value;
    }
    saveState();
    render();
  };
}

async function startRace() {
  const input = host.querySelector("#fr45DriverName");
  const playerName = setDriverName(input?.value || getDriverName(state.playerName));
  if (playerName.length < 2) {
    showToast("Driver name must contain at least two characters.", "error");
    return;
  }
  state.playerName = playerName;
  state.statistics.attempts += 1;
  saveState();

  document.body.classList.add("fr45-race-active");
  host.innerHTML = `<div class="fr45-loading-screen"><span>INITIALISING WEBGL</span><strong>${esc(track().name)}</strong><p>Building track geometry and official car physics…</p></div>`;

  try {
    activeRace = new RaceSession({
      root: host,
      track: track(),
      settings: state.settings,
      playerName,
      onExit: () => {
        activeRace = null;
        render();
      },
      onComplete: ({ payload }) => {
        state.statistics.completedSessions += 1;
        state.statistics.cleanLaps += Number(payload.validLapCount || 0);
        saveState();
      }
    });
    activeRace.onReplacement = replacement => {
      activeRace = replacement;
    };
    await activeRace.mount();
  } catch (error) {
    console.error("Formula Horizon Reborn failed to initialise", error);
    document.body.classList.remove("fr45-race-active");
    host.innerHTML = `<section class="fr45-webgl-error">
      <span>WEBGL INITIALISATION FAILED</span>
      <h2>Formula Horizon Reborn could not start</h2>
      <p>${esc(error?.message || error)}</p>
      <button type="button" data-fr45-action="return-hub">Return to Hub</button>
    </section>`;
    host.onclick = event => {
      if (event.target.closest('[data-fr45-action="return-hub"]')) render();
    };
  }
}

async function loadLeaderboard() {
  leaderboardStatus = "loading";
  render();
  const response = await fetchLeaderboard(state.selectedTrackId, state.metric);
  leaderboardStatus = response.status === "error" ? "error" : "ready";
  leaderboardRows = response.rows || [];
  lastError = response.error || "";
  if (state.activeTab === "records") render();
}

function showToast(message, type = "info") {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

export async function mount(target) {
  host = target;
  render();
}

export function stop() {
  activeRace?.dispose?.();
  activeRace = null;
  document.body.classList.remove("fr45-race-active");
}

export function dashboardCard() {
  const item = getTrack(state.selectedTrackId);
  const record = localRecord(item.id);
  return `<article class="experience-mode-card formula-mode-card" data-nav="formula1">
    <div class="experience-mode-icon">FR</div>
    <div>
      <span>FORMULA HORIZON REBORN</span>
      <h3>Three Masterpiece Circuits</h3>
      <p>Real WebGL driving, five-lap official sessions and global records.</p>
    </div>
    <footer><b>${record.bestLapMs ? formatTime(record.bestLapMs) : "V45.0.0"}</b><small>${record.bestLapMs ? "PERSONAL BEST" : "PHASE 1 READY"}</small></footer>
  </article>`;
}

export function getState() {
  return clone(state);
}
