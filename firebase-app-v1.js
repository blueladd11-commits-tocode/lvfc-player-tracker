import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
await setPersistence(auth, browserLocalPersistence);

const app = document.querySelector('#app');
const access = ['parent', 'coach', 'master'].includes(new URLSearchParams(location.search).get('access'))
  ? new URLSearchParams(location.search).get('access')
  : 'parent';
const DIRECTOR_UID = '3IZ4EWd9FNb3VjpcG4gcFZyCr602';
const PK_ZONE = 'Asia/Karachi';
const START_MINUTES = 16 * 60 + 30;
const END_MINUTES = 19 * 60;
const unsubscribers = new Set();

let currentUser = null;
let currentProfile = null;
let currentTab = access === 'master' ? 'overview' : 'live';
let players = [];
let sessions = [];
let liveSession = null;
let liveStats = [];
let parentStats = null;
let parentHistoryStats = {};
let directorSessionFacts = {};
let uiMessage = '';

const PILOT_PLAYERS = [
  ['ahmed','Ahmed','AHMED1'],['musa','Musa','MUSA22'],['ibrahim','Ibrahim','IBRA11'],['zain','Zain','ZAIN44'],
  ['rayan','Rayan','RAYAN5'],['hassan','Hassan','HASAN6'],['ali','Ali','ALI777'],['omar','Omar','OMAR88'],
  ['hamza','Hamza','HAMZA9'],['saad','Saad','SAAD10'],['yusuf','Yusuf','YUSF11'],['ayaan','Ayaan','AYAN12'],
  ['rayyan','Rayyan','RAYY13'],['muhammad','Muhammad','MUHD14'],['zayan','Zayan','ZAYN15'],['adam','Adam','ADAM16'],
  ['isa','Isa','ISAA17'],['talha','Talha','TALH18'],['bilal','Bilal','BILA19'],['faris','Faris','FARI20']
].map(([id,name,code]) => ({ id, name, code }));

