import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const PROFILES = ["SB", "JA"];
const PROFILE_NAMES = {
  SB: "Sibbe",
  JA: "Johan"
};

const TIMER_PRESETS = [2, 5, 15, 25];
const DEFAULT_ICS = {
  SB: "https://calendar.google.com/calendar/ical/ericssonbonini%40gmail.com/public/basic.ics",
  JA: ""
};

const DEFAULT_PROFILE_DATA = {
  freeText: "",
  notes: [],
  lists: [],
  familyNotices: [],
  trainings: [],
  matches: [],
  images: {
    one: "",
    two: ""
  },
  calendarIcs: "",
  timerPreset: 5
};

const state = {
  activeProfile: localStorage.getItem("livelydashsb_activeProfile") || "SB",
  profileData: { ...DEFAULT_PROFILE_DATA },
  unsubscribeProfile: null,
  openModalType: null,
  openModalMeta: null,

  timerPresetIndex: 1,
  timerRunning: false,
  timerRemainingMs: 0,
  timerEndTs: 0,
  timerTick: null,

  qrMini: null,
  qrLarge: null
};

const $ = (id) => document.getElementById(id);

const weatherTemp = $("weatherTemp");
const weatherLabel = $("weatherLabel");
const weatherMeta = $("weatherMeta");

const timeBig = $("timeBig");
const dateBig = $("dateBig");

const profileTabSB = $("profileTabSB");
const profileTabJA = $("profileTabJA");
const profileCircleText = $("profileCircleText");
const profileCircleBtn = $("profileCircleBtn");
const refreshBtn = $("refreshBtn");

const freeTextPreview = $("freeTextPreview");
const listsPreview = $("listsPreview");
const notesPreview = $("notesPreview");
const noticesPreview = $("noticesPreview");
const trainingsPreview = $("trainingsPreview");
const matchesPreview = $("matchesPreview");
const calendarTodayPreview = $("calendarTodayPreview");

const imageOnePreview = $("imageOnePreview");
const imageOnePlaceholder = $("imageOnePlaceholder");
const imageTwoPreview = $("imageTwoPreview");
const imageTwoPlaceholder = $("imageTwoPlaceholder");

const timerCard = $("timerCard");
const timerPresetText = $("timerPresetText");
const timerStatus = $("timerStatus");
const timerProgress = $("timerProgress");

const modalRoot = $("modalRoot");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalSaveBtn = $("modalSaveBtn");
const modalDeleteBtn = $("modalDeleteBtn");
const modalCloseBtn = $("modalCloseBtn");

const profileModalRoot = $("profileModalRoot");
const profileModalCloseBtn = $("profileModalCloseBtn");

const qrDock = $("qrDock");
const qrModalRoot = $("qrModalRoot");
const qrModalCloseBtn = $("qrModalCloseBtn");
const qrUrlText = $("qrUrlText");
const qrCanvasMini = $("qrCanvasMini");
const qrCanvasLarge = $("qrCanvasLarge");

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function profileDocRef(profile) {
  return doc(db, "livelydashsb_profiles", profile);
}

function ensureProfileShape(data, profile) {
  const merged = {
    ...deepClone(DEFAULT_PROFILE_DATA),
    ...(data || {})
  };

  if (!Array.isArray(merged.notes)) merged.notes = [];
  if (!Array.isArray(merged.lists)) merged.lists = [];
  if (!Array.isArray(merged.familyNotices)) merged.familyNotices = [];
  if (!Array.isArray(merged.trainings)) merged.trainings = [];
  if (!Array.isArray(merged.matches)) merged.matches = [];
  if (!merged.images || typeof merged.images !== "object") {
    merged.images = { one: "", two: "" };
  }

  if (!merged.calendarIcs) {
    merged.calendarIcs = DEFAULT_ICS[profile] || "";
  }

  const preset = Number(merged.timerPreset || 5);
  merged.timerPreset = TIMER_PRESETS.includes(preset) ? preset : 5;

  return merged;
}

async function bootstrap() {
  setupClock();
  setupWeather();
  setupQr();
  setupModalEvents();
  setupWidgetEvents();
  setupTimerEvents();

  await ensureProfileDocument(state.activeProfile);
  listenToProfile(state.activeProfile);
  updateProfileUi();
  renderAll();
}

async function ensureProfileDocument(profile) {
  const ref = profileDocRef(profile);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const payload = ensureProfileShape({}, profile);
    await setDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp()
    });
  }
}

function listenToProfile(profile) {
  if (state.unsubscribeProfile) {
    state.unsubscribeProfile();
  }

  const ref = profileDocRef(profile);

  state.unsubscribeProfile = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      await ensureProfileDocument(profile);
      return;
    }

    state.profileData = ensureProfileShape(snap.data(), profile);
    state.timerPresetIndex = TIMER_PRESETS.indexOf(state.profileData.timerPreset);
    if (state.timerPresetIndex < 0) state.timerPresetIndex = 1;

    updateProfileUi();
    renderAll();
    loadCalendarEvents();
  });
}

function updateProfileUi() {
  const active = state.activeProfile;
  profileTabSB.classList.toggle("active", active === "SB");
  profileTabJA.classList.toggle("active", active === "JA");
  profileCircleText.textContent = active;
}

