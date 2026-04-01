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

const DEFAULT_CALENDAR_EMBEDS = {
  SB: "https://calendar.google.com/calendar/embed?src=ZXJpY3Nzb25ib25pbmlAZ21haWwuY29t&mode=AGENDA&ctz=Europe%2FStockholm&hl=sv&bgcolor=%23ffffff&showTitle=0&showTabs=0&showNav=0&showPrint=0&showCalendars=0&showDate=0",
  JA: ""
};

const TIMER_PRESETS = [2, 5, 15, 25];

const DEFAULT_PROFILE_DATA = {
  freeText: "",
  notes: [],
  lists: [],
  links: [],
  familyNotices: [],
  trainings: [],
  matches: [],
  images: {
    one: "",
    two: ""
  },
  calendarEmbedUrl: "",
  timerPreset: 5
};

const state = {
  activeProfile: localStorage.getItem("livelydashsb_activeProfile") || "SB",
  profileData: structuredCloneSafe(DEFAULT_PROFILE_DATA),
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

// Weather / time / profile
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

// Card previews
const freeTextPreview = $("freeTextPreview");
const listsPreview = $("listsPreview");
const notesPreview = $("notesPreview");
const linksPreview = $("linksPreview");
const noticesPreview = $("noticesPreview");
const trainingsPreview = $("trainingsPreview");
const matchesPreview = $("matchesPreview");

// Images
const imageOnePreview = $("imageOnePreview");
const imageOnePlaceholder = $("imageOnePlaceholder");
const imageTwoPreview = $("imageTwoPreview");
const imageTwoPlaceholder = $("imageTwoPlaceholder");

// Timer
const timerCard = $("timerCard");
const timerPresetText = $("timerPresetText");
const timerStatus = $("timerStatus");
const timerProgress = $("timerProgress");

// Modal
const modalRoot = $("modalRoot");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalSaveBtn = $("modalSaveBtn");
const modalDeleteBtn = $("modalDeleteBtn");
const modalCloseBtn = $("modalCloseBtn");

// Profile modal
const profileModalRoot = $("profileModalRoot");
const profileModalCloseBtn = $("profileModalCloseBtn");

// QR
const qrDock = $("qrDock");
const qrModalRoot = $("qrModalRoot");
const qrModalCloseBtn = $("qrModalCloseBtn");
const qrUrlText = $("qrUrlText");
const qrCanvasMini = $("qrCanvasMini");
const qrCanvasLarge = $("qrCanvasLarge");

// Calendar (embed version)
const calendarFallback = $("calendarFallback");
const calendarEmbedWrap = $("calendarEmbedWrap");
const calendarFrame = $("calendarFrame");

// Backwards-compatible old calendar preview node if it still exists
const calendarTodayPreview = $("calendarTodayPreview");

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function profileDocRef(profile) {
  return doc(db, "livelydashsb_profiles", profile);
}

function ensureProfileShape(data, profile) {
  const merged = {
    ...structuredCloneSafe(DEFAULT_PROFILE_DATA),
    ...(data || {})
  };

  if (!Array.isArray(merged.notes)) merged.notes = [];
  if (!Array.isArray(merged.lists)) merged.lists = [];
  if (!Array.isArray(merged.links)) merged.links = [];
  if (!Array.isArray(merged.familyNotices)) merged.familyNotices = [];
  if (!Array.isArray(merged.trainings)) merged.trainings = [];
  if (!Array.isArray(merged.matches)) merged.matches = [];

  if (!merged.images || typeof merged.images !== "object") {
    merged.images = { one: "", two: "" };
  }

  if (!merged.calendarEmbedUrl) {
    merged.calendarEmbedUrl = DEFAULT_CALENDAR_EMBEDS[profile] || "";
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
  });
}

function updateProfileUi() {
  const active = state.activeProfile;
  if (profileTabSB) profileTabSB.classList.toggle("active", active === "SB");
  if (profileTabJA) profileTabJA.classList.toggle("active", active === "JA");
  if (profileCircleText) profileCircleText.textContent = active;
}

