import Vapi from "https://esm.sh/@vapi-ai/web@2";

const PUBLIC_KEY = "e1b402e2-b8f5-46fc-be4c-de9bc184dfaa";

const AGENTS = {
  ringhey: {
    id: "b5a15488-3f75-4b5d-81b1-3d00394ad94b",
    name: "Ringhey Agent",
    label: "AI voice agent",
    hint: "Ask about pricing, the portal, or how a voice agent would work for you. We’ll request microphone access when you start.",
    footer: "Demo · English · conversations may be recorded for quality testing.",
    initial: "",
  },
  salon: {
    id: "9e5238f2-1d13-4059-afcc-3bda98120037",
    name: "Salon Lena",
    label: "Hair salon demo · German",
    hint: "Try: “Ich hätte gern einen Termin am Samstag” or ask about prices. We’ll request microphone access when you start.",
    footer: "Demo · German · fictional salon",
    initial: "L",
  },
  electrician: {
    id: "2b94cbad-0160-4d6d-86d0-71a95baf1953",
    name: "Elektro Müller",
    label: "Tradesman demo · German",
    hint: "Try: “Meine Sicherung fliegt ständig raus” or ask about a wallbox. We’ll request microphone access when you start.",
    footer: "Demo · German · fictional electrician",
    initial: "M",
  },
};

const widget = document.getElementById("call-widget");
const dock = document.getElementById("call-dock");
const logEl = document.getElementById("call-log");
const hintEl = document.getElementById("call-hint");
const noteEl = document.querySelector(".call-note");
const fab = document.getElementById("talk-fab");
const dockOpen = document.getElementById("dock-open");
const startBtns = document.querySelectorAll("[data-vapi-start]");
const muteBtns = document.querySelectorAll("[data-vapi-mute]");
const endBtns = document.querySelectorAll("[data-vapi-end]");
const chips = document.querySelectorAll(".status-chip");
const vizBars = document.querySelectorAll(".viz-bars");
const tablist = document.getElementById("demo-tabs");
const tabs = tablist ? [...tablist.querySelectorAll("[role='tab']")] : [];

const vapi = new Vapi(PUBLIC_KEY);
let currentKey = "ringhey";
let pendingSwitch = null;
let switchTimer = 0;
let state = "idle";
let muted = false;
let volume = 0;
let rafId = 0;
let widgetInView = false;

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const agent = () => AGENTS[currentKey] || AGENTS.ringhey;
const inCall = () => state === "connecting" || state === "listening" || state === "speaking";

function extractRaw(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return (
    err?.error?.message ||
    err?.errorMsg ||
    err?.message ||
    err?.error?.msg ||
    err?.status ||
    ""
  );
}

function friendlyError(err) {
  const raw = String(extractRaw(err));
  if (/permission|not allowed|denied|microphone|NotAllowed/i.test(raw)) {
    return "Couldn’t start the call. Please allow microphone access and try again.";
  }
  if (/network|offline|failed to fetch|timeout/i.test(raw)) {
    return "Couldn’t start the call. Please check your connection and try again.";
  }
  return "Couldn’t start the call right now. Please try again in a moment.";
}

function statusMeta(next) {
  const a = agent();
  const map = {
    idle: { chip: "Ready", hint: a.hint },
    connecting: { chip: "Connecting", hint: "Connecting — please allow microphone access if asked." },
    listening: { chip: "Listening", hint: "We’re listening. Just start talking." },
    speaking: { chip: "Speaking", hint: `${a.name} is speaking.` },
    ended: { chip: "Ended", hint: "Call ended. Start again whenever you’re ready." },
    error: { chip: "Ended", hint: "Couldn’t start the call. Please allow microphone access and try again." },
  };
  return map[next] || map.idle;
}

