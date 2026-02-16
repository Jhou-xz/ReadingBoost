/* global pdfjsLib, mammoth */

const STORE_KEY = "oneword_reader_v2";

/* ---------------- storage ---------------- */
function saveState(partial = {}) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    const next = { ...prev, ...partial, savedAt: Date.now() };
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {}
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
  catch { return {}; }
}
function clearState() { try { localStorage.removeItem(STORE_KEY); } catch {} }

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);

function pivotIndex(len) { return Math.floor((len - 1) / 2); }
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function tokenize(text) {
  text = text.replace(/\r\n/g, "\n");
  const tokens = [];
  const re = /(\n)|([A-Za-z]+(?:[’'_-][A-Za-z]+)*)|(\d+(?:[.,]\d+)*)|([^\sA-Za-z0-9]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) tokens.push({ type: "newline", value: "\n" });
    else if (m[2]) tokens.push({ type: "word", value: m[2] });
    else if (m[3]) tokens.push({ type: "word", value: m[3] });
    else if (m[4]) {
      for (const ch of m[4]) {
        if (ch.trim() === "") continue;
        tokens.push({ type: "punct", value: ch });
      }
    }
  }
  return tokens;
}

/* ---------------- DOM ---------------- */
const elText = $("text");
const elFile = $("file");
const elFileName = $("fileName");

const elWpm = $("wpm");
const elWpmVal = $("wpmVal");
const elFontSize = $("fontSize");
const elFontSizeVal = $("fontSizeVal");

const elCommaPause = $("commaPause");
const elPeriodPause = $("periodPause");
const elLinePause = $("linePause");
const elLongWordExtra = $("longWordExtra");

const beepEnabled = $("beepEnabled");

const elWord = $("word");
const elIdx = $("idx");
const elTotal = $("total");
const elStatus = $("status");
const btnPlayPause = $("playPause");

const defaultSettings = {
  wpm: 350,
  fontSize: 64,
  linePause: 0,
  longWordExtra: 40,
  beepEnabled: false
};

/* ---------------- audio beep ---------------- */
let audioCtx = null;
function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}
function beep() {
  if (!beepEnabled.checked) return;
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.value = 0.0001;

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const dur = 0.035;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.start(now);
  osc.stop(now + dur + 0.01);
}

/* ---------------- pacing logic ---------------- */
const baseWpm = 350;
const baseCommaMs = 100;
const basePeriodMs = 100;

let autoComma = true;
let autoPeriod = true;

function scaledPause(baseMs) {
  const wpm = Math.max(1, Number(elWpm.value));
  return Math.max(0, Math.round(baseMs * (baseWpm / wpm)));
}
function applyAutoPauses() {
  if (autoComma) elCommaPause.value = String(scaledPause(baseCommaMs));
  if (autoPeriod) elPeriodPause.value = String(scaledPause(basePeriodMs));
}
elCommaPause.addEventListener("input", () => { autoComma = false; });
elPeriodPause.addEventListener("input", () => { autoPeriod = false; });

function baseDelayMs() { return 60000 / Math.max(1, Number(elWpm.value)); }

function punctuationExtraMs(ch) {
  const comma = Number(elCommaPause.value) || 0;
  const period = Number(elPeriodPause.value) || 0;
  if (ch === ",") return comma;
  if (ch === ";" || ch === ":") return comma + 40;
  if (ch === "." || ch === "!" || ch === "?") return period;
  if (ch === "—" || ch === "-") return 60;
  if (ch === ")" || ch === "(" || ch === "\"" || ch === "”" || ch === "“" || ch === "’" || ch === "'") return 40;
  return 0;
}

function longWordExtraMs(word) {
  const extra = Number(elLongWordExtra.value) || 0;
  const len = word.length;
  if (len <= 8) return 0;
  const steps = Math.ceil((len - 8) / 6);
  return steps * extra;
}

function buildEvents(tokens) {
  const events = [];
  let pendingPause = 0;
  for (const t of tokens) {
    if (t.type === "punct") { pendingPause += punctuationExtraMs(t.value); continue; }
    if (t.type === "newline") { pendingPause += (Number(elLinePause.value) || 0); continue; }
    if (t.type === "word") {
      events.push({ word: t.value, extraPause: pendingPause });
      pendingPause = 0;
    }
  }
  return events;
}

/* ---------------- render word ---------------- */
function showWord(word) {
  if (!word) {
    elWord.textContent = "";
    document.documentElement.style.setProperty("--pi", 0);
    return;
  }
  const len = word.length;
  const pi = Math.min(pivotIndex(len), len - 1);
  document.documentElement.style.setProperty("--pi", pi);

  const left = escapeHtml(word.slice(0, pi));
  const mid  = escapeHtml(word[pi]);
  const right= escapeHtml(word.slice(pi + 1));
  elWord.innerHTML = `${left}<span class="pivot">${mid}</span>${right}`;
}

/* ---------------- textarea auto-grow ---------------- */
function autoGrowTextarea() {
  const cs = getComputedStyle(elText);
  const minH = parseFloat(cs.minHeight) || 220;
  const maxH = parseFloat(cs.maxHeight) || 336;
  elText.style.height = minH + "px";
  const needed = elText.scrollHeight;
  const newH = Math.min(maxH, Math.max(minH, needed + 2));
  elText.style.height = newH + "px";
}

/* ---------------- player state ---------------- */
let events = [];
let i = 0;
let timer = null;
let playing = false;

function setPlayingState(isPlaying) {
  playing = isPlaying;
  btnPlayPause.textContent = playing ? "Pause" : "Play";
  elStatus.textContent = playing ? "playing" : (events.length ? "paused" : "idle");
  saveState({ playing });
}
function updateHud() {
  elIdx.textContent = String(i);
  elTotal.textContent = String(events.length);
  saveState({ index: i, total: events.length });
}

function scheduleNext() {
  clearTimeout(timer);
  if (!playing) return;

  if (i >= events.length) {
    setPlayingState(false);
    updateHud();
    return;
  }

  const ev = events[i];

  // exact moment of display
  showWord(ev.word);
  beep();
  updateHud();

  let delay = baseDelayMs();
  delay += (ev.extraPause || 0);
  delay += longWordExtraMs(ev.word);

  i += 1;
  timer = setTimeout(scheduleNext, delay);
}

function rebuildFromText(resetIndex = false) {
  const toks = tokenize(elText.value || "");
  events = buildEvents(toks);

  if (resetIndex) i = 0;
  i = Math.min(i, Math.max(0, events.length - 1));

  showWord(events[i]?.word || "");
  updateHud();
  if (events.length === 0) setPlayingState(false);
}

function ensurePrepared(resetIndex = false) {
  if (events.length === 0 || resetIndex) rebuildFromText(resetIndex);
}

function play(fromStart = false) {
  ensureAudioCtx(); // audio allowed after gesture
  ensurePrepared(fromStart);
  if (events.length === 0) return;
  setPlayingState(true);
  scheduleNext();
}
function pause() { clearTimeout(timer); setPlayingState(false); }
function togglePlayPause() { playing ? pause() : play(false); }

/* ---------------- text change ---------------- */
let typingTimer = null;
function onTextChanged() {
  autoGrowTextarea();
  saveState({ text: elText.value });

  const wasPlaying = playing;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    pause();
    rebuildFromText(true);
    if (wasPlaying) play(true);
  }, 120);
}
elText.addEventListener("input", onTextChanged);

