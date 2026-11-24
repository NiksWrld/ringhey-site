import Vapi from "https://esm.sh/@vapi-ai/web@2";

const PUBLIC_KEY = "e1b402e2-b8f5-46fc-be4c-de9bc184dfaa";
const ASSISTANT = "b5a15488-3f75-4b5d-81b1-3d00394ad94b";

const STATUS = {
  idle: { chip: "Ready", hint: "Ask about pricing, the portal, or how a voice agent would work for you. We’ll request microphone access when you start." },
  connecting: { chip: "Connecting", hint: "Connecting — please allow microphone access if asked." },
  listening: { chip: "Listening", hint: "We’re listening. Just start talking." },
  speaking: { chip: "Speaking", hint: "Ringhey Agent is speaking." },
  ended: { chip: "Ended", hint: "Call ended. Start again whenever you’re ready." },
  error: { chip: "Ended", hint: "Couldn’t start the call. Please allow microphone access and try again." },
};

const widget = document.getElementById("call-widget");
const dock = document.getElementById("call-dock");
const logEl = document.getElementById("call-log");
const hintEl = document.getElementById("call-hint");
const fab = document.getElementById("talk-fab");
const dockOpen = document.getElementById("dock-open");
const startBtns = document.querySelectorAll("[data-vapi-start]");
const muteBtns = document.querySelectorAll("[data-vapi-mute]");
const endBtns = document.querySelectorAll("[data-vapi-end]");
const chips = document.querySelectorAll(".status-chip");
const vizBars = document.querySelectorAll(".viz-bars");

const vapi = new Vapi(PUBLIC_KEY);
let state = "idle";
let muted = false;
let volume = 0;
let rafId = 0;
let widgetInView = false;

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function setState(next, hint) {
  state = next;
  const meta = STATUS[next] || STATUS.idle;
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
  const inCall = state === "connecting" || state === "listening" || state === "speaking";
  startBtns.forEach((btn) => {
    if (btn.id === "call-start") {
      btn.hidden = inCall;
      btn.disabled = state === "connecting";
    } else if (btn === fab) {
      btn.disabled = state === "connecting";
    }
  });
  muteBtns.forEach((btn) => {
    btn.disabled = !inCall || state === "connecting";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    const label = btn.querySelector("[data-mute-label]");
    if (label) label.textContent = muted ? "Unmute" : "Mute";
    if (!btn.getAttribute("aria-label") || btn.classList.contains("btn-icon")) {
      btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    }
  });
  endBtns.forEach((btn) => {
    btn.disabled = !inCall;
  });
  if (dock) {
    dock.classList.toggle("is-open", inCall);
    dock.classList.toggle("is-hidden-over-widget", inCall && widgetInView);
  }
  document.body.classList.toggle("call-active", inCall);
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
  label.textContent = isAgent ? "Ringhey Agent" : "You";
  const p = document.createElement("p");
  p.textContent = text;
  row.append(label, p);
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearTranscript() {
  if (logEl) logEl.replaceChildren();
}

async function startCall() {
  if (state === "listening" || state === "speaking" || state === "connecting") {
    scrollToWidget();
    return;
  }
  muted = false;
  volume = 0;
  clearTranscript();
  setState("connecting");
  scrollToWidget();
  try {
    await vapi.start(ASSISTANT);
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
    setState("ended");
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
    if (state === "connecting" || state === "listening" || state === "speaking") endCall();
  })
);
dockOpen?.addEventListener("click", scrollToWidget);

vapi.on("call-start", () => {
  setState("listening");
});

vapi.on("call-end", () => {
  muted = false;
  volume = 0;
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

setState("idle");
