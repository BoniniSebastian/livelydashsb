import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const list = document.getElementById("list");
const addBtn = document.getElementById("addBtn");

// lyssna på deltagare i realtid
onSnapshot(collection(db, "participants"), (snapshot) => {
  list.innerHTML = "";

  snapshot.forEach(doc => {
    const data = doc.data();

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      ${data.name} - ${data.score || 0}p
    `;

    list.appendChild(div);
  });
});

// skapa ny deltagare
addBtn.onclick = async () => {
  const name = prompt("Ditt namn?");
  if(!name) return;

  await addDoc(collection(db, "participants"), {
    name,
    score: 0
  });
};
