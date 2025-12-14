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
const btnExportVcf = document.getElementById("btnExportVcf");

const manualDelta = document.getElementById("manualDelta");
const btnAddManual = document.getElementById("btnAddManual");
const btnSubManual = document.getElementById("btnSubManual");

const status = document.getElementById("status");
const transactionsList = document.getElementById("transactionsList");

// Contatore tessere
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
// PHONE NORMALIZATION (definitiva anti doppio 39)
// - Restituisce SEMPRE "39XXXXXXXXXX" (senza +) per Italia
// - Toglie prefissi doppi (0039, 3939, 390039, ecc)
// ===============================
function italyDigits(anyPhone) {
  let digits = (anyPhone || "").toString().replace(/\D/g, "");
  if (!digits) return "";

  // 00... davanti
  while (digits.startsWith("00")) digits = digits.slice(2);

  // se rimane 0039...
  if (digits.startsWith("0039")) digits = digits.slice(2); // -> 39...

  // elimina ripetizioni di 39 all'inizio: 3939..., 393939...
  while (digits.startsWith("3939")) digits = digits.slice(2);

  // casi tipo 390039...
  if (digits.startsWith("390039")) digits = "39" + digits.slice(6);

  // se è mobile senza prefisso (347...)
  if (digits.startsWith("3")) digits = "39" + digits;

  // se ora inizia con 39, ok
  if (digits.startsWith("39")) {
    // ulteriore sicurezza: se ci sono ancora 39 doppi
    while (digits.startsWith("39") && digits.slice(2).startsWith("39")) {
      digits = digits.slice(2);
    }
    return digits;
  }

  // fallback (estero): restituisco così com'è
  return digits;
}

function canonicalIdFromInput(anyPhone) {
  const d = italyDigits(anyPhone);
  return d ? `+${d}` : "";
}

function legacyIdFromCanon(canonId) {
  // canon: +39XXXXXXXXXX -> legacy: +347XXXXXXXX (solo se mobile)
  const d = italyDigits(canonId); // 39...
  if (!d.startsWith("39")) return null;
  const w = d.slice(2); // senza 39
  if (!w.startsWith("3")) return null; // legacy ha senso solo per mobile
  return `+${w}`;
}

function double39IdFromCanon(canonId) {
  // se esiste in db un vecchio id tipo +3939....
  const d = italyDigits(canonId); // 39XXXXXXXXXX
  if (!d.startsWith("39")) return null;
  return `+39${d}`; // +3939XXXXXXXXXX
}

// ===============================
// Resolve ID (NON crea doppioni)
// Prova in ordine:
// 1) +39...
// 2) +3939... (vecchio errore)
// 3) +347... (legacy)
// Se non esiste nessuno, usa +39... per creare nuovo
// ===============================
async function resolveClientDocId(inputPhoneOrId) {
  const canonical = canonicalIdFromInput(inputPhoneOrId);
  if (!canonical) return "";

  // 1) canonical
  const snapCanon = await getDoc(doc(db, "clients", canonical));
  if (snapCanon.exists()) return canonical;

  // 2) double39
  const d39 = double39IdFromCanon(canonical);
  if (d39) {
    const snapD39 = await getDoc(doc(db, "clients", d39));
    if (snapD39.exists()) return d39;
  }

  // 3) legacy +347...
  const legacy = legacyIdFromCanon(canonical);
  if (legacy) {
    const snapLegacy = await getDoc(doc(db, "clients", legacy));
    if (snapLegacy.exists()) return legacy;
  }

  // non esiste niente -> crea nuovo con canonical
  return canonical;
}

