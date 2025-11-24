// app.js (con login e storico)

// SDK Firebase via CDN (per uso diretto nel browser)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc,
  collection, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// La tua configurazione Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCctBq0nelD9HsjjmghFdSs6rN1vBA67Co",
  authDomain: "tessera-punti-pina.firebaseapp.com",
  projectId: "tessera-punti-pina",
  storageBucket: "tessera-punti-pina.firebasestorage.app",
  messagingSenderId: "280210595024",
  appId: "1:280210595024:web:2c056ee1c34ba8cf76d2d5",
  measurementId: "G-S2XMRXLMJ5"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// -------------------------------------------------------------------------
// DOM LOGIN
// -------------------------------------------------------------------------
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const loginStatus = document.getElementById('loginStatus');
const currentUserEmail = document.getElementById('currentUserEmail');

// -------------------------------------------------------------------------
// DOM APP CLIENTI
// -------------------------------------------------------------------------
const phoneInput = document.getElementById('phoneInput');
const btnLoad = document.getElementById('btnLoad');
const btnNew = document.getElementById('btnNew');
const card = document.getElementById('card');

const phoneField = document.getElementById('phone');
const firstName = document.getElementById('firstName');
const lastName = document.getElementById('lastName');
const notes = document.getElementById('notes');

const pointsValue = document.getElementById('pointsValue');
const btnSave = document.getElementById('btnSave');
const btnWhats = document.getElementById('btnWhats');
const btnDelete = document.getElementById('btnDelete');

const manualDelta = document.getElementById('manualDelta');
const btnAddManual = document.getElementById('btnAddManual');
const btnSubManual = document.getElementById('btnSubManual');

const status = document.getElementById('status');
const transactionsList = document.getElementById('transactionsList');

// Stato globale
let unsubscribeRealtime = null;
let unsubscribeTransactions = null;
let currentPhone = null;
let currentUser = null;

// -------------------------------------------------------------------------
// FUNZIONI DI UTILITÀ
// -------------------------------------------------------------------------
function showStatus(msg, isError = false) {
  if (!status) return;
  status.textContent = msg;
  status.style.color = isError ? 'var(--danger)' : '#333';
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = "";
  }, 4000);
}

function normalizePhone(p) {
  return p.replace(/\s+/g, "").replace(/[()\-\.]/g, "");
}

// -------------------------------------------------------------------------
// LOGIN / LOGOUT
// -------------------------------------------------------------------------
btnLogin?.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    loginStatus.textContent = "Inserisci email e password";
    loginStatus.style.color = 'var(--danger)';
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginStatus.textContent = "";
  } catch (err) {
    console.error(err);
    loginStatus.textContent = "Accesso negato: controlla email o password";
    loginStatus.style.color = 'var(--danger)';
  }
});

btnLogout?.addEventListener('click', async () => {
  await signOut(auth);
});

// Reagisce ai cambiamenti di login
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    // Utente loggato
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    currentUserEmail.textContent = user.email || "";
    loginStatus.textContent = "";
  } else {
    // Nessun utente loggato
    loginSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    currentUserEmail.textContent = "";
    loginEmail.value = "";
    loginPassword.value = "";
    loginStatus.textContent = "";
    hideCard();
  }
});

// -------------------------------------------------------------------------
// GESTIONE CLIENTI E PUNTI
// -------------------------------------------------------------------------
btnNew?.addEventListener('click', () => {
  if (!currentUser) {
    alert("Effettua prima il login.");
    return;
  }
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, true);
});

btnLoad?.addEventListener('click', () => {
  if (!currentUser) {
    alert("Effettua prima il login.");
    return;
  }
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, false);
});

async function openClient(phone, forceCreate = false) {
  if (!currentUser) {
    showStatus("Effettua prima il login", true);
    return;
  }

  currentPhone = phone;
  if (unsubscribeRealtime) { unsubscribeRealtime(); }
  if (unsubscribeTransactions) { unsubscribeTransactions(); }

  const docRef = doc(db, "clients", phone);

  // Ascolto in tempo reale sulla scheda cliente
  unsubscribeRealtime = onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      renderClient(phone, snap.data());
    } else {
      if (forceCreate) {
        const data = {
          firstName: "",
          lastName: "",
          notes: "",
          points: 0,
          createdAt: new Date()
        };
        setDoc(docRef, data);
        renderClient(phone, data);
      } else {
        showStatus("Cliente non trovato", true);
        hideCard();
      }
    }
  }, (err) => {
    console.error(err);
    showStatus("Errore nel caricamento cliente", true);
  });

  // Ascolto in tempo reale sulle transazioni
  const transRef = collection(db, "clients", phone, "transactions");
  const qTrans = query(transRef, orderBy("timestamp", "desc"));

  unsubscribeTransactions = onSnapshot(qTrans, (snap) => {
    const arr = [];
    snap.forEach(s => arr.push(s.data()));
    renderTransactions(arr);
  }, (err) => {
    console.error(err);
    showStatus("Errore nel caricamento storico", true);
  });
}

