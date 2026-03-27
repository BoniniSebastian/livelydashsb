import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  setDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const DEFAULT_FIXED_BETS = [
  { id: "firstGoalTeam", label: "Lag som gör första målet", type: "team_first_goal", points: 100 },
  { id: "homePlayerFirstGoal", label: "Vilken spelare i hemmalaget gör första målet", type: "home_player_first_goal", points: 100 },
  { id: "firstPenaltyTeam", label: "Vilket lag tar första utvisningen", type: "first_penalty_team", points: 100 },
  { id: "period2GoalsOU", label: "Totalt antal mål i period 2", type: "period2_goals_ou", points: 100 },
  { id: "penaltyInP1", label: "Blir det en utvisning i period 1", type: "penalty_p1_yes_no", points: 100 },
  { id: "homeWin", label: "Vinner hemmalaget matchen", type: "home_win_yes_no", points: 100 }
];

const DEFAULT_SIDEBETS = [
  { id: "sidebet1", label: "", optionA: "", optionB: "", points: 100 },
  { id: "sidebet2", label: "", optionA: "", optionB: "", points: 100 },
  { id: "sidebet3", label: "", optionA: "", optionB: "", points: 100 },
  { id: "sidebet4", label: "", optionA: "", optionB: "", points: 100 }
];

const list = document.getElementById("list");
const addBtn = document.getElementById("addBtn");
const matchEl = document.getElementById("match");

