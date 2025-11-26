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
// Firebase config
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
// Init Firebase
// ===============================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===============================
// DOM ELEMENTS
// ===============================

// Login
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const currentUserEmail = document.getElementById("currentUserEmail");
const loginStatus = document.getElementById("loginStatus");

// Search by phone
const phoneInput = document.getElementById("phoneInput");
const btnLoad = document.getElementById("btnLoad");
const btnNew = document.getElementById("btnNew");

// Client card
const btnResetAllPoints = document.getElementById("btnResetAllPoints");
const card = document.getElementById("card");
const phoneField = document.getElementById("phone");
const firstName = document.getElementById("firstName");
const lastName = document.getElementById("lastName");
const notes = document.getElementById("notes");
const pointsValue = document.getElementById("pointsValue");

const btnSave = document.getElementById("btnSave");
const btnWhats = document.getElementById("btnWhats");
const btnDelete = document.getElementById("btnDelete");
const btnExportCsv = document.getElementById("btnExportCsv");

const manualDelta = document.getElementById("manualDelta");
const btnAddManual = document.getElementById("btnAddManual");
const btnSubManual = document.getElementById("btnSubManual");

const status = document.getElementById("status");
const transactionsList = document.getElementById("transactionsList");

// Search by name/surname
const nameSearchInput = document.getElementById("nameSearchInput");
const btnSearchName = document.getElementById("btnSearchName");
const searchResults = document.getElementById("searchResults");
const searchResultsList = document.getElementById("searchResultsList");

// State
let unsubscribeRealtime = null;
let unsubscribeTransactions = null;
let currentPhone = null;

// ===============================
// Utility: pulizia campi ricerca
// ===============================
function clearSearchInputs() {
  if (phoneInput) phoneInput.value = "";
  if (nameSearchInput) nameSearchInput.value = "";
}

function clearSearchResults() {
  if (searchResults) searchResults.classList.add("hidden");
  if (searchResultsList) searchResultsList.innerHTML = "";
}

// ===============================
// PHONE NORMALIZATION (+39)
// ===============================
function normalizePhone(p) {
  let digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";

  // Se inizia con "3" (es: 347...), aggiungo 39
  if (digits.startsWith("3")) {
    digits = "39" + digits;
  }
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
    console.error(err);
    loginStatus.textContent = "Credenziali errate";
    loginStatus.style.color = "red";
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    currentUserEmail.textContent = user.email || "";
    loginStatus.textContent = "";
  } else {
    appSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    currentUserEmail.textContent = "";
    loginEmail.value = "";
    loginPassword.value = "";
    loginStatus.textContent = "";
    hideCard();
    clearSearchResults();
    clearSearchInputs();
  }
});

// ===============================
// STATUS MESSAGE
// ===============================
function showStatus(msg, isError = false) {
  if (!status) return;
  status.textContent = msg;
  status.style.color = isError ? "var(--danger)" : "#333";
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = "";
  }, 4000);
}

// ===============================
// SEARCH / CREATE BY PHONE
// ===============================
btnNew.addEventListener("click", () => {
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, true);

  // dopo aver aperto il nuovo cliente, svuoto i campi ricerca
  clearSearchInputs();
  clearSearchResults();
});

btnLoad.addEventListener("click", () => {
  const p = normalizePhone(phoneInput.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, false);

  // dopo aver aperto la scheda, svuoto i campi ricerca
  clearSearchInputs();
  clearSearchResults();
});