function setupClock() {
  const updateClock = () => {
    const now = new Date();

    timeBig.textContent = now.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const dayName = now.toLocaleDateString("sv-SE", { weekday: "long" });
    const day = now.getDate();
    const monthName = now.toLocaleDateString("sv-SE", { month: "long" });

    dateBig.textContent = `${capitalize(dayName)} - ${day} ${monthName}`;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

function capitalize(str) {
  const s = String(str || "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function setupWeather() {
  const fallback = { lat: 59.3247, lon: 18.4304 };

  const fetchWeather = async (lat, lon) => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=Europe%2FStockholm`;

      const res = await fetch(url);
      const data = await res.json();
      const current = data?.current;
      if (!current) throw new Error("No weather");

      weatherTemp.textContent = `${Math.round(current.temperature_2m)}°`;
      weatherLabel.textContent = weatherCodeToLabel(current.weather_code);
      weatherMeta.textContent = `Känns som ${Math.round(current.apparent_temperature)}° · Vind ${Math.round(current.wind_speed_10m)} m/s`;
    } catch (e) {
      weatherTemp.textContent = "--°";
      weatherLabel.textContent = "Väder kunde inte hämtas";
      weatherMeta.textContent = "";
      console.error(e);
    }
  };

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => fetchWeather(fallback.lat, fallback.lon),
      { maximumAge: 15 * 60 * 1000, timeout: 6000 }
    );
  } else {
    fetchWeather(fallback.lat, fallback.lon);
  }
}

function weatherCodeToLabel(code) {
  const map = {
    0: "Klart",
    1: "Mest klart",
    2: "Delvis molnigt",
    3: "Molnigt",
    45: "Dimma",
    48: "Dimma",
    61: "Lätt regn",
    63: "Regn",
    65: "Kraftigt regn",
    71: "Lätt snö",
    73: "Snö",
    75: "Kraftig snö",
    80: "Skurar",
    95: "Åska"
  };
  return map[code] || "Väder";
}

function setupQr() {
  const url = window.location.href;
  qrUrlText.textContent = url;

  state.qrMini = new QRious({
    element: qrCanvasMini,
    value: url,
    size: 72,
    background: "white",
    foreground: "black"
  });

  state.qrLarge = new QRious({
    element: qrCanvasLarge,
    value: url,
    size: 240,
    background: "white",
    foreground: "black"
  });

  qrDock.addEventListener("click", openQrModal);
  qrModalCloseBtn.addEventListener("click", closeQrModal);
  qrModalRoot.querySelector(".modalBackdrop").addEventListener("click", closeQrModal);
}

function openQrModal() {
  qrModalRoot.classList.remove("hidden");
}

function closeQrModal() {
  qrModalRoot.classList.add("hidden");
}

function setupModalEvents() {
  modalCloseBtn.addEventListener("click", closeModal);
  modalRoot.querySelector(".modalBackdrop").addEventListener("click", closeModal);

  modalSaveBtn.addEventListener("click", saveCurrentModal);
  modalDeleteBtn.addEventListener("click", deleteCurrentModal);

  profileCircleBtn.addEventListener("click", () => {
    profileModalRoot.classList.remove("hidden");
  });

  profileModalCloseBtn.addEventListener("click", () => {
    profileModalRoot.classList.add("hidden");
  });

  profileModalRoot.querySelector(".modalBackdrop").addEventListener("click", () => {
    profileModalRoot.classList.add("hidden");
  });

  profileModalRoot.querySelectorAll("[data-profile-pick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await switchProfile(btn.dataset.profilePick);
      profileModalRoot.classList.add("hidden");
    });
  });

  profileTabSB.addEventListener("click", () => switchProfile("SB"));
  profileTabJA.addEventListener("click", () => switchProfile("JA"));

  refreshBtn.addEventListener("click", () => location.reload());
}

async function switchProfile(profile) {
  if (!PROFILES.includes(profile)) return;
  if (profile === state.activeProfile) return;

  state.activeProfile = profile;
  localStorage.setItem("livelydashsb_activeProfile", profile);
  await ensureProfileDocument(profile);
  listenToProfile(profile);
  updateProfileUi();
}

function setupWidgetEvents() {
  $("freeTextCard").addEventListener("click", () => openWidgetModal("freeText"));
  $("listsCard").addEventListener("click", () => openWidgetModal("lists"));
  $("notesCard").addEventListener("click", () => openWidgetModal("notes"));
  $("noticesCard").addEventListener("click", () => openWidgetModal("familyNotices"));
  $("trainingsCard").addEventListener("click", () => openWidgetModal("trainings"));
  $("matchesCard").addEventListener("click", () => openWidgetModal("matches"));
  $("imageOneCard").addEventListener("click", () => openWidgetModal("images", { slot: "one" }));
  $("imageTwoCard").addEventListener("click", () => openWidgetModal("images", { slot: "two" }));
}

function renderAll() {
  renderFreeText();
  renderListsPreview();
  renderNotesPreview();
  renderFamilyNoticesPreview();
  renderEventsPreview("trainings", trainingsPreview);
  renderEventsPreview("matches", matchesPreview);
  renderImages();
  renderTimer();
}

function renderFreeText() {
  const value = String(state.profileData.freeText || "").trim();
  freeTextPreview.textContent = value || "Tryck för att skriva.";
}

function renderListsPreview() {
  const lists = [...(state.profileData.lists || [])];
  if (!lists.length) {
    listsPreview.innerHTML = `<div class="emptyMini">Tryck för att skapa listor</div>`;
    return;
  }

  const sorted = [
    ...lists.filter(i => !i.completed),
    ...lists.filter(i => i.completed)
  ].slice(0, 3);

  listsPreview.innerHTML = sorted.map((item) => {
    const subCount = Array.isArray(item.subtasks) ? item.subtasks.length : 0;
    const doneCount = Array.isArray(item.subtasks)
      ? item.subtasks.filter((s) => s.done).length
      : 0;

    return `
      <div class="listItemPreview ${item.completed ? "completedText" : ""}">
        <div class="listDot"></div>
        <div>
          <div class="listName">${escapeHtml(item.title || "Utan namn")}</div>
          <div class="listSub">${subCount ? `${doneCount}/${subCount} delmål` : "Inga delmål"}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderNotesPreview() {
  const notes = (state.profileData.notes || []).slice(0, 4);
  if (!notes.length) {
    notesPreview.innerHTML = `<div class="emptyMini">Tryck för att lägga till ämnen</div>`;
    return;
  }

  notesPreview.innerHTML = notes.map((note) => {
    const snippet = String(note.text || "").trim().slice(0, 42);
    return `
      <div>
        <div class="noteSubject">${escapeHtml(note.subject || "Ämne")}</div>
        <div class="noteSnippet">${escapeHtml(snippet || "Ingen text ännu")}</div>
      </div>
    `;
  }).join("");
}

function renderFamilyNoticesPreview() {
  const notices = (state.profileData.familyNotices || []).slice(0, 3);
  if (!notices.length) {
    noticesPreview.innerHTML = `<div class="emptyMini bright">Tryck för att lägga till notiser</div>`;
    return;
  }

  noticesPreview.innerHTML = notices.map((item) => `
    <div>
      <div class="solidMain">${escapeHtml(item.title || "Notis")}</div>
      <div class="solidSub">${escapeHtml(item.text || "")}</div>
    </div>
  `).join("");
}

function renderEventsPreview(key, targetEl) {
  const items = [...(state.profileData[key] || [])];
  if (!items.length) {
    targetEl.innerHTML = `<div class="emptyMini bright">Tryck för att lägga till</div>`;
    return;
  }

  targetEl.innerHTML = items.slice(0, 5).map((item) => `
    <div>
      <div class="solidMain">${escapeHtml(buildEventLine(item))}</div>
      ${item.place ? `<div class="solidSub">${escapeHtml(item.place)}</div>` : ""}
    </div>
  `).join("");
}

function buildEventLine(item) {
  const parts = [];
  if (item.child) parts.push(item.child);
  if (item.day) parts.push(item.day);
  if (item.time) parts.push(item.time);
  return parts.join(" ");
}

function renderImages() {
  renderImageSlot("one", imageOnePreview, imageOnePlaceholder);
  renderImageSlot("two", imageTwoPreview, imageTwoPlaceholder);
}

function renderImageSlot(slot, imgEl, placeholderEl) {
  const value = state.profileData.images?.[slot] || "";
  if (!value) {
    imgEl.classList.add("hidden");
    placeholderEl.classList.remove("hidden");
    imgEl.removeAttribute("src");
    return;
  }
  imgEl.src = value;
  imgEl.classList.remove("hidden");
  placeholderEl.classList.add("hidden");
}

function setupTimerEvents() {
  timerCard.addEventListener("click", async () => {
    if (state.timerRunning) {
      stopTimer(true);
    } else {
      startTimer();
    }
  });

  timerCard.addEventListener("wheel", async (e) => {
    e.preventDefault();
    if (state.timerRunning) return;
    changeTimerPreset(e.deltaY > 0 ? 1 : -1);
    await persistTimerPreset();
  }, { passive: false });

  timerCard.addEventListener("keydown", async (e) => {
    if (state.timerRunning) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      changeTimerPreset(1);
      await persistTimerPreset();
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      changeTimerPreset(-1);
      await persistTimerPreset();
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startTimer();
    }
  });
}

function changeTimerPreset(delta) {
  let idx = state.timerPresetIndex + delta;
  if (idx < 0) idx = TIMER_PRESETS.length - 1;
  if (idx >= TIMER_PRESETS.length) idx = 0;
  state.timerPresetIndex = idx;
  state.profileData.timerPreset = TIMER_PRESETS[idx];
  renderTimer();
}

async function persistTimerPreset() {
  await updateProfileData({
    timerPreset: state.profileData.timerPreset
  });
}

function renderTimer() {
  const preset = TIMER_PRESETS[state.timerPresetIndex] || 5;

  if (!state.timerRunning) {
    timerPresetText.textContent = `${preset}m`;
    timerStatus.textContent = "Tryck för att starta";
    setTimerProgress(1);
    return;
  }

  const totalMs = preset * 60 * 1000;
  const progress = Math.max(0, Math.min(1, state.timerRemainingMs / totalMs));
  const minutes = Math.floor(state.timerRemainingMs / 60000);
  const seconds = Math.floor((state.timerRemainingMs % 60000) / 1000);

  timerPresetText.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
  timerStatus.textContent = "Tryck för att avbryta";
  setTimerProgress(progress);
}

function setTimerProgress(progress) {
  const radius = 94;
  const circumference = 2 * Math.PI * radius;
  timerProgress.style.strokeDasharray = `${circumference}`;
  timerProgress.style.strokeDashoffset = `${circumference * (1 - progress)}`;
}

function startTimer() {
  const preset = TIMER_PRESETS[state.timerPresetIndex] || 5;
  state.timerRunning = true;
  state.timerRemainingMs = preset * 60 * 1000;
  state.timerEndTs = Date.now() + state.timerRemainingMs;

  clearInterval(state.timerTick);
  state.timerTick = setInterval(() => {
    state.timerRemainingMs = Math.max(0, state.timerEndTs - Date.now());
    if (state.timerRemainingMs <= 0) {
      stopTimer(false);
      playTimerDone();
      return;
    }
    renderTimer();
  }, 250);

  renderTimer();
}

function stopTimer(reset = true) {
  state.timerRunning = false;
  clearInterval(state.timerTick);
  state.timerTick = null;
  state.timerRemainingMs = 0;

  if (reset) {
    renderTimer();
  } else {
    timerPresetText.textContent = "KLAR";
    timerStatus.textContent = "Tryck för att starta igen";
    setTimerProgress(0);
  }
}

function playTimerDone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.02;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.frequency.value = 660; }, 140);
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 320);
  } catch (_) {}
}