function setupClock() {
  if (!timeBig || !dateBig) return;

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
  if (!weatherTemp || !weatherLabel || !weatherMeta) return;

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
  if (!qrDock || !qrCanvasMini || !qrCanvasLarge || !qrUrlText || !qrModalRoot) return;

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
  qrModalCloseBtn?.addEventListener("click", closeQrModal);
  qrModalRoot.querySelector(".modalBackdrop")?.addEventListener("click", closeQrModal);
}

function openQrModal() {
  qrModalRoot?.classList.remove("hidden");
}

function closeQrModal() {
  qrModalRoot?.classList.add("hidden");
}

function setupModalEvents() {
  modalCloseBtn?.addEventListener("click", closeModal);
  modalRoot?.querySelector(".modalBackdrop")?.addEventListener("click", closeModal);

  modalSaveBtn?.addEventListener("click", saveCurrentModal);
  modalDeleteBtn?.addEventListener("click", deleteCurrentModal);

  profileCircleBtn?.addEventListener("click", () => {
    profileModalRoot?.classList.remove("hidden");
  });

  profileModalCloseBtn?.addEventListener("click", () => {
    profileModalRoot?.classList.add("hidden");
  });

  profileModalRoot?.querySelector(".modalBackdrop")?.addEventListener("click", () => {
    profileModalRoot?.classList.add("hidden");
  });

  profileModalRoot?.querySelectorAll("[data-profile-pick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await switchProfile(btn.dataset.profilePick);
      profileModalRoot?.classList.add("hidden");
    });
  });

  profileTabSB?.addEventListener("click", () => switchProfile("SB"));
  profileTabJA?.addEventListener("click", () => switchProfile("JA"));

  refreshBtn?.addEventListener("click", () => location.reload());
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
  $("freeTextCard")?.addEventListener("click", () => openWidgetModal("freeText"));
  $("listsCard")?.addEventListener("click", () => openWidgetModal("lists"));
  $("linksCard")?.addEventListener("click", () => openWidgetModal("links"));
  $("notesCard")?.addEventListener("click", () => openWidgetModal("notes"));
  $("noticesCard")?.addEventListener("click", () => openWidgetModal("familyNotices"));
  $("trainingsCard")?.addEventListener("click", () => openWidgetModal("trainings"));
  $("matchesCard")?.addEventListener("click", () => openWidgetModal("matches"));
  $("imageOneCard")?.addEventListener("click", () => openWidgetModal("images", { slot: "one" }));
  $("imageTwoCard")?.addEventListener("click", () => openWidgetModal("images", { slot: "two" }));
}

function renderAll() {
  renderFreeText();
  renderListsPreview();
  renderNotesPreview();
  renderLinksPreview();
  renderFamilyNoticesPreview();
  renderEventsPreview("trainings", trainingsPreview, 8);
  renderEventsPreview("matches", matchesPreview, 6);
  renderImages();
  renderCalendar();
  renderTimer();
}

function renderFreeText() {
  if (!freeTextPreview) return;
  const value = String(state.profileData.freeText || "").trim();
  freeTextPreview.textContent = value || "Tryck för att skriva.";
}

function renderListsPreview() {
  if (!listsPreview) return;

  const lists = [...(state.profileData.lists || [])];
  if (!lists.length) {
    listsPreview.innerHTML = `<div class="emptyMini">Tryck för att skapa listor</div>`;
    return;
  }

  const sorted = [
    ...lists.filter(i => !i.completed),
    ...lists.filter(i => i.completed)
  ].slice(0, 4);

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
  if (!notesPreview) return;

  const notes = (state.profileData.notes || []).slice(0, 5);
  if (!notes.length) {
    notesPreview.innerHTML = `<div class="emptyMini">Tryck för att lägga till ämnen</div>`;
    return;
  }

  notesPreview.innerHTML = notes.map((note) => {
    const snippet = String(note.text || "").trim().slice(0, 56);
    return `
      <div>
        <div class="noteSubject">${escapeHtml(note.subject || "Ämne")}</div>
        <div class="noteSnippet">${escapeHtml(snippet || "Ingen text ännu")}</div>
      </div>
    `;
  }).join("");
}

