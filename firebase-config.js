import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "DIN_API_KEY",
  authDomain: "DIN_DOMAIN",
  projectId: "gamevibe-88e75",
  storageBucket: "DIN_BUCKET",
  messagingSenderId: "DIN_ID",
  appId: "DIN_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);