/* ---------------- reset/reload/refresh ---------------- */
function resetSettings() {
  const oldIndex = i;

  elWpm.value = String(defaultSettings.wpm);
  elWpmVal.textContent = String(defaultSettings.wpm);

  elFontSize.value = String(defaultSettings.fontSize);
  elFontSizeVal.textContent = String(defaultSettings.fontSize);
  document.documentElement.style.setProperty("--fs", defaultSettings.fontSize + "px");

  beepEnabled.checked = defaultSettings.beepEnabled;

  autoComma = true; autoPeriod = true;
  applyAutoPauses();

  elLinePause.value = String(defaultSettings.linePause);
  elLongWordExtra.value = String(defaultSettings.longWordExtra);

  saveState({
    wpm: Number(elWpm.value),
    fontSize: Number(elFontSize.value),
    commaPause: Number(elCommaPause.value),
    periodPause: Number(elPeriodPause.value),
    linePause: Number(elLinePause.value),
    longWordExtra: Number(elLongWordExtra.value),
    autoComma, autoPeriod,
    beepEnabled: beepEnabled.checked
  });

  events = [];
  rebuildFromText(false);
  i = Math.min(oldIndex, Math.max(0, events.length - 1));
  showWord(events[i]?.word || "");
  updateHud();
  setPlayingState(false);
}

