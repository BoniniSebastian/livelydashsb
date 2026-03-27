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

function openCouponModal() {
  couponModal.classList.remove("hidden");
}

function closeCouponModal() {
  couponModal.classList.add("hidden");
  nameInput.value = "";
  bet1.value = "";
  bet2.value = "";
}

addBtn.onclick = openCouponModal;
closeModalBtn.onclick = closeCouponModal;
modalBackdrop.onclick = closeCouponModal;

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

    const div = document.createElement("div");
    div.className = "card";

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

    list.appendChild(div);
  });
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