// ===============================
// DATE helpers
// ===============================
function formatDateDDMMYYYY(d) {
  return d.toLocaleDateString("it-IT");
}
function parseDDMMYYYY(s) {
  const txt = (s || "").trim();
  if (!txt) return null;
  const m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const dt = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

// ===============================
// UPDATE CLIENT COUNT
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
btnNew?.addEventListener("click", async () => {
  const id = await resolveClientDocId(phoneInput?.value);
  if (!id) return showStatus("Numero non valido", true);
  openClient(id, true);
  clearSearchInputs();
  clearSearchResults();
});

btnLoad?.addEventListener("click", async () => {
  const id = await resolveClientDocId(phoneInput?.value);
  if (!id) return showStatus("Numero non valido", true);
  openClient(id, false);
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
async function openClient(phoneId, forceCreate = false) {
  currentPhone = phoneId;

  if (unsubscribeRealtime) unsubscribeRealtime();
  if (unsubscribeTransactions) unsubscribeTransactions();

  const docRef = doc(db, "clients", phoneId);

  unsubscribeRealtime = onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        renderClient(phoneId, snap.data());
      } else {
        if (forceCreate) {
          renderClient(phoneId, {
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

  const transRef = collection(db, "clients", phoneId, "transactions");
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
function renderClient(phoneId, data) {
  if (!card) return;
  card.classList.remove("hidden");
  if (phoneField) phoneField.value = phoneId;

  if (firstName && ("firstName" in data)) firstName.value = data.firstName || "";
  if (lastName && ("lastName" in data)) lastName.value = data.lastName || "";
  if (notes && ("notes" in data)) notes.value = data.notes || "";

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
// ✅ createdAt SOLO se il doc NON esiste (vera prima creazione)
// ✅ se premi salva su cliente vecchio NON cambia createdAt
// ✅ IMPORTANTISSIMO: currentPhone è già “risolto”, quindi non crea un nuovo doc
// ===============================
btnSave?.addEventListener("click", async () => {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);

  try {
    const snap = await getDoc(docRef);
    const isNewClient = !snap.exists();

    const payload = {
      firstName: firstName?.value || "",
      lastName: lastName?.value || "",
      notes: notes?.value || "",
      updatedAt: serverTimestamp()
    };

    if (isNewClient) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });

    showStatus(isNewClient ? "Cliente creato e salvato" : "Salvato");
    clearSearchInputs();
    clearSearchResults();

    if (isNewClient) updateClientCount();
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
    const delta = parseInt(btn.dataset.delta, 10);
    if (!isNaN(delta)) changePoints(delta);
  });
});

btnAddManual?.addEventListener("click", () => {
  const v = parseInt(manualDelta?.value, 10);
  if (!v) return;
  changePoints(v);
  if (manualDelta) manualDelta.value = "";
});

btnSubManual?.addEventListener("click", () => {
  const v = parseInt(manualDelta?.value, 10);
  if (!v) return;
  changePoints(-v);
  if (manualDelta) manualDelta.value = "";
});

// ===============================
// CHANGE POINTS + WHATSAPP AUTO
// ✅ Promo SOLO alla prima transazione
// ✅ Numero anti doppio 39 (sempre)
// ===============================
async function changePoints(delta) {
  if (!currentPhone) return;

  const docRef = doc(db, "clients", currentPhone);
  const transCol = collection(docRef, "transactions");

  try {
    const snap = await getDoc(docRef);
    const oldValue = snap.exists() ? (snap.data().points || 0) : 0;

    let newValue = oldValue + delta;
    if (newValue < 0) newValue = 0;

    // PRIMA transazione? (nessun doc nello storico)
    const transSnap = await getDocs(transCol);
    const isFirstTransaction = transSnap.empty;

    // aggiorno punti (NON tocco createdAt)
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

    // scadenza a 1 anno da oggi
    const now = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryText = formatDateDDMMYYYY(expiry);

    const nome = (firstName?.value || "").trim();

    let message =
      `Ciao ${nome || ""}!\n` +
      `Il tuo saldo punti aggiornato è ${newValue}.\n` +
      `I tuoi punti scadono il ${expiryText}.`;

    // SOLO prima volta
    if (isFirstTransaction) {
      message += `\nSalva questo numero in rubrica per ricevere le promozioni di Pina & Co.`;
    }

    const text = encodeURIComponent(message);

    // wa.me vuole 39XXXXXXXXXX (senza +)
    const digits = italyDigits(currentPhone);
    if (digits) window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
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

  const punti = (pointsValue?.textContent || "0").toString();

  const now = new Date();
  const expiry = new Date(now);
  expiry.setFullYear(expiry.getFullYear() + 1);
  const expiryText = formatDateDDMMYYYY(expiry);

  const nome = (firstName?.value || "").trim();

  const message =
    `Ciao ${nome || ""}!\n` +
    `Il tuo saldo punti aggiornato è ${punti}.\n` +
    `I tuoi punti scadono il ${expiryText}.`;

  const text = encodeURIComponent(message);
  const digits = italyDigits(currentPhone);

  if (!digits) return alert("Numero di telefono non valido");
  window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
});

// ===============================
// BACKUP CLIENTI IN CSV
// ===============================
btnExportCsv?.addEventListener("click", async () => {
  try {
    showStatus("Preparazione backup in corso...");

    const snap = await getDocs(collection(db, "clients"));
    if (snap.empty) return showStatus("Nessun cliente da esportare", true);

    const rows = [];
    rows.push("phone;firstName;lastName;notes;points;createdAt");

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const phone = docSnap.id || "";
      const fn = (data.firstName || "").toString().replace(/[\r\n;]/g, " ");
      const ln = (data.lastName  || "").toString().replace(/[\r\n;]/g, " ");
      const nt = (data.notes     || "").toString().replace(/[\r\n;]/g, " ");
      const pts = (data.points != null ? data.points : 0);
      const created = data.createdAt?.toDate ? formatDateDDMMYYYY(data.createdAt.toDate()) : "";
      rows.push(`${phone};${fn};${ln};${nt};${pts};${created}`);
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

    showStatus(`Backup CSV scaricato (${rows.length - 1} clienti).`);
  } catch (err) {
    console.error(err);
    showStatus("Errore durante il backup CSV", true);
  }
});

// ===============================
// ESPORTA CONTATTI IN VCF
// ✅ Filtra SOLO per createdAt (che ora NON viene falsato dal tasto Salva)
// ✅ Numero sempre "+39..." una sola volta
// ✅ Nome include data creazione
// ===============================
btnExportVcf?.addEventListener("click", async () => {
  try {
    const fromStr = prompt(
      "Esporta contatti creati DA questa data (gg/mm/aaaa).\n" +
      "Lascia vuoto per esportare TUTTI.\n\nEsempio: 01/12/2025",
      ""
    );

    const fromDate = parseDDMMYYYY(fromStr || "");
    if (fromStr && !fromDate) {
      showStatus("Formato data non valido. Usa gg/mm/aaaa", true);
      return;
    }

    showStatus("Preparazione file contatti in corso...");

    const snap = await getDocs(collection(db, "clients"));
    const cards = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;

      if (fromDate) {
        // se manca createdAt NON lo consideriamo "nuovo"
        if (!createdAtDate) return;
        if (createdAtDate.getTime() < fromDate.getTime()) return;
      }

      const digits = italyDigits(docSnap.id);     // 39XXXXXXXXXX
      if (!digits) return;

      const fullNumber = "+" + digits;            // +39XXXXXXXXXX (una sola volta)

      const fn = (data.firstName || "").toString().trim();
      const ln = (data.lastName  || "").toString().trim();
      let displayName = `${fn} ${ln}`.trim();
      if (!displayName) displayName = fullNumber;

      const createdText = createdAtDate ? formatDateDDMMYYYY(createdAtDate) : "—";
      const vcardName = `Pina & Co ${createdText} - ${displayName}`;

      const vcard =
        "BEGIN:VCARD\r\n" +
        "VERSION:3.0\r\n" +
        `FN:${vcardName}\r\n` +
        `TEL;TYPE=CELL:${fullNumber}\r\n` +
        "END:VCARD\r\n";

      cards.push(vcard);
    });

    if (!cards.length) return showStatus("Nessun contatto da esportare (con quel filtro).", true);

    const vcfContent = cards.join("\r\n");
    const blob = new Blob([vcfContent], { type: "text/vcard;charset=utf-8;" });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const suffix = fromDate
      ? `_da_${String(fromDate.getDate()).padStart(2,"0")}-${String(fromDate.getMonth()+1).padStart(2,"0")}-${fromDate.getFullYear()}`
      : "";

    const fileName = `contatti_clienti${suffix}_${yyyy}-${mm}-${dd}.vcf`;

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