function reloadToStart() {
  const wasPlaying = playing;
  pause();
  rebuildFromText(true);
  if (wasPlaying) play(true);
}

function refreshEverything() {
  pause();
  clearState();

  elText.value = "";
  autoGrowTextarea();

  elWpm.value = String(defaultSettings.wpm);
  elWpmVal.textContent = String(defaultSettings.wpm);

  elFontSize.value = String(defaultSettings.fontSize);
  elFontSizeVal.textContent = String(defaultSettings.fontSize);
  document.documentElement.style.setProperty("--fs", defaultSettings.fontSize + "px");

  beepEnabled.checked = defaultSettings.beepEnabled;

  autoComma = true; autoPeriod = true;
  applyAutoPauses();

  elLinePause.value = String(defaultSettings.linePause);
  elLongWordExtra.value = String(defaultSettings.longWordExtra);

  events = [];
  i = 0;
  showWord("");
  updateHud();
  setPlayingState(false);

  elFile.value = "";
  elFileName.textContent = "No file selected";
}

/* ---------------- speed controls ---------------- */
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function setWpm(newWpm) {
  const lo = Number(elWpm.min);
  const hi = Number(elWpm.max);
  const wpm = clamp(Math.round(newWpm), lo, hi);
  elWpm.value = String(wpm);
  elWpmVal.textContent = String(wpm);
  applyAutoPauses();
  saveState({
    wpm,
    commaPause: Number(elCommaPause.value),
    periodPause: Number(elPeriodPause.value),
    autoComma, autoPeriod
  });
}
elWpm.addEventListener("input", () => setWpm(Number(elWpm.value)));

elFontSize.addEventListener("input", () => {
  const px = Number(elFontSize.value);
  document.documentElement.style.setProperty("--fs", px + "px");
  elFontSizeVal.textContent = String(px);
  saveState({ fontSize: px });
});

beepEnabled.addEventListener("change", () => {
  saveState({ beepEnabled: beepEnabled.checked });
});

function applySettingsNowKeepIndex() {
  const wasPlaying = playing;
  const oldIndex = i;
  pause();
  rebuildFromText(false);
  i = Math.min(oldIndex, Math.max(0, events.length - 1));
  showWord(events[i]?.word || "");
  updateHud();
  saveState({
    commaPause: Number(elCommaPause.value),
    periodPause: Number(elPeriodPause.value),
    linePause: Number(elLinePause.value),
    longWordExtra: Number(elLongWordExtra.value),
    autoComma, autoPeriod
  });
  if (wasPlaying) play(false);
}
[elCommaPause, elPeriodPause, elLinePause, elLongWordExtra].forEach(el => {
  el.addEventListener("change", () => applySettingsNowKeepIndex());
});

/* ---------------- buttons ---------------- */
$("reset").addEventListener("click", () => resetSettings());
$("reload").addEventListener("click", () => reloadToStart());
$("refreshAll").addEventListener("click", () => refreshEverything());
btnPlayPause.addEventListener("click", () => togglePlayPause());

$("back").addEventListener("click", () => {
  pause(); ensurePrepared(false);
  i = Math.max(0, i - 1);
  showWord(events[i]?.word || "");
  beep();
  updateHud(); setPlayingState(false);
  saveState({ index: i });
});

$("next").addEventListener("click", () => {
  pause(); ensurePrepared(false);
  i = Math.min(events.length - 1, i + 1);
  showWord(events[i]?.word || "");
  beep();
  updateHud(); setPlayingState(false);
  saveState({ index: i });
});

/* ---------------- keyboard shortcuts ---------------- */
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;

  if (e.code === "Space") {
    e.preventDefault();
    togglePlayPause();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    $("back").click();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    $("next").click();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setWpm(Number(elWpm.value) + 10);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    setWpm(Number(elWpm.value) - 10);
  } else if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    reloadToStart();
  }
});

/* ---------------- file extraction ---------------- */

// Configure pdf.js worker
function configurePdfWorker() {
  if (!window.pdfjsLib) return;
  // Use a matching worker from the same CDN version
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
}

async function extractTextFromPdf(file) {
  configurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let out = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str).filter(Boolean);

    // join with spaces; add newline between pages
    out.push(strings.join(" "));
    out.push("\n");
  }
  return out.join("").replace(/\s+\n/g, "\n").trim();
}

