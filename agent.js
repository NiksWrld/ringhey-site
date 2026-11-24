import Vapi from "https://esm.sh/@vapi-ai/web@2";

const PUBLIC_KEY = "42b722de-b2a9-42d5-9f1d-6cae9a2415ba";
const ASSISTANT = "b5a15488-3f75-4b5d-81b1-3d00394ad94b";

const statusEl = document.getElementById("call-status");
const logEl = document.getElementById("call-log");
const startBtns = document.querySelectorAll("[data-vapi-start]");
const muteBtn = document.getElementById("call-mute");
const endBtn = document.getElementById("call-end");
const fab = document.getElementById("talk-fab");
const widget = document.getElementById("call-widget");

const vapi = new Vapi(PUBLIC_KEY);
let live = false;
let starting = false;
let muted = false;

function setStatus(text, kind = "") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle("is-live", kind === "live");
  statusEl.classList.toggle("is-error", kind === "error");
}

function escapeText(value) {
  return String(value ?? "").replace(/</g, "&lt;");
}

function appendTranscript(role, text) {
  if (!logEl || !text) return;
  const row = document.createElement("div");
  const who = role === "assistant" ? "Ringhey" : "You";
  row.innerHTML = `<b class="${role === "assistant" ? "who-agent" : "who-you"}">${who}:</b> ${escapeText(text)}`;
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
}

function scrollToWidget() {
  if (!widget) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  widget.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
}

function setMuted(next) {
  muted = Boolean(next);
  try {
    vapi.setMuted(muted);
  } catch {
    muted = false;
  }
  if (muteBtn) {
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.textContent = muted ? "Unmute" : "Mute";
  }
}

function syncUi() {
  startBtns.forEach((btn) => {
    btn.disabled = starting;
    if (btn === fab) return;
    if (btn.id === "call-start") {
      btn.hidden = live;
    }
  });
  if (muteBtn) muteBtn.disabled = !live;
  if (endBtn) endBtn.disabled = !live;
  if (fab) {
    fab.classList.toggle("is-live", live);
    fab.classList.toggle("is-connecting", starting);
    const label = fab.querySelector(".talk-fab-label");
    if (label) label.textContent = live ? "In a call" : starting ? "Connecting…" : "Talk to us";
    fab.setAttribute("aria-label", live ? "In a call — show the transcript" : "Talk to us");
  }
  document.body.classList.toggle("call-active", live);
}

async function startCall() {
  if (live) {
    scrollToWidget();
    return;
  }
  if (starting) return;
  starting = true;
  if (logEl) logEl.innerHTML = "";
  setMuted(false);
  setStatus("Connecting…");
  syncUi();
  scrollToWidget();
  try {
    await vapi.start(ASSISTANT);
  } catch (err) {
    starting = false;
    live = false;
    const message = err?.message || err?.errorMsg || "Could not start the call.";
    setStatus(`Could not start the call: ${message} Please check your microphone and try again.`, "error");
    syncUi();
  }
}

function endCall() {
  try {
    vapi.stop();
  } catch {
    live = false;
    starting = false;
    setStatus("Call ended.");
    syncUi();
  }
}

startBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    startCall();
  });
});

muteBtn?.addEventListener("click", () => {
  if (!live) return;
  setMuted(!muted);
});

endBtn?.addEventListener("click", () => {
  if (live || starting) endCall();
});

vapi.on("call-start", () => {
  live = true;
  starting = false;
  setStatus("Connected — just start talking.", "live");
  syncUi();
});

vapi.on("call-end", () => {
  live = false;
  starting = false;
  setMuted(false);
  setStatus("Call ended. Thanks for trying the Ringhey agent.");
  syncUi();
});

vapi.on("speech-start", () => {
  if (live) setStatus("Ringhey is speaking…", "live");
});

vapi.on("speech-end", () => {
  if (live) setStatus("Listening…", "live");
});

vapi.on("error", (event) => {
  console.error(event);
  let message = event?.error?.message || event?.errorMsg || event?.message || event?.error?.msg;
  if (typeof message !== "string") {
    try {
      message = JSON.stringify(event?.error || event).slice(0, 200);
    } catch {
      message = "connection problem";
    }
  }
  live = false;
  starting = false;
  setMuted(false);
  setStatus(`Error: ${message} — please check your microphone and try again.`, "error");
  syncUi();
});

vapi.on("message", (msg) => {
  if (msg?.type === "transcript" && msg.transcriptType === "final") {
    appendTranscript(msg.role, msg.transcript);
  }
});

syncUi();