function renderClient(phone, data) {
  card.classList.remove("hidden");
  phoneField.value = phone;
  firstName.value = data.firstName || "";
  lastName.value = data.lastName || "";
  notes.value = data.notes || "";
  pointsValue.textContent = data.points || 0;
}

function renderTransactions(arr) {
  transactionsList.innerHTML = "";
  if (arr.length === 0) {
    transactionsList.innerHTML = "<em>Nessuna transazione</em>";
    return;
  }
  arr.forEach(t => {
    const div = document.createElement("div");
    div.className = "transaction-item";
    const cls = t.delta >= 0 ? "t-positive" : "t-negative";
    const sign = t.delta >= 0 ? "+" : "";
    const time = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleString() : "-";
    div.innerHTML = `
      <div>
        <span class="${cls}">${sign}${t.delta}</span>
        <span style="font-size:0.8rem;color:#666">(da ${t.oldValue} a ${t.newValue})</span>
      </div>
      <div style="font-size:0.8rem;color:#777">${time}</div>
      ${t.note ? `<div style="font-size:0.8rem;color:#555">${t.note}</div>` : ""}
    `;
    transactionsList.appendChild(div);
  });
}

btnSave?.addEventListener('click', async () => {
  if (!currentUser) {
    showStatus("Effettua prima il login", true);
    return;
  }
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);
  try {
    await setDoc(docRef, {
      firstName: firstName.value,
      lastName: lastName.value,
      notes: notes.value,
      updatedAt: new Date()
    }, { merge: true });
    showStatus("Salvato");
  } catch (err) {
    console.error(err);
    showStatus("Errore nel salvataggio", true);
  }
});

document.querySelectorAll('.points-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset.delta);
    if (!isNaN(delta)) changePoints(delta);
  });
});

btnAddManual?.addEventListener('click', () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(v);
  manualDelta.value = "";
});

btnSubManual?.addEventListener('click', () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(-v);
  manualDelta.value = "";
});

async function changePoints(delta) {
  if (!currentUser) {
    showStatus("Effettua prima il login", true);
    return;
  }
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);
  const transCol = collection(docRef, "transactions");

  try {
    const snap = await getDoc(docRef);
    const oldValue = snap.exists() ? (snap.data().points || 0) : 0;

    let newValue = oldValue + delta;
    if (newValue < 0) newValue = 0;

    await setDoc(docRef, { points: newValue, updatedAt: new Date() }, { merge: true });

    await addDoc(transCol, {
      delta: delta,
      oldValue: oldValue,
      newValue: newValue,
      note: delta > 0 ? "Aggiunta punti" : "Rimozione punti",
      timestamp: serverTimestamp()
    });

    showStatus(`Punti: ${oldValue} → ${newValue}`);
  } catch (err) {
    console.error(err);
    showStatus("Errore durante la modifica punti", true);
  }
}

btnWhats?.addEventListener('click', () => {
  if (!currentPhone) return;
  const text = encodeURIComponent(`Ciao ${firstName.value || ""}!`);
  const sanitized = currentPhone.replace(/\D/g, "");
  if (!sanitized) return;
  window.open(`https://wa.me/${sanitized}?text=${text}`, "_blank");
});

btnDelete?.addEventListener('click', async () => {
  if (!currentUser) {
    showStatus("Effettua prima il login", true);
    return;
  }
  if (!currentPhone) return;
  if (!confirm("Eliminare cliente?")) return;

  try {
    await deleteDoc(doc(db, "clients", currentPhone));
    showStatus("Cliente eliminato");
    hideCard();
  } catch (err) {
    console.error(err);
    showStatus("Errore nell'eliminazione", true);
  }
});

function hideCard() {
  card.classList.add("hidden");
  currentPhone = null;
  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();
}