function openWidgetModal(type, meta = null) {
  state.openModalType = type;
  state.openModalMeta = meta;
  modalDeleteBtn.classList.add("hidden");

  if (type === "freeText") {
    modalTitle.textContent = "Fritext";
    modalBody.innerHTML = `
      <div class="fieldBlock">
        <label class="fieldLabel" for="freeTextInput">Text</label>
        <textarea id="freeTextInput" rows="18" placeholder="Skriv här...">${escapeHtml(state.profileData.freeText || "")}</textarea>
      </div>
    `;
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "notes") {
    modalTitle.textContent = "Anteckningar";
    modalBody.innerHTML = renderNotesEditor(state.profileData.notes || []);
    bindNotesEditor();
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "lists") {
    modalTitle.textContent = "Listor";
    modalBody.innerHTML = renderListsEditor(state.profileData.lists || []);
    bindListsEditor();
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "familyNotices") {
    modalTitle.textContent = "Familjenotiser";
    modalBody.innerHTML = renderSimpleEntriesEditor(state.profileData.familyNotices || [], "notices");
    bindSimpleEntriesEditor("notices");
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "trainings") {
    modalTitle.textContent = "Träningar";
    modalBody.innerHTML = renderScheduleEditor(state.profileData.trainings || [], "trainings");
    bindScheduleEditor("trainings");
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "matches") {
    modalTitle.textContent = "Matcher";
    modalBody.innerHTML = renderScheduleEditor(state.profileData.matches || [], "matches");
    bindScheduleEditor("matches");
    modalDeleteBtn.classList.remove("hidden");
  }

  if (type === "images") {
    const slot = meta?.slot === "two" ? "two" : "one";
    modalTitle.textContent = slot === "one" ? "Bild 1" : "Bild 2";
    modalBody.innerHTML = renderImageEditor(slot);
    bindImageEditor(slot);
    modalDeleteBtn.classList.remove("hidden");
  }

  modalRoot.classList.remove("hidden");
}