function applyAgentUI() {
  const a = agent();
  document.querySelectorAll(".agent-name").forEach((el) => {
    el.textContent = a.name;
  });
  document.querySelectorAll(".agent-label").forEach((el) => {
    el.textContent = a.label;
  });
  if (noteEl) noteEl.textContent = a.footer;
  document.querySelectorAll(".agent-avatar").forEach((av) => {
    const img = av.querySelector("img");
    let initial = av.querySelector(".avatar-initial");
    if (!initial) {
      initial = document.createElement("span");
      initial.className = "avatar-initial";
      initial.setAttribute("aria-hidden", "true");
      av.append(initial);
    }
    if (a.initial) {
      av.dataset.initial = a.initial;
      initial.textContent = a.initial;
      initial.hidden = false;
      if (img) img.hidden = true;
    } else {
      delete av.dataset.initial;
      initial.textContent = "";
      initial.hidden = true;
      if (img) img.hidden = false;
    }
  });
  if (widget) widget.setAttribute("aria-labelledby", `tab-agent-${currentKey}`);
  tabs.forEach((tab) => {
    const selected = tab.dataset.agent === currentKey;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });
}

function setState(next, hint) {
  state = next;
  const meta = statusMeta(next);
  chips.forEach((chip) => {
    chip.dataset.state = next;
    chip.textContent = meta.chip;
  });
  if (widget) widget.dataset.state = next;
  if (dock) dock.dataset.state = next;
  if (hintEl) {
    hintEl.textContent = hint || meta.hint;
    hintEl.classList.toggle("is-error", next === "error");
  }
  syncUi();
  startVizLoop();
}

function syncUi() {
  const active = inCall();
  startBtns.forEach((btn) => {
    if (btn.id === "call-start") {
      btn.hidden = active;
      btn.disabled = state === "connecting";
    } else if (btn === fab) {
      btn.disabled = state === "connecting";
    }
  });
  muteBtns.forEach((btn) => {
    btn.disabled = !active || state === "connecting";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    const label = btn.querySelector("[data-mute-label]");
    if (label) label.textContent = muted ? "Unmute" : "Mute";
    if (!btn.getAttribute("aria-label") || btn.classList.contains("btn-icon")) {
      btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    }
  });
  endBtns.forEach((btn) => {
    btn.disabled = !active;
  });
  if (dock) {
    dock.classList.toggle("is-open", active);
    dock.classList.toggle("is-hidden-over-widget", active && widgetInView);
  }
  document.body.classList.toggle("call-active", active);
}

function scrollToWidget() {
  if (!widget) return;
  widget.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
}

function setMuted(next) {
  muted = Boolean(next);
  try {
    vapi.setMuted(muted);
  } catch {
    muted = false;
  }
  syncUi();
}

function applyVolume(level) {
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  volume = v;
  vizBars.forEach((el) => el.style.setProperty("--level", v.toFixed(3)));
  if (reduceMotion()) return;
  if (state === "speaking" || state === "listening") {
    const t = performance.now() / 160;
    elHeights(v, t);
  }
}

function elHeights(v, t) {
  vizBars.forEach((el) => {
    el.querySelectorAll("span").forEach((bar, i) => {
      const wave = 0.35 + 0.65 * Math.abs(Math.sin(t + i * 0.7));
      let h = 0.18;
      if (state === "speaking") h = Math.min(1, 0.22 + (0.25 + v * 0.75) * wave);
      else if (state === "listening") h = 0.16 + (0.12 + v * 0.3) * wave;
      bar.style.setProperty("--h", h.toFixed(3));
      if (!bar.getAnimations || !bar.getAnimations().length) {
        bar.style.transform = `scaleY(${h})`;
      }
    });
  });
}

