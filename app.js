// app.js (completo con storico)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, deleteDoc,
  collection, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCctBq0nelD9HsjjmghFdSs6rN1vBA67Co",
  authDomain: "tessera-punti-pina.firebaseapp.com",
  projectId: "tessera-punti-pina",
  storageBucket: "tessera-punti-pina.firebasestorage.app",
  messagingSenderId: "280210595024",
  appId: "1:280210595024:web:2c056ee1c34ba8cf76d2d5",
  measurementId: "G-S2XMRXLMJ5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM
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

let unsubscribeRealtime = null;
let unsubscribeTransactions = null;
let currentPhone = null;

function showStatus(msg,isError=false){
  status.textContent = msg;
  status.style.color = isError ? 'var(--danger)' : '#333';
  setTimeout(()=>{ if(status.textContent===msg) status.textContent=""; },4000);
}

function normalizePhone(p){ return p.replace(/\s+/g,"").replace(/[()\-\.]/g,""); }

btnNew.addEventListener('click', ()=>{
  const p = normalizePhone(phoneInput.value);
  if(!p) return showStatus("Numero non valido",true);
  openClient(p,true);
});
btnLoad.addEventListener('click', ()=>{
  const p = normalizePhone(phoneInput.value);
  if(!p) return showStatus("Numero non valido",true);
  openClient(p,false);
});

async function openClient(phone,forceCreate=false){
  currentPhone = phone;
  if(unsubscribeRealtime){ unsubscribeRealtime(); }
  if(unsubscribeTransactions){ unsubscribeTransactions(); }

  const docRef = doc(db,"clients",phone);

  unsubscribeRealtime = onSnapshot(docRef,(snap)=>{
    if(snap.exists()){
      renderClient(phone,snap.data());
    } else {
      if(forceCreate){
        const data = { firstName:"", lastName:"", notes:"", points:0, createdAt:new Date() };
        setDoc(docRef,data);
        renderClient(phone,data);
      } else {
        showStatus("Cliente non trovato",true);
        hideCard();
      }
    }
  });

  const transRef = collection(db,"clients",phone,"transactions");
  const qTrans = query(transRef, orderBy("timestamp","desc"));

  unsubscribeTransactions = onSnapshot(qTrans,(snap)=>{
    const arr=[];
    snap.forEach(s=>arr.push(s.data()));
    renderTransactions(arr);
  });
}

function renderClient(phone,data){
  card.classList.remove("hidden");
  phoneField.value = phone;
  firstName.value = data.firstName || "";
  lastName.value = data.lastName || "";
  notes.value = data.notes || "";
  pointsValue.textContent = data.points || 0;
}

function renderTransactions(arr){
  transactionsList.innerHTML="";
  if(arr.length===0){
    transactionsList.innerHTML="<em>Nessuna transazione</em>";
    return;
  }
  arr.forEach(t=>{
    const div=document.createElement("div");
    div.className="transaction-item";
    const cls = t.delta >= 0 ? "t-positive" : "t-negative";
    const sign = t.delta >= 0 ? "+" : "";
    const time = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleString() : "-";
    div.innerHTML = `
      <div><span class="${cls}">${sign}${t.delta}</span>
      <span style="font-size:0.8rem;color:#666">(da ${t.oldValue} a ${t.newValue})</span></div>
      <div style="font-size:0.8rem;color:#777">${time}</div>
      ${t.note ? `<div style="font-size:0.8rem;color:#555">${t.note}</div>` : ""}
    `;
    transactionsList.appendChild(div);
  });
}

btnSave.addEventListener('click',async()=>{
  if(!currentPhone) return;
  const docRef = doc(db,"clients",currentPhone);
  await setDoc(docRef,{
    firstName:firstName.value,
    lastName:lastName.value,
    notes:notes.value,
    updatedAt:new Date()
  },{merge:true});
  showStatus("Salvato");
});

document.querySelectorAll('.points-buttons button').forEach(btn=>{
  btn.addEventListener('click',()=>changePoints(parseInt(btn.dataset.delta)));
});
btnAddManual.addEventListener('click',()=>{ const v=parseInt(manualDelta.value); if(!v) return; changePoints(v); manualDelta.value=""; });
btnSubManual.addEventListener('click',()=>{ const v=parseInt(manualDelta.value); if(!v) return; changePoints(-v); manualDelta.value=""; });

async function changePoints(delta){
  if(!currentPhone) return;
  const docRef = doc(db,"clients",currentPhone);
  const transCol = collection(docRef,"transactions");

  const snap = await getDoc(docRef);
  const oldValue = snap.exists() ? (snap.data().points || 0) : 0;

  let newValue = oldValue + delta;
  if(newValue < 0) newValue = 0;

  await setDoc(docRef,{ points:newValue, updatedAt:new Date() },{merge:true});

  await addDoc(transCol,{
    delta:delta,
    oldValue:oldValue,
    newValue:newValue,
    note: delta>0 ? "Aggiunta punti" : "Rimozione punti",
    timestamp: serverTimestamp()
  });

  showStatus(`Punti: ${oldValue} → ${newValue}`);
}

btnWhats.addEventListener('click',()=>{
  if(!currentPhone) return;
  const text = encodeURIComponent(`Ciao ${firstName.value||""}!`);
  const sanitized = currentPhone.replace(/\D/g,"");
  window.open(`https://wa.me/${sanitized}?text=${text}`,"_blank");
});

btnDelete.addEventListener('click',async()=>{
  if(!currentPhone) return;
  if(!confirm("Eliminare cliente?")) return;
  await deleteDoc(doc(db,"clients",currentPhone));
  showStatus("Cliente eliminato");
  hideCard();
});

function hideCard(){
  card.classList.add("hidden");
  currentPhone=null;
  if(unsubscribeRealtime) unsubscribeRealtime();
  if(unsubscribeTransactions) unsubscribeTransactions();
}