function closeModal() {
  state.openModalType = null;
  state.openModalMeta = null;
  modalRoot.classList.add("hidden");
  modalBody.innerHTML = "";
}

async function saveCurrentModal() {
  const type = state.openModalType;
  if (!type) return;

  if (type === "freeText") {
    await updateProfileData({ freeText: ($("freeTextInput")?.value || "").trim() });
    closeModal();
    return;
  }

  if (type === "notes") {
    await updateProfileData({ notes: collectNotesEditor() });
    closeModal();
    return;
  }

  if (type === "lists") {
    await updateProfileData({ lists: collectListsEditor() });
    closeModal();
    return;
  }

  if (type === "familyNotices") {
    await updateProfileData({ familyNotices: collectSimpleEntries("notices") });
    closeModal();
    return;
  }

  if (type === "trainings") {
    await updateProfileData({ trainings: collectScheduleEntries("trainings") });
    closeModal();
    return;
  }

  if (type === "matches") {
    await updateProfileData({ matches: collectScheduleEntries("matches") });
    closeModal();
    return;
  }

  if (type === "images") {
    const slot = state.openModalMeta?.slot === "two" ? "two" : "one";
    const uploaded = $("imageDataHolder")?.value || "";
    await updateProfileData({
      images: {
        ...state.profileData.images,
        [slot]: uploaded
      }
    });
    closeModal();
  }
}

