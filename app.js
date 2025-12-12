// ===============================
// Firebase SDK (CDN)
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc,
  collection, addDoc, serverTimestamp, query, orderBy, getDocs,
  where, Timestamp
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
const btnExportVcf = document.getElementById("btnExportVcf");

// 🔹 NUOVO: esporta SOLO nuovi da data
const btnExportVcfNew = document.getElementById("btnExportVcfNew");

const manualDelta = document.getElementById("manualDelta");
const btnAddManual = document.getElementById("btnAddManual");
const btnSubManual = document.getElementById("btnSubManual");

const status = document.getElementById("status");
const transactionsList = document.getElementById("transactionsList");

// 🔹 Contatore tessere
const clientCountSpan = document.getElementById("clientCount");

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
// Utility UI
// ===============================
function clearSearchInputs() {
  if (phoneInput) phoneInput.value = "";
  if (nameSearchInput) nameSearchInput.value = "";
}

function clearSearchResults() {
  if (searchResults) searchResults.classList.add("hidden");
  if (searchResultsList) searchResultsList.innerHTML = "";
}

function showStatus(msg, isError = false) {
  if (!status) return;
  status.textContent = msg;
  status.style.color = isError ? "var(--danger)" : "#333";
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = "";
  }, 4000);
}

// ===============================
// DATE helpers
// ===============================
function formatDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseDDMMYYYY(input) {
  // input: "12/12/2025"
  const s = (input || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ===============================
// PHONE NORMALIZATION (anti doppio 39)
// Ritorna: { digits: "39xxxxxxxxxx", e164: "+39xxxxxxxxxx" } oppure null
// ===============================
function normalizeItalyPhoneToE164(raw) {
  let digits = (raw || "").toString().replace(/\D/g, "");
  if (!digits) return null;

  // 0039... -> 39...
  if (digits.startsWith("00")) digits = digits.slice(2);

  // casi strani: 3939....
  while (digits.startsWith("3939") && digits.length > 12) {
    digits = digits.slice(2); // toglie un "39"
  }

  // mobile italiano: 10 cifre che iniziano con 3 -> aggiungo 39
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = "39" + digits;
  }

  // se è già 39 + 10 cifre (12 totali) ok
  // se è un fisso 0xxxxxxxxx: NON lo forzo (ma Whatsapp spesso vuole +39...)
  if (digits.startsWith("0")) {
    // fisso: se vuoi, puoi gestirlo diversamente.
    // qui lo trasformo comunque in +39 + numero senza 0? NO, non lo faccio.
    // Lo lascio così (ma potrebbe non essere valido per WA).
    // Se preferisci: digits = "39" + digits; (dimmi e lo cambio)
  } else if (!digits.startsWith("39") && digits.startsWith("3")) {
    // se per qualche motivo è 3... ma non 10 cifre, provo comunque ad aggiungere 39
    digits = "39" + digits;
  }

  // pulizia finale (evita 39 duplicati “a metà”)
  if (digits.startsWith("3939") && digits.length > 12) {
    digits = "39" + digits.slice(4);
  }

  return { digits, e164: "+" + digits };
}

// Mantengo la tua normalizePhone per ID documento (con + davanti)
function normalizePhone(p) {
  const n = normalizeItalyPhoneToE164(p);
  if (!n) return "";
  // come ID in Firestore usi "+39..."
  return n.e164;
}

// ===============================
// AGGIORNA CONTATORE CLIENTI
// ===============================
async function updateClientCount() {
  if (!clientCountSpan) return;
  try {
    clientCountSpan.textContent = "…";
    const snap = await getDocs(collection(db, "clients"));
    clientCountSpan.textContent = snap.size;
  } catch (err) {
    console.error("Errore nel conteggio clienti:", err);
    clientCountSpan.textContent = "?";
  }
}

// ===============================
// LOGIN LOGIC
// ===============================
btnLogin?.addEventListener("click", async () => {
  const email = (loginEmail?.value || "").trim();
  const pass = (loginPassword?.value || "").trim();
  if (loginStatus) loginStatus.textContent = "";

  if (!email || !pass) {
    if (loginStatus) {
      loginStatus.textContent = "Inserisci email e password";
      loginStatus.style.color = "red";
    }
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    if (loginStatus) {
      loginStatus.textContent = "Accesso effettuato!";
      loginStatus.style.color = "green";
    }
  } catch (err) {
    console.error(err);
    if (loginStatus) {
      loginStatus.textContent = "Credenziali errate";
      loginStatus.style.color = "red";
    }
  }
});

btnLogout?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection?.classList.add("hidden");
    appSection?.classList.remove("hidden");
    if (currentUserEmail) currentUserEmail.textContent = user.email || "";
    if (loginStatus) loginStatus.textContent = "";
    updateClientCount();
  } else {
    appSection?.classList.add("hidden");
    loginSection?.classList.remove("hidden");
    if (currentUserEmail) currentUserEmail.textContent = "";
    if (loginEmail) loginEmail.value = "";
    if (loginPassword) loginPassword.value = "";
    if (loginStatus) loginStatus.textContent = "";
    hideCard();
    clearSearchResults();
    clearSearchInputs();
    if (clientCountSpan) clientCountSpan.textContent = "—";
  }
});

