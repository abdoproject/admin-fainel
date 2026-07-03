// ===== Firebase Configuration - Admin Panel =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAjFb9PdxlR6eNaT9iS7LzuKE4fo3NAWb4",
  authDomain: "admin-stor-new.firebaseapp.com",
  projectId: "admin-stor-new",
  storageBucket: "admin-stor-new.firebasestorage.app",
  messagingSenderId: "903941884962",
  appId: "1:903941884962:web:c8b625a4d55c1071ea4e7b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