async function deleteCurrentModal() {
  const type = state.openModalType;
  if (!type) return;

  if (type === "freeText") {
    await updateProfileData({ freeText: "" });
    closeModal();
    return;
  }
  if (type === "notes") {
    await updateProfileData({ notes: [] });
    closeModal();
    return;
  }
  if (type === "lists") {
    await updateProfileData({ lists: [] });
    closeModal();
    return;
  }
  if (type === "familyNotices") {
    await updateProfileData({ familyNotices: [] });
    closeModal();
    return;
  }
  if (type === "trainings") {
    await updateProfileData({ trainings: [] });
    closeModal();
    return;
  }
  if (type === "matches") {
    await updateProfileData({ matches: [] });
    closeModal();
    return;
  }
  if (type === "images") {
    const slot = state.openModalMeta?.slot === "two" ? "two" : "one";
    await updateProfileData({
      images: {
        ...state.profileData.images,
        [slot]: ""
      }
    });
    closeModal();
  }
}

async function updateProfileData(patch) {
  const ref = profileDocRef(state.activeProfile);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

function renderNotesEditor(notes) {
  const items = notes.length ? notes : [{ subject: "", text: "" }];
  return `
    <div class="rowStack">
      <div class="helperText">Lägg in ämne och text.</div>
      <div id="notesEditorList" class="rowStack">
        ${items.map((note, idx) => renderSingleNoteEditor(note, idx)).join("")}
      </div>
      <button id="addNoteBtn" class="ghostBtn" type="button">+ Lägg till ämne</button>
    </div>
  `;
}

function renderSingleNoteEditor(note, idx) {
  return `
    <div class="entryCard" data-note-index="${idx}">
      <div class="entryTop">
        <div class="entryTitle">Ämne ${idx + 1}</div>
        <div class="entryActions">
          <button class="iconMiniBtn" type="button" data-note-up="${idx}">↑</button>
          <button class="iconMiniBtn" type="button" data-note-down="${idx}">↓</button>
          <button class="iconMiniBtn" type="button" data-note-remove="${idx}">✕</button>
        </div>
      </div>
      <div class="fieldBlock">
        <label class="fieldLabel">Ämne</label>
        <input type="text" data-note-subject="${idx}" value="${escapeAttr(note.subject || "")}" placeholder="T.ex. Jobb">
      </div>
      <div class="fieldBlock">
        <label class="fieldLabel">Text</label>
        <textarea rows="6" data-note-text="${idx}" placeholder="Skriv anteckning...">${escapeHtml(note.text || "")}</textarea>
      </div>
    </div>
  `;
}

function bindNotesEditor() {
  $("addNoteBtn")?.addEventListener("click", () => {
    const items = collectNotesEditor();
    items.push({ subject: "", text: "" });
    modalBody.innerHTML = renderNotesEditor(items);
    bindNotesEditor();
  });

  modalBody.querySelectorAll("[data-note-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.noteRemove);
      const items = collectNotesEditor();
      items.splice(idx, 1);
      modalBody.innerHTML = renderNotesEditor(items.length ? items : []);
      bindNotesEditor();
    });
  });

  modalBody.querySelectorAll("[data-note-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.noteUp);
      const items = collectNotesEditor();
      if (idx <= 0) return;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      modalBody.innerHTML = renderNotesEditor(items);
      bindNotesEditor();
    });
  });

  modalBody.querySelectorAll("[data-note-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.noteDown);
      const items = collectNotesEditor();
      if (idx >= items.length - 1) return;
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      modalBody.innerHTML = renderNotesEditor(items);
      bindNotesEditor();
    });
  });
}

function collectNotesEditor() {
  const wrappers = [...modalBody.querySelectorAll("[data-note-index]")];
  return wrappers.map((_, idx) => {
    const subject = modalBody.querySelector(`[data-note-subject="${idx}"]`)?.value?.trim() || "";
    const text = modalBody.querySelector(`[data-note-text="${idx}"]`)?.value?.trim() || "";
    return { subject, text };
  }).filter(item => item.subject || item.text);
}

function renderListsEditor(lists) {
  const items = lists.length ? lists : [{ title: "", completed: false, subtasks: [] }];
  return `
    <div class="rowStack">
      <div class="helperText">Skapa listor och delmål. Klara saker dimmas i widgeten.</div>
      <div id="listsEditorWrap" class="rowStack">
        ${items.map((list, idx) => renderSingleListEditor(list, idx)).join("")}
      </div>
      <button id="addListBtn" class="ghostBtn" type="button">+ Ny lista</button>
    </div>
  `;
}