const couponModal = document.getElementById("couponModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalBackdrop = document.querySelector(".modalBackdrop");
const nameInput = document.getElementById("nameInput");
const couponQuestions = document.getElementById("couponQuestions");
const saveCouponBtn = document.getElementById("saveCouponBtn");

const detailModal = document.getElementById("detailModal");
const closeDetailBtn = document.getElementById("closeDetailBtn");
const detailBackdrop = document.querySelector(".detailBackdrop");
const detailName = document.getElementById("detailName");
const detailScore = document.getElementById("detailScore");
const detailStatus = document.getElementById("detailStatus");
const detailBreakdown = document.getElementById("detailBreakdown");

const adminBtn = document.getElementById("adminBtn");
const adminModal = document.getElementById("adminModal");
const closeAdminBtn = document.getElementById("closeAdminBtn");
const adminBackdrop = document.querySelector(".adminBackdrop");
const saveAdminBtn = document.getElementById("saveAdminBtn");
const resetRoundBtn = document.getElementById("resetRoundBtn");

const roundTitleInput = document.getElementById("roundTitleInput");
const matchLinkInput = document.getElementById("matchLinkInput");
const homeTeamInput = document.getElementById("homeTeamInput");
const awayTeamInput = document.getElementById("awayTeamInput");
const rosterInput = document.getElementById("rosterInput");
const fixedBetsAdmin = document.getElementById("fixedBetsAdmin");
const sidebetsAdmin = document.getElementById("sidebetsAdmin");

const qrBtn = document.getElementById("qrBtn");
const qrModal = document.getElementById("qrModal");
const closeQrBtn = document.getElementById("closeQrBtn");
const qrBackdrop = document.querySelector(".qrBackdrop");
const qrCanvasInline = document.getElementById("qrCanvasInline");
const qrCanvasBig = document.getElementById("qrCanvasBig");
const shareUrlText = document.getElementById("shareUrlText");
const qrUrlText = document.getElementById("qrUrlText");

const currentRoundRef = doc(db, "appState", "currentRound");

let participantsCache = [];
let currentRound = null;
let inlineQr = null;
let bigQr = null;

function buildDefaultRound() {
  return {
    title: "",
    matchLink: "",
    homeTeam: "",
    awayTeam: "",
    rosterRaw: "",
    rosterPlayers: [],
    fixedBets: structuredClone(DEFAULT_FIXED_BETS),
    sidebets: structuredClone(DEFAULT_SIDEBETS),
    correctAnswers: {}
  };
}

function ensureRoundShape(roundData) {
  const base = buildDefaultRound();
  const merged = {
    ...base,
    ...(roundData || {})
  };

  merged.fixedBets = Array.isArray(roundData?.fixedBets) && roundData.fixedBets.length
    ? roundData.fixedBets
    : structuredClone(DEFAULT_FIXED_BETS);

  merged.sidebets = Array.isArray(roundData?.sidebets) && roundData.sidebets.length
    ? roundData.sidebets
    : structuredClone(DEFAULT_SIDEBETS);

  if (!Array.isArray(merged.rosterPlayers)) merged.rosterPlayers = [];
  if (!merged.correctAnswers || typeof merged.correctAnswers !== "object") merged.correctAnswers = {};

  return merged;
}

function getActiveSidebets(round = currentRound) {
  const data = ensureRoundShape(round);
  return (data.sidebets || []).filter(isSidebetActive);
}

function isSidebetActive(bet) {
  const label = String(bet?.label || "").trim();
  const optionA = String(bet?.optionA || "").trim();
  const optionB = String(bet?.optionB || "").trim();
  return !!(label && optionA && optionB);
}

function openCouponModal() {
  renderCouponQuestions();
  couponModal.classList.remove("hidden");
  nameInput.focus();
}

function closeCouponModal() {
  couponModal.classList.add("hidden");
  resetCouponForm();
}

function resetCouponForm() {
  nameInput.value = "";
  nameInput.disabled = false;
  renderCouponQuestions();
}

function openDetailModal(data) {
  detailName.textContent = data.name || "Kupong";
  detailScore.textContent = `${data.score || 0} p`;
  detailStatus.textContent = data.lockedIn ? "LOCKED" : "ÖPPEN";

  const round = ensureRoundShape(currentRound);
  const results = data.results || {};
  const blocks = [];

  round.fixedBets.forEach((bet) => {
    const status = results[bet.id];
    const earned = status === "correct" ? Number(bet.points || 0) : 0;

    blocks.push(`
      <div class="breakdownItem">
        <div class="breakdownTitle">${escapeHtml(bet.label)}</div>
        <div class="breakdownMeta">Ditt val: ${escapeHtml(readableAnswer(bet, data?.bets?.[bet.id]))}</div>
        <div class="breakdownMeta">Status: ${escapeHtml(resultBadge(status))}</div>
        <div class="breakdownMeta">Poäng: ${earned > 0 ? `+${earned}` : "0"}</div>
      </div>
    `);
  });

  getActiveSidebets(round).forEach((bet) => {
    const status = results[bet.id];
    const earned = status === "correct" ? Number(bet.points || 0) : 0;

    blocks.push(`
      <div class="breakdownItem">
        <div class="breakdownTitle">${escapeHtml(bet.label)}</div>
        <div class="breakdownMeta">Ditt val: ${escapeHtml(readableAnswer(bet, data?.bets?.[bet.id]))}</div>
        <div class="breakdownMeta">Status: ${escapeHtml(resultBadge(status))}</div>
        <div class="breakdownMeta">Poäng: ${earned > 0 ? `+${earned}` : "0"}</div>
      </div>
    `);
  });

  detailBreakdown.innerHTML = blocks.join("");
  detailModal.classList.remove("hidden");
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
}

function openAdminModal() {
  syncAdminFormFromRound();
  renderAdminFixedBets();
  renderAdminSidebets();
  renderAdminSidebetResults();
  adminModal.classList.remove("hidden");
}

function closeAdminModal() {
  adminModal.classList.add("hidden");
}

function openQrModal() {
  updateQrCodes();
  qrModal.classList.remove("hidden");
}

function closeQrModal() {
  qrModal.classList.add("hidden");
}

function syncAdminFormFromRound() {
  const round = ensureRoundShape(currentRound);
  roundTitleInput.value = round.title || "";
  matchLinkInput.value = round.matchLink || "";
  homeTeamInput.value = round.homeTeam || "";
  awayTeamInput.value = round.awayTeam || "";
  rosterInput.value = round.rosterRaw || "";
}

function renderAdminFixedBets() {
  const round = ensureRoundShape(currentRound);
  fixedBetsAdmin.innerHTML = "";

  // hjälplänk till matchsök
  const helper = document.createElement("div");
  helper.className = "adminItem";
  helper.innerHTML = `
    <div class="adminItemHead">
      <div class="adminItemTitle">Matchsök</div>
    </div>
    <div class="breakdownMeta">
      <a href="https://stats.innebandy.se/sok" target="_blank" rel="noopener noreferrer">
        Öppna matchsök
      </a>
    </div>
  `;
  fixedBetsAdmin.appendChild(helper);

  round.fixedBets.forEach((bet) => {
    const row = document.createElement("div");
    row.className = "adminItem";
    row.innerHTML = `
      <div class="adminItemHead">
        <div class="adminItemTitle">${escapeHtml(bet.label)}</div>
      </div>
      <div class="adminMiniGrid">
        <label class="field">
          <span>Poäng</span>
          <input type="number" min="0" data-fixed-points="${escapeHtml(bet.id)}" value="${Number(bet.points || 0)}">
        </label>
        <div></div>
      </div>
    `;
    fixedBetsAdmin.appendChild(row);
  });
}

function renderAdminSidebets() {
  const round = ensureRoundShape(currentRound);
  sidebetsAdmin.innerHTML = "";

  round.sidebets.forEach((bet, index) => {
    const row = document.createElement("div");
    row.className = "adminItem";
    row.innerHTML = `
      <div class="adminItemHead">
        <div class="adminItemTitle">Sidebet ${index + 1}</div>
      </div>
      <label class="field">
        <span>Rubrik</span>
        <input type="text" data-side-label="${escapeHtml(bet.id)}" value="${escapeHtmlAttr(bet.label || "")}">
      </label>
      <div class="sidebetGrid">
        <label class="field">
          <span>Alternativ A</span>
          <input type="text" data-side-a="${escapeHtml(bet.id)}" value="${escapeHtmlAttr(bet.optionA || "")}">
        </label>
        <label class="field">
          <span>Alternativ B</span>
          <input type="text" data-side-b="${escapeHtml(bet.id)}" value="${escapeHtmlAttr(bet.optionB || "")}">
        </label>
        <label class="field">
          <span>Poäng</span>
          <input type="number" min="0" data-side-points="${escapeHtml(bet.id)}" value="${Number(bet.points || 0)}">
        </label>
      </div>
    `;
    sidebetsAdmin.appendChild(row);
  });
}

function renderAdminSidebetResults() {
  const round = ensureRoundShape(currentRound);
  const activeSidebets = getActiveSidebets(round);

  if (!activeSidebets.length) return;

  const wrap = document.createElement("div");
  wrap.className = "adminItem";
  wrap.innerHTML = `
    <div class="adminItemHead">
      <div class="adminItemTitle">Rätta sidebets</div>
    </div>
  `;

  activeSidebets.forEach((bet) => {
    const correct = round.correctAnswers?.[bet.id] || "";

    const row = document.createElement("div");
    row.className = "adminItem";
    row.style.marginTop = "10px";
    row.innerHTML = `
      <div class="adminItemTitle">${escapeHtml(bet.label)}</div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button
          type="button"
          data-answer="${escapeHtml(bet.id)}-A"
          class="ghostBtn"
          style="${correct === "A" ? "box-shadow:0 0 12px rgba(25,246,255,.25); border-color:rgba(25,246,255,.45);" : ""}"
        >
          ${escapeHtml(bet.optionA)}
        </button>
        <button
          type="button"
          data-answer="${escapeHtml(bet.id)}-B"
          class="ghostBtn"
          style="${correct === "B" ? "box-shadow:0 0 12px rgba(25,246,255,.25); border-color:rgba(25,246,255,.45);" : ""}"
        >
          ${escapeHtml(bet.optionB)}
        </button>
      </div>
    `;

    wrap.appendChild(row);
  });

  sidebetsAdmin.appendChild(wrap);

  wrap.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.onclick = async () => {
      const [betId, val] = btn.dataset.answer.split("-");

      const newCorrect = {
        ...(ensureRoundShape(currentRound).correctAnswers || {}),
        [betId]: val
      };

      await setDoc(currentRoundRef, {
        correctAnswers: newCorrect
      }, { merge: true });

      await recalcScores();
    };
  });
}

