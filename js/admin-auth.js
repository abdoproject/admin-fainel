// ===== ADMIN AUTH =====
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Check if already logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isAdmin = await checkAdminRole(user.uid);
    if (isAdmin) window.location.href = 'index.html';
  }
});

async function checkAdminRole(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) { return false; }
}

window.handleAdminLogin = async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  setLoading(true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const isAdmin = await checkAdminRole(cred.user.uid);
    if (!isAdmin) {
      await signOut(auth);
      showError('ليس لديك صلاحية الوصول إلى لوحة التحكم');
      setLoading(false);
      return;
    }
    window.location.href = 'index.html';
  } catch (err) {
    const msgs = {
      'auth/user-not-found': 'البريد الإلكتروني غير مسجل',
      'auth/wrong-password': 'كلمة المرور غير صحيحة',
      'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      'auth/too-many-requests': 'تم تجاوز عدد المحاولات'
    };
    showError(msgs[err.code] || 'حدث خطأ في تسجيل الدخول');
    setLoading(false);
  }
};

function showError(msg) {
  const err = document.getElementById('error-msg');
  document.getElementById('error-text').textContent = msg;
  err.style.display = 'flex';
}

function setLoading(v) {
  document.getElementById('btn-text').style.display = v ? 'none' : 'flex';
  document.getElementById('btn-loader').style.display = v ? 'flex' : 'none';
  document.getElementById('login-btn').disabled = v;
}

window.togglePw = () => {
  const input = document.getElementById('admin-password');
  const icon = document.getElementById('pw-icon');
  if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
  else { input.type = 'password'; icon.className = 'fas fa-eye'; }
};