function renderSingleListEditor(list, idx) {
  const subtasks = Array.isArray(list.subtasks) ? list.subtasks : [];
  return `
    <div class="entryCard" data-list-index="${idx}">
      <div class="entryTop">
        <div class="entryTitle">Lista ${idx + 1}</div>
        <div class="entryActions">
          <button class="iconMiniBtn" type="button" data-list-up="${idx}">↑</button>
          <button class="iconMiniBtn" type="button" data-list-down="${idx}">↓</button>
          <button class="iconMiniBtn" type="button" data-list-remove="${idx}">✕</button>
        </div>
      </div>

      <div class="fieldBlock">
        <label class="fieldLabel">Rubrik</label>
        <input type="text" data-list-title="${idx}" value="${escapeAttr(list.title || "")}" placeholder="T.ex. Inköpslista">
      </div>

      <label class="subtaskRow">
        <input class="checkbox" type="checkbox" data-list-completed="${idx}" ${list.completed ? "checked" : ""}>
        <span class="${list.completed ? "completedText" : ""}">Markera listan som klar</span>
        <span></span>
      </label>

      <div class="rowStack" data-subtask-wrap="${idx}">
        ${subtasks.map((sub, sIdx) => `
          <div class="subtaskRow" data-subtask-row="${idx}-${sIdx}">
            <input class="checkbox" type="checkbox" data-subtask-done="${idx}-${sIdx}" ${sub.done ? "checked" : ""}>
            <input type="text" data-subtask-text="${idx}-${sIdx}" value="${escapeAttr(sub.text || "")}" placeholder="Lägg till delmål..." class="${sub.done ? "completedText" : ""}">
            <button class="iconMiniBtn" type="button" data-subtask-remove="${idx}-${sIdx}">✕</button>
          </div>
        `).join("")}
      </div>

      <button class="ghostBtn" type="button" data-add-subtask="${idx}">+ Lägg till delmål</button>
    </div>
  `;
}

function bindListsEditor() {
  $("addListBtn")?.addEventListener("click", () => {
    const items = collectListsEditor();
    items.push({ title: "", completed: false, subtasks: [] });
    modalBody.innerHTML = renderListsEditor(items);
    bindListsEditor();
  });

  modalBody.querySelectorAll("[data-list-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.listRemove);
      const items = collectListsEditor();
      items.splice(idx, 1);
      modalBody.innerHTML = renderListsEditor(items.length ? items : []);
      bindListsEditor();
    });
  });

  modalBody.querySelectorAll("[data-list-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.listUp);
      const items = collectListsEditor();
      if (idx <= 0) return;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      modalBody.innerHTML = renderListsEditor(items);
      bindListsEditor();
    });
  });

  modalBody.querySelectorAll("[data-list-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.listDown);
      const items = collectListsEditor();
      if (idx >= items.length - 1) return;
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      modalBody.innerHTML = renderListsEditor(items);
      bindListsEditor();
    });
  });

  modalBody.querySelectorAll("[data-add-subtask]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.addSubtask);
      const items = collectListsEditor();
      items[idx].subtasks.push({ text: "", done: false });
      modalBody.innerHTML = renderListsEditor(items);
      bindListsEditor();
    });
  });

  modalBody.querySelectorAll("[data-subtask-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [listIdx, subIdx] = btn.dataset.subtaskRemove.split("-").map(Number);
      const items = collectListsEditor();
      items[listIdx].subtasks.splice(subIdx, 1);
      modalBody.innerHTML = renderListsEditor(items);
      bindListsEditor();
    });
  });
}

function collectListsEditor() {
  const listWrappers = [...modalBody.querySelectorAll("[data-list-index]")];
  return listWrappers.map((_, idx) => {
    const title = modalBody.querySelector(`[data-list-title="${idx}"]`)?.value?.trim() || "";
    const completed = !!modalBody.querySelector(`[data-list-completed="${idx}"]`)?.checked;

    const subtasks = [];
    const subRows = [...modalBody.querySelectorAll(`[data-subtask-row^="${idx}-"]`)];
    subRows.forEach((row) => {
      const [listId, subId] = row.dataset.subtaskRow.split("-").map(Number);
      const text = modalBody.querySelector(`[data-subtask-text="${listId}-${subId}"]`)?.value?.trim() || "";
      const done = !!modalBody.querySelector(`[data-subtask-done="${listId}-${subId}"]`)?.checked;
      if (text) subtasks.push({ text, done });
    });

    return { title, completed, subtasks };
  }).filter(item => item.title || item.subtasks.length);
}

function renderSimpleEntriesEditor(items, key) {
  const rows = items.length ? items : [{ title: "", text: "" }];
  return `
    <div class="rowStack">
      <div class="helperText">Kortare notiser som visas direkt i widgeten.</div>
      <div class="rowStack">
        ${rows.map((item, idx) => `
          <div class="entryCard" data-${key}-index="${idx}">
            <div class="entryTop">
              <div class="entryTitle">Rad ${idx + 1}</div>
              <div class="entryActions">
                <button class="iconMiniBtn" type="button" data-${key}-up="${idx}">↑</button>
                <button class="iconMiniBtn" type="button" data-${key}-down="${idx}">↓</button>
                <button class="iconMiniBtn" type="button" data-${key}-remove="${idx}">✕</button>
              </div>
            </div>
            <div class="fieldBlock">
              <label class="fieldLabel">Rubrik</label>
              <input type="text" data-${key}-title="${idx}" value="${escapeAttr(item.title || "")}" placeholder="T.ex. Alice">
            </div>
            <div class="fieldBlock">
              <label class="fieldLabel">Text</label>
              <input type="text" data-${key}-text="${idx}" value="${escapeAttr(item.text || "")}" placeholder="T.ex. läsläxa onsdag">
            </div>
          </div>
        `).join("")}
      </div>
      <button id="add${capitalize(key)}Btn" class="ghostBtn" type="button">+ Lägg till rad</button>
    </div>
  `;
}