function renderCouponQuestions(existingBets = {}) {
  const round = ensureRoundShape(currentRound);
  const html = [];

  round.fixedBets.forEach((bet) => {
    html.push(renderQuestionCard(bet, existingBets[bet.id]));
  });

  getActiveSidebets(round).forEach((bet) => {
    html.push(renderQuestionCard(bet, existingBets[bet.id]));
  });

  couponQuestions.innerHTML = html.join("");
}

function renderQuestionCard(bet, value) {
  const points = Number(bet.points || 0);
  const options = getOptionsForBet(bet);

  return `
    <div class="questionCard">
      <div class="questionTop">
        <div class="questionLabel">${escapeHtml(bet.label)}</div>
        <div class="pointsBadge">${points} p</div>
      </div>
      <label class="field">
        <span>Välj</span>
        <select data-question-id="${escapeHtml(bet.id)}">
          <option value="">Välj</option>
          ${options.map(opt => `
            <option value="${escapeHtml(opt.value)}" ${value === opt.value ? "selected" : ""}>
              ${escapeHtml(opt.label)}
            </option>
          `).join("")}
        </select>
      </label>
    </div>
  `;
}

function getOptionsForBet(bet) {
  switch (bet.type) {
    case "team_first_goal":
      return [
        { value: "home", label: currentRound?.homeTeam || "Hemmalag" },
        { value: "away", label: currentRound?.awayTeam || "Bortalag" }
      ];

    case "home_player_first_goal":
      return (currentRound?.rosterPlayers || []).map((name) => ({
        value: name,
        label: name
      }));

    case "first_penalty_team":
      return [
        { value: "home", label: currentRound?.homeTeam || "Hemmalag" },
        { value: "away", label: currentRound?.awayTeam || "Bortalag" },
        { value: "none", label: "Ingen utvisning" }
      ];

    case "period2_goals_ou":
      return [
        { value: "under_3", label: "Under 3 mål" },
        { value: "over_3", label: "Över 3 mål" }
      ];

    case "penalty_p1_yes_no":
      return [
        { value: "yes", label: "Ja" },
        { value: "no", label: "Nej" }
      ];

    case "home_win_yes_no":
      return [
        { value: "yes", label: "Ja" },
        { value: "no", label: "Nej" }
      ];

    default:
      return [
        { value: "A", label: bet.optionA || "Alternativ A" },
        { value: "B", label: bet.optionB || "Alternativ B" }
      ];
  }
}

