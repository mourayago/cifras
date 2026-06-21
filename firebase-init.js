// ============================================================
//  CONEXÃO COM O FIREBASE (nuvem) — Firestore + Auth
//  Carregado como módulo; expõe window.CifrasDB para o app.js
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore, collection, onSnapshot,
  addDoc, doc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBG70arJlgwHbsSjSXXREKgSqTI7Lq42oA",
  authDomain: "cifras-30848.firebaseapp.com",
  projectId: "cifras-30848",
  storageBucket: "cifras-30848.firebasestorage.app",
  messagingSenderId: "491054419533",
  appId: "1:491054419533:web:59a4af226f487f573e5604"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const col = collection(db, "cifras");

// Mantém o login salvo no aparelho
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Escuta as cifras da nuvem em tempo real
onSnapshot(col, (snap) => {
  const arr = [];
  snap.forEach((d) => arr.push(Object.assign({ id: d.id, cloud: true }, d.data())));
  if (typeof window.onCloudCifras === "function") window.onCloudCifras(arr);
}, (err) => {
  console.error("Firestore erro:", err);
  if (typeof window.onCloudError === "function") window.onCloudError(err);
});

// Escuta o estado de login
onAuthStateChanged(auth, (user) => {
  if (typeof window.onAuthChange === "function") window.onAuthChange(user);
});

// API exposta para o app.js (script clássico)
window.CifrasDB = {
  ready: true,
  async add(cifra) {
    const ref = await addDoc(col, Object.assign({}, cifra, { createdAt: serverTimestamp() }));
    return ref.id;
  },
  update(id, cifra) {
    return setDoc(doc(db, "cifras", id), cifra, { merge: true });
  },
  remove(id) {
    return deleteDoc(doc(db, "cifras", id));
  },
  login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },
  logout() {
    return signOut(auth);
  },
  currentUser() {
    return auth.currentUser;
  }
};

// Avisa o app que a camada de nuvem está pronta
if (typeof window.onCloudReady === "function") window.onCloudReady();