function bindSimpleEntriesEditor(key) {
  $(`add${capitalize(key)}Btn`)?.addEventListener("click", () => {
    const items = collectSimpleEntries(key);
    items.push({ title: "", text: "" });
    modalBody.innerHTML = renderSimpleEntriesEditor(items, key);
    bindSimpleEntriesEditor(key);
  });

  modalBody.querySelectorAll(`[data-${key}-remove]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Remove`]);
      const items = collectSimpleEntries(key);
      items.splice(idx, 1);
      modalBody.innerHTML = renderSimpleEntriesEditor(items.length ? items : [], key);
      bindSimpleEntriesEditor(key);
    });
  });

  modalBody.querySelectorAll(`[data-${key}-up]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Up`]);
      const items = collectSimpleEntries(key);
      if (idx <= 0) return;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      modalBody.innerHTML = renderSimpleEntriesEditor(items, key);
      bindSimpleEntriesEditor(key);
    });
  });

  modalBody.querySelectorAll(`[data-${key}-down]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Down`]);
      const items = collectSimpleEntries(key);
      if (idx >= items.length - 1) return;
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      modalBody.innerHTML = renderSimpleEntriesEditor(items, key);
      bindSimpleEntriesEditor(key);
    });
  });
}

function collectSimpleEntries(key) {
  const rows = [...modalBody.querySelectorAll(`[data-${key}-index]`)];
  return rows.map((_, idx) => {
    const title = modalBody.querySelector(`[data-${key}-title="${idx}"]`)?.value?.trim() || "";
    const text = modalBody.querySelector(`[data-${key}-text="${idx}"]`)?.value?.trim() || "";
    return { title, text };
  }).filter(item => item.title || item.text);
}

function renderScheduleEditor(items, key) {
  const rows = items.length ? items : [{ child: "", day: "", time: "", place: "" }];
  return `
    <div class="rowStack">
      <div class="helperText">Lägg in fasta pass. Flytta upp och ner rader vid behov.</div>
      <div class="rowStack">
        ${rows.map((item, idx) => `
          <div class="entryCard" data-${key}-index="${idx}">
            <div class="entryTop">
              <div class="entryTitle">Rad ${idx + 1}</div>
              <div class="entryActions">
                <button class="iconMiniBtn" type="button" data-${key}-up="${idx}">↑</button>
                <button class="iconMiniBtn" type="button" data-${key}-down="${idx}">↓</button>
                <button class="iconMiniBtn" type="button" data-${key}-remove="${idx}">✕</button>
              </div>
            </div>

            <div class="grid3">
              <div class="fieldBlock">
                <label class="fieldLabel">Barn</label>
                <input type="text" data-${key}-child="${idx}" value="${escapeAttr(item.child || "")}" placeholder="Milo / Alice">
              </div>
              <div class="fieldBlock">
                <label class="fieldLabel">Dag</label>
                <input type="text" data-${key}-day="${idx}" value="${escapeAttr(item.day || "")}" placeholder="Måndag">
              </div>
              <div class="fieldBlock">
                <label class="fieldLabel">Tid</label>
                <input type="text" data-${key}-time="${idx}" value="${escapeAttr(item.time || "")}" placeholder="19-20">
              </div>
            </div>

            <div class="fieldBlock">
              <label class="fieldLabel">Plats / extra</label>
              <input type="text" data-${key}-place="${idx}" value="${escapeAttr(item.place || "")}" placeholder="Valfritt">
            </div>
          </div>
        `).join("")}
      </div>
      <button id="add${capitalize(key)}Btn" class="ghostBtn" type="button">+ Lägg till rad</button>
    </div>
  `;
}

function bindScheduleEditor(key) {
  $(`add${capitalize(key)}Btn`)?.addEventListener("click", () => {
    const items = collectScheduleEntries(key);
    items.push({ child: "", day: "", time: "", place: "" });
    modalBody.innerHTML = renderScheduleEditor(items, key);
    bindScheduleEditor(key);
  });

  modalBody.querySelectorAll(`[data-${key}-remove]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Remove`]);
      const items = collectScheduleEntries(key);
      items.splice(idx, 1);
      modalBody.innerHTML = renderScheduleEditor(items.length ? items : [], key);
      bindScheduleEditor(key);
    });
  });

  modalBody.querySelectorAll(`[data-${key}-up]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Up`]);
      const items = collectScheduleEntries(key);
      if (idx <= 0) return;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      modalBody.innerHTML = renderScheduleEditor(items, key);
      bindScheduleEditor(key);
    });
  });

  modalBody.querySelectorAll(`[data-${key}-down]`).forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset[`${key}Down`]);
      const items = collectScheduleEntries(key);
      if (idx >= items.length - 1) return;
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      modalBody.innerHTML = renderScheduleEditor(items, key);
      bindScheduleEditor(key);
    });
  });
}