function collectCouponAnswers() {
  const answers = {};
  const selects = couponQuestions.querySelectorAll("select[data-question-id]");

  for (const select of selects) {
    const key = select.dataset.questionId;
    answers[key] = select.value;
  }

  return answers;
}

function validateCouponAnswers() {
  const selects = couponQuestions.querySelectorAll("select[data-question-id]");
  for (const select of selects) {
    if (!select.value) return false;
  }
  return true;
}

function parseRoster(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const players = [];

  for (const line of lines) {
    if (/^målvakt$/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;

    const cleaned = line.replace(/^\d+\s+/, "").trim();
    if (!cleaned) continue;
    if (/^målvakt$/i.test(cleaned)) continue;

    players.push(cleaned);
  }

  return [...new Set(players)];
}

function updateQrCodes() {
  const url = window.location.href;
  shareUrlText.textContent = url;
  qrUrlText.textContent = url;

  if (!inlineQr) {
    inlineQr = new QRious({
      element: qrCanvasInline,
      value: url,
      size: 76,
      background: "white",
      foreground: "black"
    });
  } else {
    inlineQr.value = url;
  }

  if (!bigQr) {
    bigQr = new QRious({
      element: qrCanvasBig,
      value: url,
      size: 220,
      background: "white",
      foreground: "black"
    });
  } else {
    bigQr.value = url;
  }
}

async function recalcScores() {
  const round = ensureRoundShape(currentRound);
  const correct = round.correctAnswers || {};

  const snap = await getDocs(collection(db, "participants"));
  const updates = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    let score = 0;
    const results = {};

    round.fixedBets.forEach((bet) => {
      const userVal = data?.bets?.[bet.id];
      const correctVal = correct?.[bet.id];

      if (!correctVal) {
        results[bet.id] = "pending";
        return;
      }

      if (userVal === correctVal) {
        score += Number(bet.points || 0);
        results[bet.id] = "correct";
      } else {
        results[bet.id] = "wrong";
      }
    });

    getActiveSidebets(round).forEach((bet) => {
      const userVal = data?.bets?.[bet.id];
      const correctVal = correct?.[bet.id];

      if (!correctVal) {
        results[bet.id] = "pending";
        return;
      }

      if (userVal === correctVal) {
        score += Number(bet.points || 0);
        results[bet.id] = "correct";
      } else {
        results[bet.id] = "wrong";
      }
    });

    updates.push(
      updateDoc(doc(db, "participants", docSnap.id), {
        score,
        results
      })
    );
  });

  await Promise.all(updates);
}

