import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const ACCESS = ['parent','coach','master'].includes(new URLSearchParams(location.search).get('access'))
  ? new URLSearchParams(location.search).get('access') : 'parent';
const app = initializeApp(firebaseConfig, `lvfc-${ACCESS}`);
export const auth = getAuth(app);
export const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

export const root = document.getElementById('app');
export const PK_ZONE = 'Asia/Karachi';
export const PILOT_PLAYERS = [
  ['ahmed','Ahmed','AHMED1'],['musa','Musa','MUSA22'],['ibrahim','Ibrahim','IBRA11'],['zain','Zain','ZAIN44'],
  ['rayan','Rayan','RAYAN5'],['hassan','Hassan','HASAN6'],['ali','Ali','ALI777'],['omar','Omar','OMAR88'],
  ['hamza','Hamza','HAMZA9'],['saad','Saad','SAAD10'],['yusuf','Yusuf','YUSF11'],['ayaan','Ayaan','AYAN12'],
  ['rayyan','Rayyan','RAYY13'],['muhammad','Muhammad','MUHD14'],['zayan','Zayan','ZAYN15'],['adam','Adam','ADAM16'],
  ['isa','Isa','ISAA17'],['talha','Talha','TALH18'],['bilal','Bilal','BILA19'],['faris','Faris','FARI20']
].map(([id,name,code])=>({id,name,code}));

export const state = {
  user:null, profile:null, players:new Map(), sessions:[], liveStats:[], activeSession:null,
  tab:ACCESS==='master'?'overview':'live', unsubs:[], authResolved:false
};

export const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const logoWhite=()=>'<img class="logo" src="./lvfc-logo-white.svg?v=8" alt="LVFC">';
export const logoBadge=()=>`<span class="logoBadge">${logoWhite()}</span>`;
export const tsDate=v=>v?.toDate?v.toDate():v instanceof Date?v:new Date(v||Date.now());
export const fmtDate=v=>tsDate(v).toLocaleDateString('en-GB',{timeZone:PK_ZONE,day:'numeric',month:'short',year:'numeric'});
export const fmtTime=v=>tsDate(v).toLocaleTimeString('en-US',{timeZone:PK_ZONE,hour:'numeric',minute:'2-digit'});
export const cleanup=()=>{state.unsubs.forEach(fn=>fn());state.unsubs=[]};

export function pakistanParts(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:PK_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return{date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
export function scheduleText(){const n=pakistanParts();if(n.minutes<990)return"Today's counter opens automatically at 4:30 PM Pakistan time.";if(n.minutes<1140)return"Today's session window is active until 7:00 PM Pakistan time.";return"Today's session window closed at 7:00 PM Pakistan time."}
export function shellHeader(label,title){return`<header class="shellHead">${logoBadge()}<div class="shellTitle"><small>${esc(label)}</small><strong>${esc(title)}</strong></div><button class="iconBtn" data-action="logout">↗</button></header>`}
export function loading(message='Connecting to LVFC Live…'){root.innerHTML=`<main class="screen loading"><div>${logoBadge()}<h2>${esc(message)}</h2><p class="muted">Secure Firebase connection</p></div></main>`}
export function errorScreen(error){console.error(error);root.innerHTML=`<main class="screen"><div class="top">${logoBadge()}</div><div class="alert"><h2>Connection issue</h2><p>${esc(error?.message||error)}</p><button class="primary" onclick="location.reload()">Try again</button></div></main>`}