function clearSubscriptions() {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch {}
  }
  unsubscribers.clear();
}
function track(unsub) { unsubscribers.add(unsub); return unsub; }
function logoWhite() { return '<img class="logo" src="./lvfc-logo-white.svg?v=firebase1" alt="LVFC">'; }
function logoCrimson() { return `<span class="logoBadge">${logoWhite()}</span>`; }
function escapeHtml(value='') { return String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function timestampToDate(value) { return value?.toDate ? value.toDate() : value ? new Date(value) : null; }
function fmtDate(value) { const date = timestampToDate(value); return date ? date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : '—'; }
function fmtTime(value) { const date = timestampToDate(value); return date ? date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}) : '—'; }
function totalTouches(stats=liveStats) { return stats.reduce((sum,item)=>sum+Number(item.touches||0),0); }
function averageTouches(stats=liveStats) { return Math.round(totalTouches(stats)/Math.max(1,stats.length)); }
function pkParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_ZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return { dateKey:`${parts.year}-${parts.month}-${parts.day}`, minutes:Number(parts.hour)*60+Number(parts.minute) };
}
function pkDate(dateKey,hour,minute) { return new Date(`${dateKey}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+05:00`); }
function windowStatus() {
  const now = pkParts();
  if (now.minutes < START_MINUTES) return { state:'waiting', message:'Today’s session opens automatically at 4:30 PM Pakistan time.' };
  if (now.minutes < END_MINUTES) return { state:'open', message:'Today’s live window remains open until 7:00 PM Pakistan time.' };
  return { state:'closed', message:'Today’s session window closed at 7:00 PM Pakistan time.' };
}
function messageBlock() {
  if (!uiMessage) return '';
  const cls = uiMessage.startsWith('Error:') ? 'error' : 'success';
  return `<div class="${cls}">${escapeHtml(uiMessage)}</div>`;
}
async function loadProfile(user) {
  if (!user) return null;
  const snap = await getDoc(doc(db,'users',user.uid));
  return snap.exists() ? { uid:user.uid, ...snap.data() } : null;
}
async function refreshAuthContext(user) {
  clearSubscriptions();
  currentUser = user;
  currentProfile = await loadProfile(user);
  players = []; sessions = []; liveSession = null; liveStats = []; parentStats = null; parentHistoryStats = {}; directorSessionFacts = {};
  if (access === 'parent') await setupParent();
  else if (access === 'coach') await setupStaff('coach');
  else await setupStaff('director');
  render();
}
async function setupParent() {
  if (!currentUser) {
    await signInAnonymously(auth);
    return;
  }
  if (!currentProfile || currentProfile.role !== 'parent') return;
  const q = query(collection(db,'sessions'), where('activeIds','array-contains',currentProfile.playerId));
  track(onSnapshot(q, snap => {
    sessions = snap.docs.map(d=>({id:d.id,...d.data()}));
    sessions.sort((a,b)=>(timestampToDate(b.endedAt||b.startsAt)||0)-(timestampToDate(a.endedAt||a.startsAt)||0));
    liveSession = sessions.find(s=>s.status==='live') || null;
    subscribeParentStats();
    loadParentHistoryStats().catch(error=>{uiMessage=`Error: ${error.message}`;render();});
    render();
  }, error => { uiMessage=`Error: ${error.message}`; render(); }));
}
async function loadParentHistoryStats() {
  if (!currentProfile?.playerId) return;
  const ended = sessions.filter(s=>s.status==='ended').slice(0,3);
  const next = {};
  await Promise.all(ended.map(async session => {
    const snap = await getDoc(doc(db,'sessions',session.id,'playerStats',currentProfile.playerId));
    next[session.id] = snap.exists() ? snap.data() : null;
  }));
  parentHistoryStats = next;
  render();
}
async function loadDirectorSessionFacts() {
  if (currentProfile?.role !== 'director') return;
  const next = {};
  await Promise.all(sessions.slice(0,30).map(async session => {
    const snap = await getDocs(collection(db,'sessions',session.id,'playerStats'));
    const stats = snap.docs.map(d=>d.data());
    next[session.id] = {
      total: stats.reduce((sum,item)=>sum+Number(item.touches||0),0),
      average: Math.round(stats.reduce((sum,item)=>sum+Number(item.touches||0),0)/Math.max(1,stats.length)),
      players: stats.length
    };
  }));
  directorSessionFacts = next;
  render();
}
function subscribeParentStats() {
  const existing = [...unsubscribers].filter(fn=>fn.__parentStats);
  existing.forEach(fn=>{ try{fn();}catch{} unsubscribers.delete(fn); });
  parentStats = null;
  if (!liveSession || !currentProfile) return;
  const unsub = onSnapshot(doc(db,'sessions',liveSession.id,'playerStats',currentProfile.playerId), snap => {
    parentStats = snap.exists() ? {id:snap.id,...snap.data()} : null;
    render();
  }, error=>{ uiMessage=`Error: ${error.message}`; render(); });
  unsub.__parentStats = true;
  track(unsub);
}
async function setupStaff(requiredRole) {
  if (!currentUser || !currentProfile) return;
  if (requiredRole === 'coach' && currentProfile.role !== 'coach') return;
  if (requiredRole === 'director' && currentProfile.role !== 'director') return;
  track(onSnapshot(collection(db,'players'), snap => {
    players = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    render();
  }));
  const sessionsQuery = query(collection(db,'sessions'), orderBy('startsAt','desc'), limit(60));
  track(onSnapshot(sessionsQuery, snap => {
    sessions = snap.docs.map(d=>({id:d.id,...d.data()}));
    liveSession = sessions.find(s=>s.status==='live') || null;
    subscribeLiveStats();
    if (requiredRole === 'coach') ensureScheduledSession().catch(err=>{uiMessage=`Error: ${err.message}`;render();});
    if (requiredRole === 'director') loadDirectorSessionFacts().catch(err=>{uiMessage=`Error: ${err.message}`;render();});
    render();
  }, error => { uiMessage=`Error: ${error.message}`; render(); }));
}
function subscribeLiveStats() {
  const existing = [...unsubscribers].filter(fn=>fn.__liveStats);
  existing.forEach(fn=>{ try{fn();}catch{} unsubscribers.delete(fn); });
  liveStats = [];
  if (!liveSession) return;
  const unsub = onSnapshot(collection(db,'sessions',liveSession.id,'playerStats'), snap => {
    liveStats = snap.docs.map(d=>({id:d.id,...d.data()}));
    liveStats.sort((a,b)=>Number(b.touches||0)-Number(a.touches||0));
    render();
  }, error=>{uiMessage=`Error: ${error.message}`;render();});
  unsub.__liveStats = true;
  track(unsub);
}
async function ensureScheduledSession() {
  if (access !== 'coach' || currentProfile?.role !== 'coach') return;
  const now = pkParts();
  const sessionId = `daily-${now.dateKey}`;
  const ref = doc(db,'sessions',sessionId);
  const snap = await getDoc(ref);
  if (now.minutes >= START_MINUTES && now.minutes < END_MINUTES && !snap.exists()) {
    const roster = players.filter(p=>p.active!==false);
    if (!roster.length) return;
    const batch = writeBatch(db);
    batch.set(ref, {
      title:'U6 Daily Development Session', dateKey:now.dateKey, ageGroup:'U6', status:'live',
      startsAt:Timestamp.fromDate(pkDate(now.dateKey,16,30)), endsAt:Timestamp.fromDate(pkDate(now.dateKey,19,0)),
      createdAt:serverTimestamp(), activeIds:roster.map(p=>p.id), autoScheduled:true
    });
    roster.forEach(p=>batch.set(doc(db,'sessions',sessionId,'playerStats',p.id),{
      playerId:p.id, playerName:p.name, touches:0, updatedAt:serverTimestamp(), updatedBy:currentUser.uid
    }));
    await batch.commit();
    uiMessage='Today’s scheduled session was opened automatically.';
  } else if (snap.exists() && snap.data().status==='live' && now.minutes >= END_MINUTES) {
    await updateDoc(ref,{status:'ended',endedAt:serverTimestamp()});
    uiMessage='Today’s session was closed and saved automatically.';
  }
}
async function pairParent(form) {
  uiMessage='';
  const data = new FormData(form);
  const code = String(data.get('code')||'').trim().toUpperCase();
  const displayName = String(data.get('parent')||'').trim();
  const pairingSnap = await getDoc(doc(db,'pairingCodes',code));
  if (!pairingSnap.exists() || pairingSnap.data().active !== true) throw new Error('Child code not recognised or inactive.');
  const playerId = pairingSnap.data().playerId;
  await setDoc(doc(db,'users',currentUser.uid), {
    role:'parent', playerId, pairingCode:code, displayName, createdAt:serverTimestamp()
  });
  currentProfile = await loadProfile(currentUser);
  await setupParent();
}
async function incrementTouch(delta) {
  if (!liveSession || !currentProfile?.playerId) return;
  const ref = doc(db,'sessions',liveSession.id,'playerStats',currentProfile.playerId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Player record is not active in this session.');
    const current = Number(snap.data().touches||0);
    tx.update(ref,{touches:Math.max(0,current+delta),updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
  });
}
async function signInStaff(form) {
  const data = new FormData(form);
  await signInWithEmailAndPassword(auth,String(data.get('email')||'').trim(),String(data.get('password')||''));
}
async function initializePilotData() {
  if (currentProfile?.role !== 'director') throw new Error('Director access required.');
  const batch = writeBatch(db);
  PILOT_PLAYERS.forEach(item=>{
    batch.set(doc(db,'players',item.id),{name:item.name,ageGroup:'U6',active:true,createdAt:serverTimestamp()},{merge:true});
    batch.set(doc(db,'pairingCodes',item.code),{playerId:item.id,active:true,createdAt:serverTimestamp()},{merge:true});
  });
  await batch.commit();
  uiMessage='Pilot players and parent pairing codes are ready.';
}
async function startManualSession(form) {
  const data = new FormData(form);
  const activeIds = data.getAll('players');
  if (!activeIds.length) throw new Error('Select at least one active player.');
  const now = new Date();
  const id = `manual-${Date.now()}`;
  const end = new Date(now.getTime()+150*60000);
  const batch = writeBatch(db);
  batch.set(doc(db,'sessions',id),{
    title:String(data.get('title')||'U6 Development Session').trim(),ageGroup:'U6',status:'live',
    startsAt:Timestamp.fromDate(now),endsAt:Timestamp.fromDate(end),createdAt:serverTimestamp(),
    activeIds,autoScheduled:false
  });
  activeIds.forEach(pid=>{
    const p=players.find(x=>x.id===pid);
    batch.set(doc(db,'sessions',id,'playerStats',pid),{
      playerId:pid,playerName:p?.name||pid,touches:0,updatedAt:serverTimestamp(),updatedBy:currentUser.uid
    });
  });
  await batch.commit();
  currentTab='live'; uiMessage='Session started.';
}
async function endLiveSession() {
  if (!liveSession) return;
  await updateDoc(doc(db,'sessions',liveSession.id),{status:'ended',endedAt:serverTimestamp()});
  uiMessage='Session ended and saved.';
}
function parentLoginView() {
  return `<main class="screen dark"><div class="top">${logoWhite()}<span class="status">Parent access</span></div><p class="ey">Firebase Live</p><h1>Your child. Their live counter.</h1><p class="lead">Enter the child pairing code once. This browser will stay connected to that player.</p>${messageBlock()}<form class="card" id="parentLogin"><div class="field"><label>Parent name</label><input name="parent" required></div><div class="field"><label>Child access code</label><input name="code" placeholder="AHMED1" required autocomplete="off"></div><button class="primary">Connect to child</button></form><div class="demo">Use one of the director-created pairing codes. Parents cannot list or access other children.</div></main>`;
}
function parentView() {
  if (!currentProfile || currentProfile.role!=='parent') return parentLoginView();
  const childName = parentStats?.playerName || players.find(p=>p.id===currentProfile.playerId)?.name || currentProfile.playerId;
  const history = sessions.filter(s=>s.status==='ended').slice(0,3);
  const historyHtml = history.length ? history.map(s=>`<div class="historyItem"><span><b>${escapeHtml(s.title)}</b><small>${fmtDate(s.endedAt||s.endsAt)}</small></span><span class="count">${Number(parentHistoryStats[s.id]?.touches||0)}</span></div>`).join('') : '<div class="empty">No completed sessions yet.</div>';
  if (!liveSession || !parentStats) {
    return `<main class="screen"><div class="top">${logoCrimson()}<button class="iconBtn" data-action="logout">↗</button></div><span class="status">Parent access</span>${messageBlock()}<div class="empty" style="margin-top:18px"><h2>No live session for ${escapeHtml(childName)}</h2><p class="muted">${windowStatus().message}</p></div><section class="scheduleCard"><p class="ey">Previous 3 sessions</p><div class="list">${historyHtml}</div></section></main>`;
  }
  return `<main class="screen counter"><div class="top">${logoWhite()}<button class="back" data-action="logout">↗</button></div><div class="center"><p class="ey">${escapeHtml(liveSession.title)}</p><h2>${escapeHtml(childName)}’s ball touches</h2><p>Tap once every time the player touches the ball.</p><span class="liveNote"><span class="dot"></span>Updating live in Firestore</span></div>${messageBlock()}<div class="counterBody"><button class="touch" data-action="touch"><span class="num">${Number(parentStats.touches||0)}</span><span class="tap">Record Ball Touch</span></button></div><div class="counterFoot"><button class="ghost" data-action="undo">− Undo</button><button class="ghost" disabled>Cloud saved ✓</button></div><section class="historyPanel"><p class="ey">Previous 3 sessions</p><div class="list">${historyHtml}</div></section></main>`;
}
function staffLoginView(kind) {
  return `<main class="screen dark"><div class="top">${logoWhite()}<span class="status">${kind==='coach'?'Coach':'Director'} access</span></div><p class="ey">Firebase secure sign-in</p><h1>${kind==='coach'?'Run the session live.':'Hard facts. No noise.'}</h1><p class="lead">Sign in with the Firebase email/password account assigned to this role.</p>${messageBlock()}<form class="card" id="staffLogin"><div class="field"><label>Email</label><input type="email" name="email" required></div><div class="field"><label>Password</label><input type="password" name="password" required></div><button class="primary">Sign in</button></form></main>`;
}
function shellHead(label,title){return `<header class="shellHead">${logoCrimson()}<div class="shellTitle"><small>${label}</small><strong>${title}</strong></div><button class="iconBtn" data-action="logout">↗</button></header>`;}
function coachLiveView() {
  if (!liveSession) return `<div class="empty"><h2>No active session</h2><p class="muted">${windowStatus().message}</p><button class="primary" data-action="ensureSchedule">Check scheduled session</button></div>`;
  const avg=averageTouches();
  return `<section class="hero"><div class="heroRow"><div><small>LIVE SESSION</small><h2>${escapeHtml(liveSession.title)}</h2><p>${fmtDate(liveSession.startsAt)} · ${fmtTime(liveSession.startsAt)}–${fmtTime(liveSession.endsAt)}</p></div><span class="status live"><span class="dot"></span>Live</span></div></section><div class="metrics"><div class="metric"><b>${totalTouches()}</b><small>Total touches</small></div><div class="metric"><b>${avg}</b><small>Average/player</small></div><div class="metric"><b>${liveStats.length}</b><small>Active players</small></div><div class="metric"><b>Cloud</b><small>Real-time sync</small></div></div><div class="sectionHead"><div><p class="ey">Live input</p><h3>Parent taps</h3></div><span class="badge">Firestore listener</span></div><div class="list">${liveStats.map((s,i)=>`<div class="player"><span><b>${i+1}. ${escapeHtml(s.playerName||s.playerId)}</b><small>${Number(s.touches||0)<avg*.5?'Low-touch flag':'Updating live'}</small></span><span class="count">${Number(s.touches||0)}</span></div>`).join('')}</div><button class="danger" style="margin-top:16px" data-action="endSession">End & Save Session</button>`;
}
function coachSetupView() {
  if (liveSession) return `<div class="notice warn"><b>A live session is already running.</b><p>End it before starting another.</p></div>`;
  return `<p class="ey">Session setup</p><h2>Start a manual session.</h2><form id="sessionForm"><div class="field"><label>Session title</label><input name="title" value="U6 Development Session" required></div><div class="tools"><button type="button" data-action="selectAll">Select all</button><button type="button" data-action="selectNone">Clear all</button></div><div class="list">${players.map((p,i)=>`<label class="check"><input type="checkbox" name="players" value="${p.id}" ${i<12?'checked':''}>${escapeHtml(p.name)}</label>`).join('')}</div><button class="primary" style="margin-top:14px">Start session</button></form><div class="notice warn"><b>Automatic schedule:</b> the included Cloud Functions source opens at 4:30 PM and closes at 7:00 PM Asia/Karachi once functions are deployed on Blaze. Until then, opening the coach dashboard during the window can create today’s session.</div>`;
}
function coachHistoryView() {
  const ended=sessions.filter(s=>s.status==='ended');
  return `<p class="ey">Saved records</p><h2>Completed sessions.</h2><div class="list">${ended.length?ended.map(s=>`<div class="sessionRow"><span><b>${escapeHtml(s.title)}</b><small>${fmtDate(s.endedAt||s.endsAt)}</small></span><span class="count">${Number(directorSessionFacts[s.id]?.total||0)}</span></div>`).join(''):'<div class="empty">No completed sessions yet.</div>'}</div>`;
}
function coachView() {
  if (!currentUser || !currentProfile) return staffLoginView('coach');
  if (currentProfile.role!=='coach') return `<main class="screen dark"><div class="top">${logoWhite()}</div><div class="card"><h2>Coach profile required</h2><p>This Firebase user does not have <b>role: coach</b> in Firestore.</p><button class="primary" data-action="logout">Sign out</button></div></main>`;
  return `<main class="screen shell">${shellHead('LVFC Coach',currentTab==='live'?'Live session':currentTab==='setup'?'Session setup':'Saved sessions')}${messageBlock()}${currentTab==='live'?coachLiveView():currentTab==='setup'?coachSetupView():coachHistoryView()}<nav class="nav"><button data-tab="live" class="${currentTab==='live'?'active':''}">●<br>Live</button><button data-tab="setup" class="${currentTab==='setup'?'active':''}">＋<br>Setup</button><button data-tab="history" class="${currentTab==='history'?'active':''}">▤<br>History</button></nav></main>`;
}
function masterView() {
  if (!currentUser || !currentProfile) return staffLoginView('director');
  if (currentProfile.role!=='director' || currentUser.uid!==DIRECTOR_UID) return `<main class="screen dark"><div class="top">${logoWhite()}</div><div class="card"><h2>Director profile required</h2><p>This Firebase user is not the authorised LVFC director account.</p><button class="primary" data-action="logout">Sign out</button></div></main>`;
  const ended=sessions.filter(s=>s.status==='ended');
  const recent=ended.slice(0,10);
  const historicalTouches=ended.reduce((sum,s)=>sum+Number(directorSessionFacts[s.id]?.total||0),0);
  const historicalPlayers=ended.reduce((sum,s)=>sum+Number(directorSessionFacts[s.id]?.players||0),0);
  const historicalAverage=Math.round(historicalTouches/Math.max(1,historicalPlayers));
  return `<main class="screen shell">${shellHead('LVFC Directors',currentTab==='overview'?'Hard facts':currentTab==='sessions'?'Session facts':'System setup')}${messageBlock()}${currentTab==='overview'?`<section class="hero"><div class="heroRow"><div><small>DIRECTOR VIEW</small><h2>${liveSession?'Session currently live':'No live session'}</h2><p>${liveSession?`${escapeHtml(liveSession.title)} · parent inputs are updating live`:'Completed sessions remain available below.'}</p></div>${liveSession?'<span class="status live"><span class="dot"></span>Live</span>':''}</div></section><div class="summaryGrid" style="margin-top:12px"><div class="summaryBox"><b>${ended.length}</b><span>Completed sessions</span></div><div class="summaryBox"><b>${historicalTouches}</b><span>Saved touches</span></div><div class="summaryBox"><b>${historicalAverage}</b><span>Avg/player-session</span></div><div class="summaryBox"><b>${totalTouches()}</b><span>Live touches</span></div></div><div class="sectionHead"><div><p class="ey">Recent sessions</p><h3>Operational record</h3></div></div><div class="list">${recent.length?recent.map(s=>`<div class="sessionRow"><span><b>${escapeHtml(s.title)}</b><small>${fmtDate(s.endedAt||s.endsAt)} · ${s.activeIds?.length||0} players</small></span><span class="badge">Saved</span></div>`).join(''):'<div class="empty">No completed sessions yet.</div>'}</div>`:currentTab==='sessions'?`<p class="ey">Session facts</p><h2>All cloud sessions.</h2><div class="list">${sessions.map(s=>`<div class="sessionRow"><span><b>${escapeHtml(s.title)}</b><small>${fmtDate(s.startsAt)} · ${s.activeIds?.length||0} players</small></span><span class="count">${Number(directorSessionFacts[s.id]?.total||0)}</span></div>`).join('')}</div>`:`<p class="ey">Initialise Firebase data</p><h2>Prepare the LVFC pilot.</h2><div class="card"><p>Create 20 fake players and their parent pairing codes in Firestore.</p><button class="primary" data-action="initPilot">Initialise pilot data</button></div><div class="notice warn"><b>Coach account still required:</b> create a Firebase Authentication email/password user, then add a matching <code>users/{uid}</code> document with <code>role: coach</code>, <code>displayName</code>, and <code>active: true</code>.</div>`}<nav class="nav"><button data-tab="overview" class="${currentTab==='overview'?'active':''}">▦<br>Overview</button><button data-tab="sessions" class="${currentTab==='sessions'?'active':''}">▤<br>Sessions</button><button data-tab="setup" class="${currentTab==='setup'?'active':''}">⚙<br>Setup</button></nav></main>`;
}
function render() { app.innerHTML = access==='parent'?parentView():access==='coach'?coachView():masterView(); }

document.addEventListener('click', async event => {
  const button=event.target.closest('button'); if(!button) return;
  try {
    uiMessage='';
    if(button.dataset.tab){currentTab=button.dataset.tab;render();return;}
    const action=button.dataset.action;
    if(action==='logout'){await signOut(auth);return;}
    if(action==='touch'){await incrementTouch(1);return;}
    if(action==='undo'){await incrementTouch(-1);return;}
    if(action==='endSession'){await endLiveSession();return;}
    if(action==='ensureSchedule'){await ensureScheduledSession();render();return;}
    if(action==='initPilot'){await initializePilotData();render();return;}
    if(action==='selectAll') document.querySelectorAll('input[name="players"]').forEach(x=>x.checked=true);
    if(action==='selectNone') document.querySelectorAll('input[name="players"]').forEach(x=>x.checked=false);
  } catch (error) { uiMessage=`Error: ${error.message}`; render(); }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    uiMessage='';
    if(event.target.id==='parentLogin') await pairParent(event.target);
    if(event.target.id==='staffLogin') await signInStaff(event.target);
    if(event.target.id==='sessionForm') await startManualSession(event.target);
    render();
  } catch (error) { uiMessage=`Error: ${error.message}`; render(); }
});

onAuthStateChanged(auth, user => refreshAuthContext(user).catch(error=>{uiMessage=`Error: ${error.message}`;render();}));
setInterval(()=>{ if(access==='coach'&&currentProfile?.role==='coach') ensureScheduledSession().catch(()=>{}); },30000);
if('serviceWorker' in navigator) addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=firebase2'));