function startVizLoop() {
  cancelAnimationFrame(rafId);
  if (reduceMotion()) return;
  if (state !== "speaking" && state !== "listening") return;
  const tick = (now) => {
    if (state !== "speaking" && state !== "listening") return;
    elHeights(volume, now / 160);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function appendTranscript(role, text) {
  if (!logEl || !text) return;
  const emptyHint = logEl.querySelector(".transcript-empty");
  if (emptyHint) emptyHint.remove();
  const row = document.createElement("div");
  const isAgent = role === "assistant";
  row.className = `bubble ${isAgent ? "bubble-agent" : "bubble-user"}`;
  const label = document.createElement("span");
  label.className = "bubble-label";
  label.textContent = isAgent ? agent().name : "You";
  const p = document.createElement("p");
  p.textContent = text;
  row.append(label, p);
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearTranscript() {
  if (logEl) logEl.replaceChildren();
}

function syncUrl(key) {
  try {
    const url = new URL(location.href);
    if (key === "ringhey") url.searchParams.delete("agent");
    else url.searchParams.set("agent", key);
    history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

function finishSwitch(key, updateUrl = true) {
  pendingSwitch = null;
  clearTimeout(switchTimer);
  if (!AGENTS[key]) return;
  currentKey = key;
  applyAgentUI();
  clearTranscript();
  muted = false;
  volume = 0;
  setState("idle");
  if (updateUrl) syncUrl(key);
}

function selectAgent(key, { updateUrl = true } = {}) {
  if (!AGENTS[key]) return;
  if (key === currentKey && !pendingSwitch) {
    applyAgentUI();
    return;
  }
  if (inCall()) {
    pendingSwitch = key;
    endCall();
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      if (pendingSwitch === key) finishSwitch(key, updateUrl);
    }, 2000);
    return;
  }
  finishSwitch(key, updateUrl);
}

async function startCall() {
  if (inCall()) {
    scrollToWidget();
    return;
  }
  muted = false;
  volume = 0;
  clearTranscript();
  setState("connecting");
  scrollToWidget();
  try {
    await vapi.start(agent().id);
  } catch (err) {
    console.error(err);
    setState("error", friendlyError(err));
  }
}

function endCall() {
  try {
    vapi.stop();
  } catch (err) {
    console.error(err);
    if (pendingSwitch) finishSwitch(pendingSwitch);
    else setState("ended");
  }
}

startBtns.forEach((btn) => btn.addEventListener("click", startCall));
muteBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (state === "listening" || state === "speaking") setMuted(!muted);
  })
);
endBtns.forEach((btn) =>
  btn.addEventListener("click", () => {
    if (inCall()) endCall();
  })
);
dockOpen?.addEventListener("click", scrollToWidget);

if (tablist) {
  tablist.addEventListener("click", (e) => {
    const tab = e.target.closest("[role='tab']");
    if (!tab || !tablist.contains(tab)) return;
    selectAgent(tab.dataset.agent);
  });
  tablist.addEventListener("keydown", (e) => {
    if (!tabs.length) return;
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].focus();
    selectAgent(tabs[next].dataset.agent);
  });
}

vapi.on("call-start", () => {
  setState("listening");
});

vapi.on("call-end", () => {
  muted = false;
  volume = 0;
  if (pendingSwitch) {
    finishSwitch(pendingSwitch);
    return;
  }
  setState("ended");
});

vapi.on("speech-start", () => {
  if (state === "listening" || state === "speaking") setState("speaking");
});

vapi.on("speech-end", () => {
  if (state === "speaking" || state === "listening") setState("listening");
});

vapi.on("volume-level", (vol) => {
  const level = typeof vol === "number" ? vol : vol?.volume ?? vol?.level ?? 0;
  applyVolume(level);
});

vapi.on("error", (event) => {
  console.error(event);
  muted = false;
  if (pendingSwitch) {
    finishSwitch(pendingSwitch);
    return;
  }
  setState("error", friendlyError(event));
});

vapi.on("message", (msg) => {
  if (msg?.type === "transcript" && msg.transcriptType === "final" && msg.transcript) {
    appendTranscript(msg.role, msg.transcript);
  }
});

if (widget && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      widgetInView = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.35);
      syncUi();
    },
    { threshold: [0, 0.35, 0.7] }
  );
  io.observe(widget);
}

const requested = new URLSearchParams(location.search).get("agent");
const startKey = AGENTS[requested] ? requested : "ringhey";
currentKey = startKey;
applyAgentUI();
setState("idle");
if (requested && AGENTS[requested] && widget) {
  requestAnimationFrame(() => scrollToWidget());
}