// ===============================
// SEARCH BY NAME / SURNAME
// ===============================
btnSearchName.addEventListener("click", async () => {
  const term = (nameSearchInput.value || "").trim().toLowerCase();
  if (!term) {
    clearSearchResults();
    showStatus("Inserisci un nome o cognome da cercare", true);
    return;
  }

  try {
    const snap = await getDocs(collection(db, "clients"));
    const matches = [];

    snap.forEach((docSnap) => {
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
  } catch (err) {
    console.error(err);
    showStatus("Errore nella ricerca per nome", true);
  }
});

function renderSearchResults(matches, term) {
  searchResultsList.innerHTML = "";

  if (!matches.length) {
    searchResultsList.innerHTML = `<em>Nessun cliente trovato per "${term}"</em>`;
    searchResults.classList.remove("hidden");
    return;
  }

  matches.forEach((m) => {
    const div = document.createElement("div");
    div.className = "transaction-item";
    div.style.cursor = "pointer";

    const nameText =
      (m.firstName || m.lastName)
        ? `${m.firstName || ""} ${m.lastName || ""}`.trim()
        : "(senza nome)";

    div.innerHTML = `
      <div><strong>${nameText}</strong></div>
      <div style="font-size:0.85rem; color:#555;">
        Tel: ${m.phone} — Punti: ${m.points}
      </div>
      <div style="font-size:0.75rem; color:#777;">
        Clicca per aprire la scheda cliente
      </div>
    `;

    div.addEventListener("click", () => {
      // apro la scheda cliente
      openClient(m.phone, false);

      // pulisco campi di ricerca (telefono + nome/cognome)
      clearSearchInputs();

      // nascondo la lista risultati
      searchResults.classList.add("hidden");
    });

    searchResultsList.appendChild(div);
  });

  searchResults.classList.remove("hidden");
}

// ===============================
// OPEN CLIENT + REALTIME
// ===============================
async function openClient(phone, forceCreate = false) {
  currentPhone = phone;

  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();

  const docRef = doc(db, "clients", phone);

  // Ascolto in tempo reale i dati del cliente
  unsubscribeRealtime = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        // Documento già esistente: uso i dati del DB
        renderClient(phone, snap.data());
      } else {
        if (forceCreate) {
          // Nuovo cliente: mostro solo la scheda da compilare
          renderClient(phone, {
            firstName: "",
            lastName: "",
            notes: "",
            points: 0
          });
        } else {
          showStatus("Cliente non trovato", true);
          hideCard();
        }
      }
    },
    (err) => {
      console.error(err);
      showStatus("Errore nel caricamento cliente", true);
    }
  );

  // Storico transazioni in tempo reale
  const transRef = collection(db, "clients", phone, "transactions");
  const qTrans = query(transRef, orderBy("timestamp", "desc"));

  unsubscribeTransactions = onSnapshot(
    qTrans,
    (snap) => {
      const arr = [];
      snap.forEach((s) => arr.push(s.data()));
      renderTransactions(arr);
    },
    (err) => {
      console.error(err);
      showStatus("Errore nel caricamento storico", true);
    }
  );
}

// ===============================
// RENDER CLIENT
// ===============================
function renderClient(phone, data) {
  card.classList.remove("hidden");
  phoneField.value = phone;

  if ("firstName" in data) {
    firstName.value = data.firstName || "";
  }
  if ("lastName" in data) {
    lastName.value = data.lastName || "";
  }
  if ("notes" in data) {
    notes.value = data.notes || "";
  }

  pointsValue.textContent = data.points || 0;
}

// ===============================
// RENDER TRANSACTIONS
// ===============================
function renderTransactions(arr) {
  transactionsList.innerHTML = "";
  if (!arr.length) {
    transactionsList.innerHTML = "<em>Nessuna transazione</em>";
    return;
  }

  arr.forEach((t) => {
    const div = document.createElement("div");
    div.className = "transaction-item";

    const cls = t.delta >= 0 ? "t-positive" : "t-negative";
    const sign = t.delta >= 0 ? "+" : "";
    const time = t.timestamp?.toDate
      ? t.timestamp.toDate().toLocaleString()
      : "-";

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
// SAVE CLIENT DATA
// ===============================
btnSave.addEventListener("click", async () => {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);

  try {
    await setDoc(
      docRef,
      {
        firstName: firstName.value,
        lastName: lastName.value,
        notes: notes.value,
        updatedAt: new Date()
      },
      { merge: true }
    );

    showStatus("Salvato");

    // dopo il salvataggio pulisco i campi di ricerca + risultati
    clearSearchInputs();
    clearSearchResults();

  } catch (err) {
    console.error(err);
    showStatus("Errore nel salvataggio", true);
  }
});

// ===============================
// POINTS MANAGEMENT
// ===============================
document.querySelectorAll(".points-buttons button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const delta = parseInt(btn.dataset.delta);
    if (!isNaN(delta)) changePoints(delta);
  });
});

btnAddManual.addEventListener("click", () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(v);
  manualDelta.value = "";
});

btnSubManual.addEventListener("click", () => {
  const v = parseInt(manualDelta.value);
  if (!v) return;
  changePoints(-v);
  manualDelta.value = "";
});