// ===============================
// SEARCH / CREATE BY PHONE
// ===============================
btnNew?.addEventListener("click", () => {
  const p = normalizePhone(phoneInput?.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, true);
  clearSearchInputs();
  clearSearchResults();
});

btnLoad?.addEventListener("click", () => {
  const p = normalizePhone(phoneInput?.value);
  if (!p) return showStatus("Numero non valido", true);
  openClient(p, false);
  clearSearchInputs();
  clearSearchResults();
});

// ===============================
// SEARCH BY NAME / SURNAME
// ===============================
btnSearchName?.addEventListener("click", async () => {
  const term = (nameSearchInput?.value || "").trim().toLowerCase();
  if (!term) {
    clearSearchResults();
    showStatus("Inserisci un nome o cognome da cercare", true);
    return;
  }

  try {
    const snap = await getDocs(collection(db, "clients"));
    const matches = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const fn = (data.firstName || "").toLowerCase();
      const ln = (data.lastName || "").toLowerCase();
      const full = (fn + " " + ln).trim();

      if (fn.includes(term) || ln.includes(term) || full.includes(term)) {
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
  if (!searchResultsList || !searchResults) return;

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
      openClient(m.phone, false);
      clearSearchInputs();
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

  unsubscribeRealtime = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        renderClient(phone, snap.data());
      } else {
        if (forceCreate) {
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
  if (!card) return;
  card.classList.remove("hidden");
  if (phoneField) phoneField.value = phone;

  if ("firstName" in data && firstName) firstName.value = data.firstName || "";
  if ("lastName" in data && lastName) lastName.value = data.lastName || "";
  if ("notes" in data && notes) notes.value = data.notes || "";

  if (pointsValue) pointsValue.textContent = data.points || 0;
}

// ===============================
// RENDER TRANSACTIONS
// ===============================
function renderTransactions(arr) {
  if (!transactionsList) return;
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
// SAVE CLIENT DATA
// createdAt SOLO prima creazione
// ===============================
btnSave?.addEventListener("click", async () => {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);

  try {
    // Serve per capire se è nuovo (altrimenti non mettiamo createdAt)
    const snap = await getDoc(docRef);
    const isNew = !snap.exists();

    const payload = {
      firstName: firstName?.value || "",
      lastName: lastName?.value || "",
      notes: notes?.value || "",
      updatedAt: serverTimestamp()
    };

    if (isNew) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });

    showStatus("Salvato");
    clearSearchInputs();
    clearSearchResults();

    updateClientCount();
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

btnAddManual?.addEventListener("click", () => {
  const v = parseInt(manualDelta?.value);
  if (!v) return;
  changePoints(v);
  if (manualDelta) manualDelta.value = "";
});

btnSubManual?.addEventListener("click", () => {
  const v = parseInt(manualDelta?.value);
  if (!v) return;
  changePoints(-v);
  if (manualDelta) manualDelta.value = "";
});

// ===============================
// CHANGE POINTS + WHATSAPP AUTO
// promo SOLO se non ha ancora storico punti
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

    // primo movimento?
    const transSnap = await getDocs(transCol);
    const isFirstTimePoints = transSnap.empty;

    await setDoc(
      docRef,
      { points: newValue, updatedAt: serverTimestamp() },
      { merge: true }
    );

    await addDoc(transCol, {
      delta,
      oldValue,
      newValue,
      note: delta > 0 ? "Aggiunta punti" : "Rimozione punti",
      timestamp: serverTimestamp()
    });

    showStatus(`Punti: ${oldValue} → ${newValue}`);

    // Messaggio WhatsApp
    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryText = expiry.toLocaleDateString("it-IT");

    let message =
      `Ciao ${firstName?.value || ""}!\n` +
      `Il tuo saldo punti aggiornato è ${newValue}.\n` +
      `I tuoi punti scadono il ${expiryText}.`;

    if (isFirstTimePoints && newValue > 0) {
      message += "\nSalva questo numero in rubrica per ricevere le promozioni di Pina & Co.";
    }

    const text = encodeURIComponent(message);

    const n = normalizeItalyPhoneToE164(currentPhone);
    if (!n) return;

    // WhatsApp web: non può inviare “diretto”, apre la chat con testo pronto
    window.open(`https://wa.me/${n.digits}?text=${text}`, "_blank");
  } catch (err) {
    console.error(err);
    showStatus("Errore durante la modifica punti", true);
  }
}

// ===============================
// WHATSAPP (invio manuale)
// ===============================
btnWhats?.addEventListener("click", () => {
  if (!currentPhone) return;

  const punti = pointsValue?.textContent || "0";

  const now = new Date();
  const expiry = new Date(now);
  expiry.setFullYear(expiry.getFullYear() + 1);
  const expiryText = expiry.toLocaleDateString("it-IT");

  const text = encodeURIComponent(
    `Ciao ${firstName?.value || ""}!\n` +
    `Il tuo saldo punti aggiornato è ${punti}.\n` +
    `I tuoi punti scadono il ${expiryText}.`
  );

  const n = normalizeItalyPhoneToE164(currentPhone);
  if (!n) {
    alert("Numero di telefono non valido");
    return;
  }

  window.open(`https://wa.me/${n.digits}?text=${text}`, "_blank");
});

// ===============================
// BACKUP CLIENTI IN CSV
// ===============================
btnExportCsv?.addEventListener("click", async () => {
  try {
    showStatus("Preparazione backup in corso...");

    const snap = await getDocs(collection(db, "clients"));
    const rows = [];

    if (snap.empty) {
      showStatus("Nessun cliente da esportare", true);
      return;
    }

    rows.push("phone;firstName;lastName;notes;points;createdAt");

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const phone = docSnap.id || "";
      const fn = (data.firstName || "").toString().replace(/[\r\n;]/g, " ");
      const ln = (data.lastName  || "").toString().replace(/[\r\n;]/g, " ");
      const nt = (data.notes     || "").toString().replace(/[\r\n;]/g, " ");
      const pts = (data.points != null ? data.points : 0);

      const c = data.createdAt?.toDate ? formatDDMMYYYY(data.createdAt.toDate()) : "";
      rows.push(`${phone};${fn};${ln};${nt};${pts};${c}`);
    });

    const csvContent = rows.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `backup_clienti_${yyyy}-${mm}-${dd}.csv`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const count = rows.length - 1;
    showStatus(`Backup CSV scaricato (${count} clienti).`);
  } catch (err) {
    console.error(err);
    showStatus("Errore durante il backup CSV", true);
  }
});

// ===============================
// VCF helpers
// ===============================
function buildVcard({ displayName, e164, uid }) {
  // VCard 3.0
  return (
    "BEGIN:VCARD\r\n" +
    "VERSION:3.0\r\n" +
    `FN:${displayName}\r\n` +
    `TEL;TYPE=CELL:${e164}\r\n` +
    `UID:${uid}\r\n` +
    "END:VCARD\r\n"
  );
}

// ===============================
// ESPORTA TUTTI I CONTATTI IN VCF
// Nome: "PNC GG/MM/AAAA - Nome Cognome"
// Data = createdAt (se manca, usa "—")
// ===============================
btnExportVcf?.addEventListener("click", async () => {
  try {
    showStatus("Preparazione file contatti (TUTTI) in corso...");

    const snap = await getDocs(collection(db, "clients"));
    const cards = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};

      const n = normalizeItalyPhoneToE164(docSnap.id);
      if (!n) return;

      const fn = (data.firstName || "").toString().trim();
      const ln = (data.lastName  || "").toString().trim();
      const baseName = `${fn} ${ln}`.trim() || n.e164;

      const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      const dateTag = created ? formatDDMMYYYY(created) : "—";

      const displayName = `PNC ${dateTag} - ${baseName}`;
      const uid = n.digits; // per aiutare il merge su alcuni telefoni

      cards.push(buildVcard({ displayName, e164: n.e164, uid }));
    });

    if (!cards.length) {
      showStatus("Nessun contatto da esportare", true);
      return;
    }

    const vcfContent = cards.join("\r\n");
    const blob = new Blob([vcfContent], { type: "text/vcard;charset=utf-8;" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `contatti_PNC_TUTTI_${yyyy}-${mm}-${dd}.vcf`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`VCF scaricato (${cards.length} contatti).`);
  } catch (err) {
    console.error(err);
    showStatus("Errore durante l'esportazione VCF", true);
  }
});