addBtn.onclick = openCouponModal;
closeModalBtn.onclick = closeCouponModal;
modalBackdrop.onclick = closeCouponModal;

closeDetailBtn.onclick = closeDetailModal;
detailBackdrop.onclick = closeDetailModal;

adminBtn.onclick = openAdminModal;
closeAdminBtn.onclick = closeAdminModal;
adminBackdrop.onclick = closeAdminModal;

qrBtn.onclick = openQrModal;
closeQrBtn.onclick = closeQrModal;
qrBackdrop.onclick = closeQrModal;

nameInput.addEventListener("blur", tryLoadExistingCouponByName);

async function tryLoadExistingCouponByName() {
  const rawName = nameInput.value.trim();
  if (!rawName) return;

  const existing = findParticipantByName(rawName);
  if (!existing) {
    renderCouponQuestions();
    return;
  }

  renderCouponQuestions(existing.bets || {});
}

saveCouponBtn.onclick = async () => {
  const name = normalizeName(nameInput.value);

  if (!name) {
    alert("Skriv ditt namn.");
    return;
  }

  if (!validateCouponAnswers()) {
    alert("Fyll i hela kupongen.");
    return;
  }

  const answers = collectCouponAnswers();
  const existing = findParticipantByName(name);

  if (existing) {
    const ref = doc(db, "participants", existing.id);

    await updateDoc(ref, {
      name,
      lockedIn: true,
      bets: answers
    });
  } else {
    await addDoc(collection(db, "participants"), {
      name,
      lockedIn: true,
      score: 0,
      bets: answers,
      results: {},
      createdAt: serverTimestamp()
    });
  }

  await recalcScores();
  closeCouponModal();
};

saveAdminBtn.onclick = async () => {
  const current = ensureRoundShape(currentRound);

  const fixedBets = current.fixedBets.map((bet) => {
    const input = fixedBetsAdmin.querySelector(`[data-fixed-points="${bet.id}"]`);
    return {
      ...bet,
      points: Number(input?.value || 0)
    };
  });

  const sidebets = current.sidebets.map((bet) => {
    const labelEl = sidebetsAdmin.querySelector(`[data-side-label="${bet.id}"]`);
    const aEl = sidebetsAdmin.querySelector(`[data-side-a="${bet.id}"]`);
    const bEl = sidebetsAdmin.querySelector(`[data-side-b="${bet.id}"]`);
    const pointsEl = sidebetsAdmin.querySelector(`[data-side-points="${bet.id}"]`);

    return {
      ...bet,
      label: labelEl?.value?.trim() || "",
      optionA: aEl?.value?.trim() || "",
      optionB: bEl?.value?.trim() || "",
      points: Number(pointsEl?.value || 0)
    };
  });

  const rosterRaw = rosterInput.value.trim();
  const rosterPlayers = parseRoster(rosterRaw);

  const payload = {
    title: roundTitleInput.value.trim(),
    matchLink: matchLinkInput.value.trim(),
    homeTeam: homeTeamInput.value.trim(),
    awayTeam: awayTeamInput.value.trim(),
    rosterRaw,
    rosterPlayers,
    fixedBets,
    sidebets,
    correctAnswers: current.correctAnswers || {},
    updatedAt: serverTimestamp()
  };

  await setDoc(currentRoundRef, payload, { merge: true });
  await recalcScores();
  closeAdminModal();
};

