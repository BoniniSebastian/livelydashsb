import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBs_SSS3bh1L-gK90svMRddW0wWKfAUQ5c",
  authDomain: "gamevibe-88e75.firebaseapp.com",
  projectId: "gamevibe-88e75",
  storageBucket: "gamevibe-88e75.firebasestorage.app",
  messagingSenderId: "288622618498",
  appId: "1:288622618498:web:3809cec91af8981157d19b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