function collectScheduleEntries(key) {
  const rows = [...modalBody.querySelectorAll(`[data-${key}-index]`)];
  return rows.map((_, idx) => {
    const child = modalBody.querySelector(`[data-${key}-child="${idx}"]`)?.value?.trim() || "";
    const day = modalBody.querySelector(`[data-${key}-day="${idx}"]`)?.value?.trim() || "";
    const time = modalBody.querySelector(`[data-${key}-time="${idx}"]`)?.value?.trim() || "";
    const place = modalBody.querySelector(`[data-${key}-place="${idx}"]`)?.value?.trim() || "";
    return { child, day, time, place };
  }).filter(item => item.child || item.day || item.time || item.place);
}

function renderImageEditor(slot) {
  const current = state.profileData.images?.[slot] || "";
  return `
    <div class="rowStack">
      <div class="helperText">Ladda upp en bild. Den komprimeras innan den sparas i Firebase.</div>
      ${current ? `<img src="${current}" alt="Nuvarande bild" style="width:100%; max-height:300px; object-fit:cover; border:1px solid rgba(255,255,255,.06);">` : ""}
      <div class="fieldBlock">
        <label class="fieldLabel">Välj bild</label>
        <input id="imageUploadInput" type="file" accept="image/*">
      </div>
      <input id="imageDataHolder" type="hidden" value="${escapeAttr(current)}">
      <div id="imageUploadStatus" class="helperText">${current ? "Nuvarande bild används tills du väljer en ny." : "Ingen bild vald ännu."}</div>
    </div>
  `;
}

function bindImageEditor() {
  $("imageUploadInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $("imageUploadStatus").textContent = "Komprimerar bild...";
    try {
      const compressed = await compressImageToDataUrl(file, 1400, 0.82);
      $("imageDataHolder").value = compressed;
      $("imageUploadStatus").textContent = "Bilden är klar att sparas.";
    } catch (err) {
      $("imageUploadStatus").textContent = "Kunde inte läsa bilden.";
      console.error(err);
    }
  });
}

function compressImageToDataUrl(file, maxSize = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadCalendarEvents() {
  const icsUrl = String(state.profileData.calendarIcs || "").trim();
  if (!icsUrl) {
    calendarTodayPreview.innerHTML = `<div class="emptyMini bright">Ingen kalenderlänk vald för ${escapeHtml(state.activeProfile)}</div>`;
    return;
  }

  calendarTodayPreview.innerHTML = `<div class="emptyMini bright">Laddar dagens händelser...</div>`;

  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(icsUrl)}`;
    const res = await fetch(proxyUrl);
    const icsText = await res.text();
    const events = parseICS(icsText);
    const todayEvents = filterEventsForToday(events);

    if (!todayEvents.length) {
      calendarTodayPreview.innerHTML = `<div class="emptyMini bright">Inga händelser idag</div>`;
      return;
    }

    calendarTodayPreview.innerHTML = todayEvents.slice(0, 5).map((item) => `
      <div>
        <div class="solidMain"><span class="calendarTime">${escapeHtml(item.time)}</span>${escapeHtml(item.summary)}</div>
        ${item.location ? `<div class="solidSub">${escapeHtml(item.location)}</div>` : ""}
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    calendarTodayPreview.innerHTML = `<div class="emptyMini bright">Kunde inte läsa kalendern just nu</div>`;
  }
}

function parseICS(icsText) {
  const rawLines = String(icsText || "").replace(/\r/g, "").split("\n");
  const lines = [];
  rawLines.forEach((line) => {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.trim();
    } else {
      lines.push(line);
    }
  });

  const events = [];
  let current = null;

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      return;
    }
    if (!current) return;

    const splitIndex = line.indexOf(":");
    if (splitIndex === -1) return;
    const rawKey = line.slice(0, splitIndex);
    const value = line.slice(splitIndex + 1);
    const key = rawKey.split(";")[0];

    if (key === "SUMMARY") current.summary = decodeICSText(value);
    if (key === "LOCATION") current.location = decodeICSText(value);
    if (key === "DTSTART") current.dtstart = value;
    if (key === "DTEND") current.dtend = value;
  });

  return events;
}

function decodeICSText(value) {
  return String(value || "")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/g, "\n");
}

function filterEventsForToday(events) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  return events
    .map((event) => {
      const start = parseICSDate(event.dtstart);
      if (!start) return null;
      if (
        start.getFullYear() !== y ||
        start.getMonth() !== m ||
        start.getDate() !== d
      ) return null;

      return {
        ...event,
        start,
        time: formatEventTime(start, event.dtstart)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function parseICSDate(value) {
  if (!value) return null;

  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    return new Date(y, m, d, 0, 0, 0);
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const mo = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    const hh = Number(value.slice(9, 11));
    const mm = Number(value.slice(11, 13));
    const ss = Number(value.slice(13, 15));
    return new Date(Date.UTC(y, mo, d, hh, mm, ss));
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const mo = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    const hh = Number(value.slice(9, 11));
    const mm = Number(value.slice(11, 13));
    const ss = Number(value.slice(13, 15));
    return new Date(y, mo, d, hh, mm, ss);
  }

  return null;
}

function formatEventTime(dateObj, rawValue) {
  if (/^\d{8}$/.test(rawValue || "")) return "Heldag";
  return dateObj.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

bootstrap();