function renderLinksPreview() {
  if (!linksPreview) return;

  const links = (state.profileData.links || []).slice(0, 6);
  if (!links.length) {
    linksPreview.innerHTML = `<div class="emptyMini bright">Tryck för att lägga till länkar</div>`;
    return;
  }

  linksPreview.innerHTML = links.map((item) => `
    <div>
      <div class="solidMain">🔗 ${escapeHtml(item.name || "Länk")}</div>
      <div class="solidSub">${escapeHtml(item.url || "")}</div>
    </div>
  `).join("");
}

function renderFamilyNoticesPreview() {
  if (!noticesPreview) return;

  const notices = (state.profileData.familyNotices || []).slice(0, 5);
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

function renderEventsPreview(key, targetEl, limit = 6) {
  if (!targetEl) return;

  const items = [...(state.profileData[key] || [])];
  if (!items.length) {
    targetEl.innerHTML = `<div class="emptyMini bright">Tryck för att lägga till</div>`;
    return;
  }

  targetEl.innerHTML = items.slice(0, limit).map((item) => `
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
  if (!imgEl || !placeholderEl) return;

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

function renderCalendar() {
  const url = String(state.profileData.calendarEmbedUrl || "").trim();

  if (calendarFrame && calendarEmbedWrap && calendarFallback) {
    if (!url) {
      calendarEmbedWrap.classList.add("hidden");
      calendarFallback.classList.remove("hidden");
      return;
    }

    calendarFrame.src = url;
    calendarFallback.classList.add("hidden");
    calendarEmbedWrap.classList.remove("hidden");
    return;
  }

  // fallback for older HTML if the embed nodes aren't there
  if (calendarTodayPreview) {
    if (!url) {
      calendarTodayPreview.innerHTML = `<div class="emptyMini bright">Kalender ej kopplad ännu</div>`;
      return;
    }

    calendarTodayPreview.innerHTML = `
      <div style="position:relative; width:100%; height:100%; min-height:180px; overflow:hidden;">
        <iframe
          src="${escapeAttr(url)}"
          style="position:absolute; inset:-118px 0 -310px 0; width:100%; height:760px; border:0; filter:grayscale(.08) contrast(.95) brightness(.88); pointer-events:none;"
          title="Google kalender"
          loading="lazy"
        ></iframe>
        <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(3,10,16,.78) 0%, rgba(3,10,16,.56) 18%, rgba(3,10,16,.28) 36%, rgba(3,10,16,.18) 100%);"></div>
      </div>
    `;
  }
}

function setupTimerEvents() {
  if (!timerCard) return;

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
  if (!timerPresetText || !timerStatus || !timerProgress) return;

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
  if (!timerProgress) return;

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
  if (!modalRoot || !modalTitle || !modalBody) return;

  state.openModalType = type;
  state.openModalMeta = meta;
  modalDeleteBtn?.classList.add("hidden");

  if (type === "freeText") {
    modalTitle.textContent = "Fritext";
    modalBody.innerHTML = `
      <div class="fieldBlock">
        <label class="fieldLabel" for="freeTextInput">Text</label>
        <textarea id="freeTextInput" rows="18" placeholder="Skriv här...">${escapeHtml(state.profileData.freeText || "")}</textarea>
      </div>
    `;
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "notes") {
    modalTitle.textContent = "Anteckningar";
    modalBody.innerHTML = renderNotesEditor(state.profileData.notes || []);
    bindNotesEditor();
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "lists") {
    modalTitle.textContent = "Listor";
    modalBody.innerHTML = renderListsEditor(state.profileData.lists || []);
    bindListsEditor();
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "links") {
    modalTitle.textContent = "Länkar";
    modalBody.innerHTML = renderLinksEditor(state.profileData.links || []);
    bindLinksEditor();
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "familyNotices") {
    modalTitle.textContent = "Familjenotiser";
    modalBody.innerHTML = renderSimpleEntriesEditor(state.profileData.familyNotices || [], "notices");
    bindSimpleEntriesEditor("notices");
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "trainings") {
    modalTitle.textContent = "Träningar";
    modalBody.innerHTML = renderScheduleEditor(state.profileData.trainings || [], "trainings");
    bindScheduleEditor("trainings");
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "matches") {
    modalTitle.textContent = "Matcher";
    modalBody.innerHTML = renderScheduleEditor(state.profileData.matches || [], "matches");
    bindScheduleEditor("matches");
    modalDeleteBtn?.classList.remove("hidden");
  }

  if (type === "images") {
    const slot = meta?.slot === "two" ? "two" : "one";
    modalTitle.textContent = slot === "one" ? "Bild 1" : "Bild 2";
    modalBody.innerHTML = renderImageEditor(slot);
    bindImageEditor(slot);
    modalDeleteBtn?.classList.remove("hidden");
  }

  modalRoot.classList.remove("hidden");
}

function closeModal() {
  state.openModalType = null;
  state.openModalMeta = null;
  modalRoot?.classList.add("hidden");
  if (modalBody) modalBody.innerHTML = "";
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

  if (type === "links") {
    await updateProfileData({ links: collectLinksEditor() });
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

  if (type === "links") {
    await updateProfileData({ links: [] });
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

function renderLinksEditor(items) {
  const rows = items.length ? items : [{ name: "", url: "" }];
  return `
    <div class="rowStack">
      <div class="helperText">Lägg till klickbara länkar.</div>
      <div class="rowStack">
        ${rows.map((item, idx) => `
          <div class="entryCard" data-links-index="${idx}">
            <div class="entryTop">
              <div class="entryTitle">Länk ${idx + 1}</div>
              <div class="entryActions">
                <button class="iconMiniBtn" type="button" data-links-up="${idx}">↑</button>
                <button class="iconMiniBtn" type="button" data-links-down="${idx}">↓</button>
                <button class="iconMiniBtn" type="button" data-links-remove="${idx}">✕</button>
              </div>
            </div>
            <div class="fieldBlock">
              <label class="fieldLabel">Namn</label>
              <input type="text" data-links-name="${idx}" value="${escapeAttr(item.name || "")}" placeholder="T.ex. Avanza">
            </div>
            <div class="fieldBlock">
              <label class="fieldLabel">Länk</label>
              <input type="text" data-links-url="${idx}" value="${escapeAttr(item.url || "")}" placeholder="https://...">
            </div>
          </div>
        `).join("")}
      </div>
      <button id="addLinksBtn" class="ghostBtn" type="button">+ Lägg till länk</button>
    </div>
  `;
}

function bindLinksEditor() {
  $("addLinksBtn")?.addEventListener("click", () => {
    const items = collectLinksEditor();
    items.push({ name: "", url: "" });
    modalBody.innerHTML = renderLinksEditor(items);
    bindLinksEditor();
  });

  modalBody.querySelectorAll("[data-links-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.linksRemove);
      const items = collectLinksEditor();
      items.splice(idx, 1);
      modalBody.innerHTML = renderLinksEditor(items.length ? items : []);
      bindLinksEditor();
    });
  });

  modalBody.querySelectorAll("[data-links-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.linksUp);
      const items = collectLinksEditor();
      if (idx <= 0) return;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      modalBody.innerHTML = renderLinksEditor(items);
      bindLinksEditor();
    });
  });

  modalBody.querySelectorAll("[data-links-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.linksDown);
      const items = collectLinksEditor();
      if (idx >= items.length - 1) return;
      [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
      modalBody.innerHTML = renderLinksEditor(items);
      bindLinksEditor();
    });
  });
}

function collectLinksEditor() {
  const rows = [...modalBody.querySelectorAll("[data-links-index]")];
  return rows.map((_, idx) => {
    const name = modalBody.querySelector(`[data-links-name="${idx}"]`)?.value?.trim() || "";
    const url = modalBody.querySelector(`[data-links-url="${idx}"]`)?.value?.trim() || "";
    return { name, url };
  }).filter(item => item.name || item.url);
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