// ===============================
// ESPORTA SOLO NUOVI IN VCF (da una data)
// Ti chiede: GG/MM/AAAA
// Usa query su createdAt (quindi serve createdAt nei clienti)
// ===============================
btnExportVcfNew?.addEventListener("click", async () => {
  try {
    const input = prompt("Esporta NUOVI clienti da che data? (GG/MM/AAAA)", "");
    if (input === null) return;

    const fromDate = parseDDMMYYYY(input);
    if (!fromDate) {
      showStatus("Data non valida. Usa GG/MM/AAAA", true);
      return;
    }

    showStatus("Preparazione VCF (solo nuovi) in corso...");

    const fromTs = Timestamp.fromDate(fromDate);
    const q = query(
      collection(db, "clients"),
      where("createdAt", ">=", fromTs),
      orderBy("createdAt", "asc")
    );

    const snap = await getDocs(q);
    const cards = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};

      const n = normalizeItalyPhoneToE164(docSnap.id);
      if (!n) return;

      const fn = (data.firstName || "").toString().trim();
      const ln = (data.lastName  || "").toString().trim();
      const baseName = `${fn} ${ln}`.trim() || n.e164;

      const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      const dateTag = created ? formatDDMMYYYY(created) : "—";

      const displayName = `PNC ${dateTag} - ${baseName}`;
      const uid = n.digits;

      cards.push(buildVcard({ displayName, e164: n.e164, uid }));
    });

    if (!cards.length) {
      showStatus("Nessun nuovo cliente da esportare in quella data", true);
      return;
    }

    const vcfContent = cards.join("\r\n");
    const blob = new Blob([vcfContent], { type: "text/vcard;charset=utf-8;" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const fileName = `contatti_PNC_NUOVI_da_${input.replace(/\//g, "-")}_${yyyy}-${mm}-${dd}.vcf`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`VCF NUOVI scaricato (${cards.length} contatti).`);
  } catch (err) {
    console.error(err);
    showStatus("Errore durante l'esportazione VCF NUOVI", true);
  }
});

// ===============================
// DELETE CLIENT (cliente + storico punti)
// ===============================
btnDelete?.addEventListener("click", async () => {
  if (!currentPhone) return;
  if (!confirm("Eliminare questo cliente e TUTTO lo storico punti?")) return;

  try {
    const clientRef = doc(db, "clients", currentPhone);

    const transRef = collection(db, "clients", currentPhone, "transactions");
    const transSnap = await getDocs(transRef);

    const ops = [];
    transSnap.forEach((docSnap) => ops.push(deleteDoc(docSnap.ref)));
    await Promise.all(ops);

    await deleteDoc(clientRef);

    showStatus("Cliente e storico punti eliminati");
    updateClientCount();
    hideCard();
    clearSearchInputs();
    clearSearchResults();
  } catch (err) {
    console.error(err);
    showStatus("Errore nell'eliminazione completa", true);
  }
});

function hideCard() {
  card?.classList.add("hidden");
  currentPhone = null;
  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();
}

// ===============================
// RESET ALL POINTS FOR ALL CLIENTS (with storico)
// ===============================
btnResetAllPoints?.addEventListener("click", async () => {
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
        setDoc(ref, { points: newPoints, updatedAt: serverTimestamp() }, { merge: true })
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
