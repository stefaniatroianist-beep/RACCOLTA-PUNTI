// ===============================
// Firebase SDK (CDN)
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc,
  collection, addDoc, serverTimestamp, query, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// ===============================
// Firebase Configuration
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCctBq0nelD9HsjjmghFdSs6rN1vBA67Co",
  authDomain: "tessera-punti-pina.firebaseapp.com",
  projectId: "tessera-punti-pina",
  storageBucket: "tessera-punti-pina.firebasestorage.app",
  messagingSenderId: "280210595024",
  appId: "1:280210595024:web:2c056ee1c34ba8cf76d2d5",
  measurementId: "G-S2XMRXLMJ5"
};

// ===============================
// Initialize Firebase
// ===============================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===============================
// DOM ELEMENTS
// ===============================
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const currentUserEmail = document.getElementById("currentUserEmail");
const loginStatus = document.getElementById("loginStatus");

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

// Nuovi elementi per ricerca per nome
const nameSearchInput = document.getElementById('nameSearchInput');
const btnSearchName = document.getElementById('btnSearchName');
const searchResults = document.getElementById('searchResults');
const searchResultsList = document.getElementById('searchResultsList');

let unsubscribeRealtime = null;
let unsubscribeTransactions = null;
let currentPhone = null;

// ===============================
// PHONE NORMALIZATION (+39 AUTO)
// ===============================
function normalizePhone(p) {
  let digits = p.replace(/\D/g, "");

  // Se inizia con "3", aggiungiamo "39" davanti
  if (digits.startsWith("3")) {
    digits = "39" + digits;
  }

  // Aggiungiamo il +
  return "+" + digits;
}

// ===============================
// LOGIN LOGIC
// ===============================
btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();
  loginStatus.textContent = "";

  if (!email || !pass) {
    loginStatus.textContent = "Inserisci email e password";
    loginStatus.style.color = "red";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    loginStatus.textContent = "Accesso effettuato!";
    loginStatus.style.color = "green";
  } catch (err) {
    loginStatus.textContent = "Credenziali errate";
    loginStatus.style.color = "red";
  }
});

// Logout
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

// Gestisce visibilità delle sezioni
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    currentUserEmail.textContent = user.email;
  } else {
    appSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    currentUserEmail.textContent = "";
    hideCard();
    clearSearchResults();
  }
});

// ===============================
// STATUS MESSAGE
// ===============================
function showStatus(msg, isError = false) {
  if (!status) return;
  status.textContent = msg;
  status.style.color = isError ? 'var(--danger)' : '#333';
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = "";
  }, 4000);
}

// ===============================
// BUTTONS NEW / LOAD CLIENT (telefono)
// ===============================
btnNew.addEventListener('click', () => {
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, true);
});

btnLoad.addEventListener('click', () => {
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, false);
});

// ===============================
// SEARCH BY NAME / SURNAME
// ===============================
btnSearchName.addEventListener('click', async () => {
  const term = nameSearchInput.value.trim().toLowerCase();
  if (!term) {
    clearSearchResults();
    showStatus("Inserisci un nome o cognome da cercare", true);
    return;
  }

  // Leggiamo tutti i clienti e filtriamo lato client (per un negozio va benissimo)
  const snap = await getDocs(collection(db, "clients"));
  const matches = [];
  snap.forEach(docSnap => {
    const data = docSnap.data();
    const fn = (data.firstName || "").toLowerCase();
    const ln = (data.lastName || "").toLowerCase();
    const full = (fn + " " + ln).trim();

    if (
      fn.includes(term) ||
      ln.includes(term) ||
      full.includes(term)
    ) {
      matches.push({
        phone: docSnap.id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        points: data.points || 0
      });
    }
  });

  renderSearchResults(matches, term);
});

function clearSearchResults() {
  searchResults.classList.add("hidden");
  searchResultsList.innerHTML = "";
}

function renderSearchResults(matches, term) {
  searchResultsList.innerHTML = "";

  if (!matches.length) {
    searchResultsList.innerHTML = `<em>Nessun cliente trovato per "${term}"</em>`;
    searchResults.classList.remove("hidden");
    return;
  }

  matches.forEach(m => {
    const div = document.createElement("div");
    div.className = "transaction-item";
    div.style.cursor = "pointer";

    const nameText = (m.firstName || m.lastName)
      ? `${m.firstName || ""} ${m.lastName || ""}`.trim()
      : "(senza nome)";

    div.innerHTML = `
      <div>
        <strong>${nameText}</strong>
      </div>
      <div style="font-size:0.85rem; color:#555;">
        Tel: ${m.phone} — Punti: ${m.points}
      </div>
      <div style="font-size:0.75rem; color:#777;">
        Clicca per aprire la scheda cliente
      </div>
    `;

    div.addEventListener("click", () => {
      phoneInput.value = m.phone;
      openClient(m.phone, false);
      searchResults.classList.add("hidden");
    });

    searchResultsList.appendChild(div);
  });

  searchResults.classList.remove("hidden");
}

// ===============================
// LOAD + REALTIME UPDATES
// ===============================
async function openClient(phone, forceCreate = false) {
  currentPhone = phone;

  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();

  const docRef = doc(db, "clients", phone);

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
  });

  const transRef = collection(db, "clients", phone, "transactions");
  const qTrans = query(transRef, orderBy("timestamp", "desc"));

  unsubscribeTransactions = onSnapshot(qTrans, (snap) => {
    const arr = [];
    snap.forEach(s => arr.push(s.data()));
    renderTransactions(arr);
  });

  // ogni volta che apro un cliente, nascondo eventuali risultati di ricerca
  clearSearchResults();
}

// ===============================
// RENDER CLIENT
// ===============================
function renderClient(phone, data) {
  card.classList.remove("hidden");
  phoneField.value = phone;
  firstName.value = data.firstName || "";
  lastName.value = data.lastName || "";
  notes.value = data.notes || "";
  pointsValue.textContent = data.points || 0;
}

// ===============================
// RENDER TRANSACTIONS
// ===============================
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

// ===============================
// SAVE BUTTON
// ===============================
btnSave.addEventListener('click', async () => {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);

  await setDoc(docRef, {
    firstName: firstName.value,
    lastName: lastName.value,
    notes: notes.value,
    updatedAt: new Date()
  }, { merge: true });

  showStatus("Salvato");
});

// ===============================
// POINTS MANAGEMENT
// ===============================
document.querySelectorAll('.points-buttons button').forEach(btn => {
  btn.addEventListener('click', () => changePoints(parseInt(btn.dataset.delta)));
});

btnAddManual.addEventListener('click', () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(v);
  manualDelta.value = "";
});

btnSubManual.addEventListener('click', () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(-v);
  manualDelta.value = "";
});

async function changePoints(delta) {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);
  const transCol = collection(docRef, "transactions");

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
}

// ===============================
// WHATSAPP BUTTON
// ===============================
btnWhats.addEventListener('click', () => {
  if (!currentPhone) return;

  const text = encodeURIComponent(`Ciao ${firstName.value || ""}!`);
  const sanitized = normalizePhone(currentPhone).replace(/\D/g, "");

  window.open(`https://wa.me/${sanitized}?text=${text}`, "_blank");
});

// ===============================
// DELETE CLIENT
// ===============================
btnDelete.addEventListener('click', async () => {
  if (!currentPhone) return;
  if (!confirm("Eliminare cliente?")) return;

  await deleteDoc(doc(db, "clients", currentPhone));
  showStatus("Cliente eliminato");
  hideCard();
});

function hideCard() {
  card.classList.add("hidden");
  currentPhone = null;
  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();
}