resetRoundBtn.onclick = async () => {
  const ok = confirm("Är du säker? Detta raderar omgången och alla kuponger.");
  if (!ok) return;

  const snap = await getDocs(collection(db, "participants"));
  const deletions = [];

  snap.forEach((docSnap) => {
    deletions.push(deleteDoc(doc(db, "participants", docSnap.id)));
  });

  await Promise.all(deletions);
  await setDoc(currentRoundRef, {
    ...buildDefaultRound(),
    updatedAt: serverTimestamp()
  });

  closeAdminModal();
};

const participantsQuery = query(
  collection(db, "participants"),
  orderBy("score", "desc")
);

onSnapshot(participantsQuery, (snapshot) => {
  list.innerHTML = "";
  participantsCache = [];

  snapshot.forEach((docSnap) => {
    participantsCache.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  const leaderScore = participantsCache.length
    ? Math.max(...participantsCache.map((i) => i.score || 0), 0)
    : 0;

  participantsCache.forEach((data) => {
    const score = data.score || 0;
    const pct = leaderScore > 0 ? (score / leaderScore) * 100 : 0;

    const div = document.createElement("button");
    div.className = `card ${data.lockedIn ? "locked" : ""}`;
    div.type = "button";

    div.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="cardName">${escapeHtml(data.name || "-")}</div>
          <div class="cardMeta">${score} p</div>
        </div>
        <div class="badge">${data.lockedIn ? "LOCKED" : "ÖPPEN"}</div>
      </div>
      <div class="bar">
        <div class="barFill" style="width:${pct}%"></div>
      </div>
    `;

    div.onclick = () => openDetailModal(data);
    list.appendChild(div);
  });
});

onSnapshot(currentRoundRef, (snap) => {
  currentRound = ensureRoundShape(snap.exists() ? snap.data() : buildDefaultRound());
  renderRoundMeta();
  syncAdminFormFromRound();
  updateQrCodes();
});

function renderRoundMeta() {
  if (!currentRound || !currentRound.title) {
    matchEl.textContent = "Ingen omgång";
    return;
  }

  const title = currentRound.title || "Omgång";
  const home = currentRound.homeTeam || "Hemmalag";
  const away = currentRound.awayTeam || "Bortalag";
  matchEl.textContent = `${title} · ${home} vs ${away}`;
}

function findParticipantByName(name) {
  const normalized = normalizeName(name);
  return participantsCache.find((p) => normalizeName(p.name) === normalized) || null;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readableAnswer(bet, value) {
  if (!value) return "-";

  switch (bet.type) {
    case "team_first_goal":
    case "first_penalty_team":
      if (value === "home") return currentRound?.homeTeam || "Hemmalag";
      if (value === "away") return currentRound?.awayTeam || "Bortalag";
      if (value === "none") return "Ingen utvisning";
      return value;

    case "period2_goals_ou":
      if (value === "under_3") return "Under 3 mål";
      if (value === "over_3") return "Över 3 mål";
      return value;

    case "penalty_p1_yes_no":
    case "home_win_yes_no":
      if (value === "yes") return "Ja";
      if (value === "no") return "Nej";
      return value;

    case "home_player_first_goal":
      return value;

    default:
      if (value === "A") return bet.optionA || "Alternativ A";
      if (value === "B") return bet.optionB || "Alternativ B";
      return value;
  }
}

function resultBadge(status) {
  if (status === "correct") return "✔ Rätt";
  if (status === "wrong") return "✖ Fel";
  return "⏳ Väntar";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}