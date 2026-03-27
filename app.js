// === NYTT: SIDE BET RESULT + SCORING ===

async function recalcScores() {
  const round = ensureRoundShape(currentRound);
  const correct = round.correctAnswers || {};

  const snap = await getDocs(collection(db, "participants"));

  const updates = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    let score = 0;
    const results = {};

    // 🔹 fixed bets (förberedd för auto senare)
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

    // 🔹 sidebets
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

// === ADMIN: SIDE BET RÄTTNING ===

function renderAdminSidebetResults() {
  const round = ensureRoundShape(currentRound);
  const container = document.createElement("div");

  container.innerHTML = `<div class="adminSectionTitle">Rätta sidebets</div>`;

  getActiveSidebets(round).forEach((bet) => {
    const correct = round.correctAnswers?.[bet.id];

    const row = document.createElement("div");
    row.className = "adminItem";

    row.innerHTML = `
      <div class="adminItemTitle">${escapeHtml(bet.label)}</div>
      <div style="display:flex; gap:10px;">
        <button data-answer="${bet.id}-A" class="ghostBtn ${correct === "A" ? "activeBtn" : ""}">
          ${escapeHtml(bet.optionA)}
        </button>
        <button data-answer="${bet.id}-B" class="ghostBtn ${correct === "B" ? "activeBtn" : ""}">
          ${escapeHtml(bet.optionB)}
        </button>
      </div>
    `;

    container.appendChild(row);
  });

  sidebetsAdmin.appendChild(container);

  container.querySelectorAll("[data-answer]").forEach((btn) => {
    btn.onclick = async () => {
      const [betId, val] = btn.dataset.answer.split("-");

      const newCorrect = {
        ...(currentRound.correctAnswers || {}),
        [betId]: val
      };

      await setDoc(currentRoundRef, {
        correctAnswers: newCorrect
      }, { merge: true });

      await recalcScores();
    };
  });
}

// === HOOK IN ADMIN OPEN ===

const originalOpenAdmin = openAdminModal;

openAdminModal = function () {
  originalOpenAdmin();
  renderAdminSidebetResults();
};

// === DETAIL RESULT VISNING ===

function resultBadge(status) {
  if (status === "correct") return "✔ Rätt";
  if (status === "wrong") return "✖ Fel";
  return "⏳ Väntar";
}

function resultColor(status) {
  if (status === "correct") return "#19f6ff";
  if (status === "wrong") return "#ff6f91";
  return "rgba(255,255,255,.5)";
}

// override detail rendering
function openDetailModal(data) {
  detailName.textContent = data.name || "Kupong";
  detailScore.textContent = `${data.score || 0} p`;
  detailStatus.textContent = data.lockedIn ? "LOCKED" : "ÖPPEN";

  const round = ensureRoundShape(currentRound);
  const results = data.results || {};

  const blocks = [];

  round.fixedBets.forEach((bet) => {
    const status = results[bet.id];

    blocks.push(`
      <div class="breakdownItem">
        <div class="breakdownTitle">${escapeHtml(bet.label)}</div>
        <div class="breakdownMeta">
          ${escapeHtml(readableAnswer(bet, data?.bets?.[bet.id]))}
        </div>
        <div class="breakdownMeta" style="color:${resultColor(status)}">
          ${resultBadge(status)}
        </div>
      </div>
    `);
  });

  getActiveSidebets(round).forEach((bet) => {
    const status = results[bet.id];

    blocks.push(`
      <div class="breakdownItem">
        <div class="breakdownTitle">${escapeHtml(bet.label)}</div>
        <div class="breakdownMeta">
          ${escapeHtml(readableAnswer(bet, data?.bets?.[bet.id]))}
        </div>
        <div class="breakdownMeta" style="color:${resultColor(status)}">
          ${resultBadge(status)}
        </div>
      </div>
    `);
  });

  detailBreakdown.innerHTML = blocks.join("");
  detailModal.classList.remove("hidden");
}