async function extractTextFromDocx(file) {
  if (!window.mammoth) throw new Error("mammoth not loaded");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || "").trim();
}

function setTextAndPrepare(text, filenameLabel) {
  elText.value = text;
  autoGrowTextarea();
  saveState({ text });

  pause();
  events = [];
  i = 0;
  rebuildFromText(true);
  setPlayingState(false);
  saveState({ index: 0 });

  elFileName.textContent = filenameLabel || "Loaded";
}

elFile.addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  elFileName.textContent = f.name;

  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const type = (f.type || "").toLowerCase();

  try {
    if (ext === "txt" || type.includes("text/plain")) {
      const text = await f.text();
      setTextAndPrepare(text, f.name);
      return;
    }

    if (ext === "pdf" || type.includes("application/pdf")) {
      const text = await extractTextFromPdf(f);
      setTextAndPrepare(text || "(No text extracted from PDF)", f.name);
      return;
    }

    if (ext === "docx" || type.includes("officedocument.wordprocessingml.document")) {
      const text = await extractTextFromDocx(f);
      setTextAndPrepare(text || "(No text extracted from DOCX)", f.name);
      return;
    }

    if (ext === "doc" || type.includes("application/msword")) {
      const msg =
        `Loaded: ${f.name}\n\n` +
        `Legacy .doc files are not reliably extractable in-browser.\n` +
        `Please convert it to .docx or export to .txt, then upload again.`;
      setTextAndPrepare(msg, f.name);
      return;
    }

    const msg =
      `Loaded: ${f.name}\n\n` +
      `Unsupported type. Please upload TXT, PDF, or DOCX.`;
    setTextAndPrepare(msg, f.name);

  } catch (err) {
    const msg =
      `Failed to read: ${f.name}\n\n` +
      `Reason: ${String(err && err.message ? err.message : err)}\n\n` +
      `Try exporting to TXT, or try another file.`;
    setTextAndPrepare(msg, f.name);
  }
});

/* ---------------- init restore ---------------- */
(function initFromStorage(){
  const st = loadState();

  if (typeof st.text === "string" && st.text.length > 0) elText.value = st.text;

  const wpm = Number.isFinite(st.wpm) ? st.wpm : defaultSettings.wpm;
  elWpm.value = String(wpm);
  elWpmVal.textContent = String(wpm);

  const fs = Number.isFinite(st.fontSize) ? st.fontSize : defaultSettings.fontSize;
  elFontSize.value = String(fs);
  elFontSizeVal.textContent = String(fs);
  document.documentElement.style.setProperty("--fs", fs + "px");

  if (typeof st.autoComma === "boolean") autoComma = st.autoComma;
  if (typeof st.autoPeriod === "boolean") autoPeriod = st.autoPeriod;

  if (!autoComma && Number.isFinite(st.commaPause)) elCommaPause.value = String(st.commaPause);
  if (!autoPeriod && Number.isFinite(st.periodPause)) elPeriodPause.value = String(st.periodPause);
  applyAutoPauses();

  elLinePause.value = String(Number.isFinite(st.linePause) ? st.linePause : defaultSettings.linePause);
  elLongWordExtra.value = String(Number.isFinite(st.longWordExtra) ? st.longWordExtra : defaultSettings.longWordExtra);

  if (typeof st.beepEnabled === "boolean") beepEnabled.checked = st.beepEnabled;
  else beepEnabled.checked = defaultSettings.beepEnabled;

  autoGrowTextarea();
  rebuildFromText(false);

  const savedIndex = Number.isFinite(st.index) ? st.index : 0;
  i = Math.min(Math.max(0, savedIndex), Math.max(0, events.length - 1));
  showWord(events[i]?.word || "");
  updateHud();

  setPlayingState(false);
})();

/* ---------------- auto-load demo if empty ---------------- */
(async function autoLoadDemoIfNeeded(){
  const st = loadState();
  const hasText = typeof st.text === "string" && st.text.trim().length > 0;
  if (hasText) return;

  try {
    const res = await fetch("./demo.txt", { cache: "no-store" });
    if (!res.ok) throw new Error("demo.txt not found");
    const text = await res.text();
    setTextAndPrepare(text, "Loaded: demo.txt");
  } catch {
    // ok to stay empty
  }
})();