// ===============================
// CHANGE POINTS + WHATSAPP AUTO
// ===============================
async function changePoints(delta) {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);
  const transCol = collection(docRef, "transactions");

  try {
    const snap = await getDoc(docRef);
    const oldValue = snap.exists() ? snap.data().points || 0 : 0;

    let newValue = oldValue + delta;
    if (newValue < 0) newValue = 0;

    // aggiorno i punti nel cliente
    await setDoc(
      docRef,
      { points: newValue, updatedAt: new Date() },
      { merge: true }
    );

    // salvo nello storico
    await addDoc(transCol, {
      delta: delta,
      oldValue: oldValue,
      newValue: newValue,
      note: delta > 0 ? "Aggiunta punti" : "Rimozione punti",
      timestamp: serverTimestamp()
    });

    showStatus(`Punti: ${oldValue} → ${newValue}`);

    // prepara testo WhatsApp
    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);   // scadenza tra 1 anno
    const expiryText = expiry.toLocaleDateString("it-IT");

    const text = encodeURIComponent(
      `Ciao ${firstName.value || ""}!\n` +
      `Il tuo saldo punti aggiornato è ${newValue}.\n` +
      `I tuoi punti scadono il ${expiryText}.`
    );

    // prendo solo le cifre dal numero (niente +, spazi, ecc.)
    let digits = (currentPhone || "").replace(/\D/g, "");

    if (digits) {
      if (digits.startsWith("39")) {
        // ok
      } else if (digits.startsWith("3")) {
        digits = "39" + digits;
      }

      window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
    }

  } catch (err) {
    console.error(err);
    showStatus("Errore durante la modifica punti", true);
  }
}

// ===============================
// WHATSAPP (invio manuale)
// ===============================
btnWhats.addEventListener("click", () => {
  if (!currentPhone) return;

  const punti = pointsValue.textContent || "0";

  const now = new Date();
  const expiry = new Date(now);
  expiry.setFullYear(expiry.getFullYear() + 1);
  const expiryText = expiry.toLocaleDateString("it-IT");

  const text = encodeURIComponent(
    `Ciao ${firstName.value || ""}!\n` +
    `Il tuo saldo punti aggiornato è ${punti}.\n` +
    `I tuoi punti scadono il ${expiryText}.`
  );

  let digits = (currentPhone || "").replace(/\D/g, "");

  if (!digits) {
    alert("Numero di telefono non valido");
    return;
  }

  if (digits.startsWith("39")) {
    // già ok
  } else if (digits.startsWith("3")) {
    digits = "39" + digits;
  }

  window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
});
// ===============================
// BACKUP CLIENTI IN CSV
// ===============================
btnExportCsv.addEventListener("click", async () => {
  try {
    showStatus("Preparazione backup in corso...");

    // 1️⃣ Leggo tutti i clienti
    const snap = await getDocs(collection(db, "clients"));
    const rows = [];

    if (snap.empty) {
      showStatus("Nessun cliente da esportare", true);
      return;
    }

    // intestazione CSV
    rows.push("phone;firstName;lastName;notes;points");

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const phone = docSnap.id || "";
      const fn = (data.firstName || "").toString().replace(/[\r\n;]/g, " ");
      const ln = (data.lastName  || "").toString().replace(/[\r\n;]/g, " ");
      const nt = (data.notes     || "").toString().replace(/[\r\n;]/g, " ");
      const pts = (data.points != null ? data.points : 0);

      rows.push(`${phone};${fn};${ln};${nt};${pts}`);
    });

    // 2️⃣ Creo il contenuto CSV
    const csvContent = rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    // 3️⃣ Nome file con data
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `backup_clienti_${yyyy}-${mm}-${dd}.csv`;

    // 4️⃣ Creo link temporaneo per scaricare
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 5️⃣ Messaggio chiaro
    const count = rows.length - 1; // tolgo la riga di intestazione
    showStatus(`Backup CSV scaricato (${count} clienti). Controlla la cartella Download del browser.`);

  } catch (err) {
    console.error(err);
    showStatus("Errore durante il backup CSV", true);
  }
});

// ===============================
// DELETE CLIENT
// ===============================
btnDelete.addEventListener("click", async () => {
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

// ===============================
// RESET ALL POINTS FOR ALL CLIENTS (with storico)
// ===============================
btnResetAllPoints.addEventListener("click", async () => {
  if (!confirm("Sei sicura di voler AZZERARE i punti di TUTTI i clienti?")) return;

  try {
    const clientsSnap = await getDocs(collection(db, "clients"));
    const operations = [];

    clientsSnap.forEach((docSnap) => {
      const ref = docSnap.ref;
      const data = docSnap.data() || {};
      const oldPoints = data.points || 0;
      const newPoints = 0;

      operations.push(
        setDoc(
          ref,
          { points: newPoints, updatedAt: new Date() },
          { merge: true }
        )
      );

      if (oldPoints !== 0) {
        const transRef = collection(ref, "transactions");
        operations.push(
          addDoc(transRef, {
            delta: newPoints - oldPoints,
            oldValue: oldPoints,
            newValue: newPoints,
            note: "Azzeramento totale punti",
            timestamp: serverTimestamp()
          })
        );
      }
    });

    await Promise.all(operations);
    showStatus("Punti azzerati per TUTTI i clienti (storico aggiornato)");
  } catch (err) {
    console.error(err);
    showStatus("Errore durante l'azzeramento globale", true);
  }
});
