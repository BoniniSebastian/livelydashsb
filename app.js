import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const list = document.getElementById("list");
const addBtn = document.getElementById("addBtn");

const couponModal = document.getElementById("couponModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalBackdrop = document.querySelector(".modalBackdrop");

const nameInput = document.getElementById("nameInput");
const bet1 = document.getElementById("bet1");
const bet2 = document.getElementById("bet2");
const saveCouponBtn = document.getElementById("saveCouponBtn");

const detailModal = document.getElementById("detailModal");
const closeDetailBtn = document.getElementById("closeDetailBtn");
const detailBackdrop = document.querySelector(".detailBackdrop");
const detailName = document.getElementById("detailName");
const detailScore = document.getElementById("detailScore");
const detailStatus = document.getElementById("detailStatus");
const detailBreakdown = document.getElementById("detailBreakdown");

function openCouponModal() {
  couponModal.classList.remove("hidden");
}

function closeCouponModal() {
  couponModal.classList.add("hidden");
  nameInput.value = "";
  bet1.value = "";
  bet2.value = "";
}

function openDetailModal(data) {
  detailName.textContent = data.name || "Kupong";
  detailScore.textContent = `${data.score || 0} p`;
  detailStatus.textContent = data.lockedIn ? "LOCKED" : "ÖPPEN";

  detailBreakdown.innerHTML = `
    <div class="breakdownItem">
      <div class="breakdownTitle">Lag som gör första målet</div>
      <div class="breakdownMeta">Ditt val: ${labelFirstGoalTeam(data?.bets?.firstGoalTeam)}</div>
    </div>

    <div class="breakdownItem">
      <div class="breakdownTitle">Vinner hemmalaget matchen</div>
      <div class="breakdownMeta">Ditt val: ${labelHomeWin(data?.bets?.homeWin)}</div>
    </div>
  `;

  detailModal.classList.remove("hidden");
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
}

addBtn.onclick = openCouponModal;
closeModalBtn.onclick = closeCouponModal;
modalBackdrop.onclick = closeCouponModal;

closeDetailBtn.onclick = closeDetailModal;
detailBackdrop.onclick = closeDetailModal;

saveCouponBtn.onclick = async () => {
  const name = nameInput.value.trim();

  if (!name) {
    alert("Skriv ditt namn.");
    return;
  }

  if (!bet1.value || !bet2.value) {
    alert("Fyll i båda frågorna.");
    return;
  }

  await addDoc(collection(db, "participants"), {
    name,
    lockedIn: true,
    score: 0,
    bets: {
      firstGoalTeam: bet1.value,
      homeWin: bet2.value
    },
    createdAt: serverTimestamp()
  });

  closeCouponModal();
};

const participantsQuery = query(
  collection(db, "participants"),
  orderBy("score", "desc")
);

onSnapshot(participantsQuery, (snapshot) => {
  list.innerHTML = "";

  const items = [];
  snapshot.forEach((docSnap) => {
    items.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  const leaderScore = items.length ? Math.max(...items.map(i => i.score || 0), 0) : 0;

  items.forEach((data) => {
    const score = data.score || 0;
    const pct = leaderScore > 0 ? (score / leaderScore) * 100 : 0;

    const div = document.createElement("button");
    div.className = "card";
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

function labelFirstGoalTeam(value) {
  if (value === "home") return "Hemmalag";
  if (value === "away") return "Bortalag";
  return "-";
}

function labelHomeWin(value) {
  if (value === "yes") return "Ja";
  if (value === "no") return "Nej";
  return "-";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
