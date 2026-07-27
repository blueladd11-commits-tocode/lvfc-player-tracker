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
const params = new URLSearchParams(location.search);
const access = ['parent', 'coach', 'master'].includes(params.get('access')) ? params.get('access') : 'parent';
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
let sessionFacts = {};
let uiMessage = '';
let touchCelebration = false;

const PILOT_PLAYERS = [
  ['ahmed','Ahmed','AHMED1'],['musa','Musa','MUSA22'],['ibrahim','Ibrahim','IBRA11'],['zain','Zain','ZAIN44'],
  ['rayan','Rayan','RAYAN5'],['hassan','Hassan','HASAN6'],['ali','Ali','ALI777'],['omar','Omar','OMAR88'],
  ['hamza','Hamza','HAMZA9'],['saad','Saad','SAAD10'],['yusuf','Yusuf','YUSF11'],['ayaan','Ayaan','AYAN12'],
  ['rayyan','Rayyan','RAYY13'],['muhammad','Muhammad','MUHD14'],['zayan','Zayan','ZAYN15'],['adam','Adam','ADAM16'],
  ['isa','Isa','ISAA17'],['talha','Talha','TALH18'],['bilal','Bilal','BILA19'],['faris','Faris','FARI20']
].map(([id,name,code]) => ({ id, name, code }));

function clearSubscriptions() {
  for (const unsubscribe of unsubscribers) {
    try { unsubscribe(); } catch {}
  }
  unsubscribers.clear();
}
function track(unsubscribe) { unsubscribers.add(unsubscribe); return unsubscribe; }
function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timestampToDate(value) { return value?.toDate ? value.toDate() : value ? new Date(value) : null; }
function fmtDate(value) { const date = timestampToDate(value); return date ? date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'; }
function fmtTime(value) { const date = timestampToDate(value); return date ? date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; }
function totalTouches(stats=liveStats) { return stats.reduce((sum,item)=>sum+Number(item.touches||0),0); }
function averageTouches(stats=liveStats) { return Math.round(totalTouches(stats)/Math.max(1,stats.length)); }
function activePlayers() { return liveStats.length || liveSession?.activeIds?.length || 0; }
function brandLockup(compact=false) {
  return `<div class="brandLockup ${compact?'compact':''}"><span class="kixelPlate"><img class="kixelLogo" src="./kixel-logo.svg?v=4" alt="KIXEL"></span><span class="bornAt">BORN AT <img src="./lvfc-logo-white.svg?v=4" alt="LVFC"></span></div>`;
}
function signOutButton() { return '<button class="iconBtn" data-action="logout" aria-label="Sign out">↗</button>'; }
function pkParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return { dateKey:`${parts.year}-${parts.month}-${parts.day}`, minutes:Number(parts.hour)*60+Number(parts.minute) };
}
function pkDate(dateKey,hour,minute) { return new Date(`${dateKey}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+05:00`); }
function windowStatus() {
  const now = pkParts();
  if (now.minutes < START_MINUTES) return { state:'waiting', title:'Not live yet', message:'Today’s player window opens at 4:30 PM Pakistan time.' };
  if (now.minutes < END_MINUTES) return { state:'open', title:'Session window active', message:'Player inputs remain open until 7:00 PM Pakistan time.' };
  return { state:'closed', title:'Today is locked', message:'The session window closed at 7:00 PM Pakistan time.' };
}
function messageBlock() {
  if (!uiMessage) return '';
  const className = uiMessage.startsWith('Error:') ? 'error' : 'success';
  return `<div class="${className}">${escapeHtml(uiMessage)}</div>`;
}
function milestoneCopy(touches) {
  if (!touches || touches % 25 !== 0) return '';
  if (touches === 25) return 'First 25. The picture is forming.';
  if (touches === 50) return '50 touches. Fully involved.';
  if (touches === 100) return '100 touches. Big session energy.';
  return `${touches} touches. Another level reached.`;
}
function lowTouchCount() {
  if (!liveStats.length) return 0;
  const average = averageTouches();
  return liveStats.filter(item=>Number(item.touches||0)<Math.max(5,average*.5)).length;
}
function trendForSession(sessionId) {
  const ended = sessions.filter(session=>session.status==='ended');
  const index = ended.findIndex(session=>session.id===sessionId);
  if (index < 0 || index === ended.length-1) return null;
  const current = Number(sessionFacts[sessionId]?.average||0);
  const previous = Number(sessionFacts[ended[index+1]?.id]?.average||0);
  return previous ? Math.round(((current-previous)/previous)*100) : null;
}

async function loadProfile(user) {
  if (!user) return null;
  const snapshot = await getDoc(doc(db,'users',user.uid));
  return snapshot.exists() ? { uid:user.uid, ...snapshot.data() } : null;
}
async function refreshAuthContext(user) {
  clearSubscriptions();
  currentUser = user;
  currentProfile = await loadProfile(user);
  players=[];sessions=[];liveSession=null;liveStats=[];parentStats=null;parentHistoryStats={};sessionFacts={};
  if (access==='parent') await setupParent();
  else if (access==='coach') await setupStaff('coach');
  else await setupStaff('director');
  render();
}
async function setupParent() {
  if (!currentUser) { await signInAnonymously(auth); return; }
  if (!currentProfile || currentProfile.role!=='parent') return;
  const sessionsQuery = query(collection(db,'sessions'),where('activeIds','array-contains',currentProfile.playerId));
  track(onSnapshot(sessionsQuery,snapshot=>{
    sessions=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    sessions.sort((a,b)=>(timestampToDate(b.endedAt||b.startsAt)||0)-(timestampToDate(a.endedAt||a.startsAt)||0));
    liveSession=sessions.find(session=>session.status==='live')||null;
    subscribeParentStats();
    loadParentHistoryStats().catch(error=>{uiMessage=`Error: ${error.message}`;render();});
    render();
  },error=>{uiMessage=`Error: ${error.message}`;render();}));
}
function subscribeParentStats() {
  for (const unsubscribe of [...unsubscribers].filter(item=>item.__parentStats)) {
    try { unsubscribe(); } catch {}
    unsubscribers.delete(unsubscribe);
  }
  parentStats=null;
  if (!liveSession || !currentProfile) return;
  const unsubscribe=onSnapshot(doc(db,'sessions',liveSession.id,'playerStats',currentProfile.playerId),snapshot=>{
    parentStats=snapshot.exists()?{id:snapshot.id,...snapshot.data()}:null;
    render();
  },error=>{uiMessage=`Error: ${error.message}`;render();});
  unsubscribe.__parentStats=true;
  track(unsubscribe);
}
async function loadParentHistoryStats() {
  if (!currentProfile?.playerId) return;
  const ended=sessions.filter(session=>session.status==='ended').slice(0,3);
  const next={};
  await Promise.all(ended.map(async session=>{
    const snapshot=await getDoc(doc(db,'sessions',session.id,'playerStats',currentProfile.playerId));
    next[session.id]=snapshot.exists()?snapshot.data():null;
  }));
  parentHistoryStats=next;
  render();
}
async function setupStaff(requiredRole) {
  if (!currentUser || !currentProfile) return;
  if (currentProfile.active===false) return;
  if (requiredRole==='coach' && currentProfile.role!=='coach') return;
  if (requiredRole==='director' && currentProfile.role!=='director') return;
  track(onSnapshot(collection(db,'players'),snapshot=>{
    players=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    if (requiredRole==='coach') ensureScheduledSession().catch(()=>{});
    render();
  },error=>{uiMessage=`Error: ${error.message}`;render();}));
  const sessionsQuery=query(collection(db,'sessions'),orderBy('startsAt','desc'),limit(60));
  track(onSnapshot(sessionsQuery,snapshot=>{
    sessions=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    liveSession=sessions.find(session=>session.status==='live')||null;
    subscribeLiveStats();
    loadSessionFacts().catch(error=>{uiMessage=`Error: ${error.message}`;render();});
    if (requiredRole==='coach') ensureScheduledSession().catch(error=>{uiMessage=`Error: ${error.message}`;render();});
    render();
  },error=>{uiMessage=`Error: ${error.message}`;render();}));
}
function subscribeLiveStats() {
  for (const unsubscribe of [...unsubscribers].filter(item=>item.__liveStats)) {
    try { unsubscribe(); } catch {}
    unsubscribers.delete(unsubscribe);
  }
  liveStats=[];
  if (!liveSession) return;
  const unsubscribe=onSnapshot(collection(db,'sessions',liveSession.id,'playerStats'),snapshot=>{
    liveStats=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    liveStats.sort((a,b)=>Number(b.touches||0)-Number(a.touches||0));
    render();
  },error=>{uiMessage=`Error: ${error.message}`;render();});
  unsubscribe.__liveStats=true;
  track(unsubscribe);
}
async function loadSessionFacts() {
  if (!['coach','director'].includes(currentProfile?.role)) return;
  const next={};
  await Promise.all(sessions.slice(0,30).map(async session=>{
    const snapshot=await getDocs(collection(db,'sessions',session.id,'playerStats'));
    const stats=snapshot.docs.map(item=>item.data());
    const total=stats.reduce((sum,item)=>sum+Number(item.touches||0),0);
    next[session.id]={total,average:Math.round(total/Math.max(1,stats.length)),players:stats.length};
  }));
  sessionFacts=next;
  render();
}
async function ensureScheduledSession() {
  if (access!=='coach' || currentProfile?.role!=='coach') return;
  const now=pkParts();
  const sessionId=`daily-${now.dateKey}`;
  const reference=doc(db,'sessions',sessionId);
  const snapshot=await getDoc(reference);
  if (now.minutes>=START_MINUTES && now.minutes<END_MINUTES && !snapshot.exists()) {
    const roster=players.filter(player=>player.active!==false);
    if (!roster.length) return;
    const batch=writeBatch(db);
    batch.set(reference,{
      title:'U6 Daily Development Session',dateKey:now.dateKey,ageGroup:'U6',status:'live',
      startsAt:Timestamp.fromDate(pkDate(now.dateKey,16,30)),endsAt:Timestamp.fromDate(pkDate(now.dateKey,19,0)),
      createdAt:serverTimestamp(),activeIds:roster.map(player=>player.id),autoScheduled:true
    });
    roster.forEach(player=>batch.set(doc(db,'sessions',sessionId,'playerStats',player.id),{
      playerId:player.id,playerName:player.name,touches:0,updatedAt:serverTimestamp(),updatedBy:currentUser.uid
    }));
    await batch.commit();
    uiMessage='Today’s KIXEL session is live.';
  } else if (snapshot.exists() && snapshot.data().status==='live' && now.minutes>=END_MINUTES) {
    await updateDoc(reference,{status:'ended',endedAt:serverTimestamp()});
    uiMessage='Today’s session is locked and saved.';
  }
}
async function pairParent(form) {
  uiMessage='';
  const data=new FormData(form);
  const code=String(data.get('code')||'').trim().toUpperCase();
  const displayName=String(data.get('parent')||'').trim();
  const pairingSnapshot=await getDoc(doc(db,'pairingCodes',code));
  if (!pairingSnapshot.exists() || pairingSnapshot.data().active!==true) throw new Error('That player code is not active.');
  const playerId=pairingSnapshot.data().playerId;
  await setDoc(doc(db,'users',currentUser.uid),{role:'parent',playerId,pairingCode:code,displayName,createdAt:serverTimestamp()});
  currentProfile=await loadProfile(currentUser);
  await setupParent();
}
async function incrementTouch(delta) {
  if (!liveSession || !currentProfile?.playerId) return;
  const reference=doc(db,'sessions',liveSession.id,'playerStats',currentProfile.playerId);
  await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('This player is not active in today’s session.');
    const current=Number(snapshot.data().touches||0);
    const next=Math.max(0,current+delta);
    transaction.update(reference,{touches:next,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
    touchCelebration=delta>0 && next>0 && next%25===0;
  });
  if (touchCelebration) setTimeout(()=>{touchCelebration=false;render();},1800);
}
async function signInStaff(form) {
  const data=new FormData(form);
  await signInWithEmailAndPassword(auth,String(data.get('email')||'').trim(),String(data.get('password')||''));
}
async function initializePilotData() {
  if (currentProfile?.role!=='director') throw new Error('Director access required.');
  const batch=writeBatch(db);
  PILOT_PLAYERS.forEach(item=>{
    batch.set(doc(db,'players',item.id),{name:item.name,ageGroup:'U6',active:true,createdAt:serverTimestamp()},{merge:true});
    batch.set(doc(db,'pairingCodes',item.code),{playerId:item.id,active:true,createdAt:serverTimestamp()},{merge:true});
  });
  await batch.commit();
  uiMessage='The KIXEL pilot roster and pairing codes are ready.';
}
async function startManualSession(form) {
  const data=new FormData(form);
  const activeIds=data.getAll('players');
  if (!activeIds.length) throw new Error('Choose at least one player.');
  const now=new Date();
  const id=`manual-${Date.now()}`;
  const end=new Date(now.getTime()+150*60000);
  const batch=writeBatch(db);
  batch.set(doc(db,'sessions',id),{
    title:String(data.get('title')||'U6 Development Session').trim(),ageGroup:'U6',status:'live',
    startsAt:Timestamp.fromDate(now),endsAt:Timestamp.fromDate(end),createdAt:serverTimestamp(),activeIds,autoScheduled:false
  });
  activeIds.forEach(playerId=>{
    const player=players.find(item=>item.id===playerId);
    batch.set(doc(db,'sessions',id,'playerStats',playerId),{
      playerId,playerName:player?.name||playerId,touches:0,updatedAt:serverTimestamp(),updatedBy:currentUser.uid
    });
  });
  await batch.commit();
  currentTab='live';
  uiMessage='Session live. Parent inputs can begin.';
}
async function endLiveSession() {
  if (!liveSession) return;
  await updateDoc(doc(db,'sessions',liveSession.id),{status:'ended',endedAt:serverTimestamp()});
  uiMessage='Session locked. The development record is saved.';
}

function progressHistoryHtml() {
  const history=sessions.filter(session=>session.status==='ended').slice(0,3);
  if (!history.length) return '<div class="empty compactEmpty">The journey starts with the first completed session.</div>';
  return history.map((session,index)=>{
    const touches=Number(parentHistoryStats[session.id]?.touches||0);
    const previous=Number(parentHistoryStats[history[index+1]?.id]?.touches||0);
    const difference=previous?touches-previous:null;
    return `<div class="historyItem"><span><b>${escapeHtml(session.title)}</b><small>${fmtDate(session.endedAt||session.endsAt)}${difference===null?'':` · ${difference>=0?'+':''}${difference} vs previous`}</small></span><span class="count">${touches}</span></div>`;
  }).join('');
}
function parentLoginView() {
  return `<main class="screen dark kixelEntry"><div class="top">${brandLockup()}<span class="status">FAMILY ACCESS</span></div><p class="ey">PLAY. CAPTURE. GROW.</p><h1>Every player belongs in the picture.</h1><p class="lead">Connect this phone to one player. During live sessions, every touch becomes part of their development story.</p>${messageBlock()}<form class="card entryCard" id="parentLogin"><div class="field"><label>Your name</label><input name="parent" required autocomplete="name"></div><div class="field"><label>Player code</label><input name="code" placeholder="AHMED1" required autocomplete="off" autocapitalize="characters"></div><button class="primary">CONNECT PLAYER</button></form><div class="trustStrip"><span>ONE PLAYER ONLY</span><span>LIVE & SECURE</span><span>REAL PROGRESS</span></div></main>`;
}
function parentView() {
  if (!currentProfile || currentProfile.role!=='parent') return parentLoginView();
  const childName=parentStats?.playerName||currentProfile.playerId;
  const historyHtml=progressHistoryHtml();
  if (!liveSession || !parentStats) {
    const status=windowStatus();
    return `<main class="screen parentHome"><div class="top">${brandLockup(true)}${signOutButton()}</div>${messageBlock()}<section class="playerHero"><span class="miniLabel">PLAYER PULSE</span><h1>${escapeHtml(childName)}</h1><p>Every session adds another piece to the picture.</p></section><div class="empty statusEmpty"><span class="statusOrb ${status.state}"></span><h2>${status.title}</h2><p class="muted">${status.message}</p></div><section class="progressPanel"><div class="sectionHead"><div><p class="ey">RECENT PROGRESS</p><h3>Last three sessions</h3></div><span class="badge">CLOUD SAVED</span></div><div class="list">${historyHtml}</div></section></main>`;
  }
  const touches=Number(parentStats.touches||0);
  const milestone=milestoneCopy(touches);
  return `<main class="screen counter kixelCounter ${touchCelebration?'celebrating':''}"><div class="pixelField" aria-hidden="true"></div><div class="top">${brandLockup(true)}${signOutButton()}</div><div class="center"><p class="ey">PLAYER PULSE · LIVE</p><h2>${escapeHtml(childName)}</h2><p>Tap once for every touch of the ball.</p><span class="liveNote"><span class="dot"></span>Connected to today’s session</span></div>${messageBlock()}${milestone?`<div class="milestone ${touchCelebration?'show':''}"><b>LEVEL REACHED</b><span>${escapeHtml(milestone)}</span></div>`:''}<div class="counterBody"><button class="touch" data-action="touch" aria-label="Log one ball touch"><span class="num">${touches}</span><span class="tap">LOG A TOUCH</span><span class="tapHint">ONE TAP · ONE MOMENT</span></button></div><div class="counterFoot"><button class="ghost" data-action="undo">− UNDO</button><button class="ghost" disabled>LIVE SAVED ✓</button></div><section class="historyPanel"><p class="ey">RECENT PROGRESS</p><div class="list">${historyHtml}</div></section></main>`;
}
function staffLoginView(kind) {
  const coach=kind==='coach';
  return `<main class="screen dark kixelEntry"><div class="top">${brandLockup()}<span class="status">${coach?'COACH':'DIRECTOR'} ACCESS</span></div><p class="ey">${coach?'RUN THE SESSION':'DEVELOPMENT INTELLIGENCE'}</p><h1>${coach?'See involvement while it happens.':'See the development system working.'}</h1><p class="lead">${coach?'Build the group, follow every player live, and lock the session when the work is done.':'Turn sessions into a clear picture of involvement, consistency and players needing attention.'}</p>${messageBlock()}<form class="card entryCard" id="staffLogin"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div><div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div><button class="primary">ENTER KIXEL</button></form></main>`;
}
function wrongRoleView(kind) {
  return `<main class="screen dark kixelEntry"><div class="top">${brandLockup()}</div><div class="card"><p class="ey">ACCESS CHECK</p><h2>${escapeHtml(kind)} profile required.</h2><p>This signed-in account is not assigned to the correct KIXEL role.</p><button class="primary" data-action="logout">SWITCH ACCOUNT</button></div></main>`;
}
function shellHead(label,title) {
  return `<header class="shellHead">${brandLockup(true)}<div class="shellTitle"><small>${escapeHtml(label)}</small><strong>${escapeHtml(title)}</strong></div>${signOutButton()}</header>`;
}
function coachLiveView() {
  if (!liveSession) {
    const status=windowStatus();
    return `<div class="empty statusEmpty"><span class="statusOrb ${status.state}"></span><p class="ey">LIVE DEVELOPMENT</p><h2>${status.title}</h2><p class="muted">${status.message}</p><button class="primary" data-action="ensureSchedule">CHECK TODAY’S WINDOW</button></div>`;
  }
  const average=averageTouches();
  const low=lowTouchCount();
  return `<section class="hero kixelHero"><div class="heroRow"><div><small>SESSION LIVE</small><h2>${escapeHtml(liveSession.title)}</h2><p>${fmtDate(liveSession.startsAt)} · ${fmtTime(liveSession.startsAt)}–${fmtTime(liveSession.endsAt)}</p></div><span class="status live"><span class="dot"></span>UPDATING LIVE</span></div></section><div class="metrics"><div class="metric grass"><b>${totalTouches()}</b><small>TOUCHES</small></div><div class="metric sky"><b>${average}</b><small>AVG / PLAYER</small></div><div class="metric orange"><b>${activePlayers()}</b><small>PLAYERS ACTIVE</small></div><div class="metric pink"><b>${low}</b><small>NEED ATTENTION</small></div></div><div class="sectionHead"><div><p class="ey">PLAYER PULSE</p><h3>Live involvement</h3></div><span class="badge">UPDATING LIVE</span></div><div class="list playerList">${liveStats.map((item,index)=>{
    const touches=Number(item.touches||0);
    const lowFlag=touches<Math.max(5,average*.5);
    const width=Math.max(4,Math.min(100,Math.round((touches/Math.max(1,liveStats[0]?.touches||1))*100)));
    return `<div class="player ${lowFlag?'attention':''}"><div class="playerRank">${String(index+1).padStart(2,'0')}</div><span><b>${escapeHtml(item.playerName||item.playerId)}</b><small>${lowFlag?'Needs more involvement':'In the session'}</small><i style="--pulse:${width}%"></i></span><span class="count">${touches}</span></div>`;
  }).join('')}</div><button class="danger lockButton" data-action="endSession">LOCK SESSION</button>`;
}
function coachSetupView() {
  if (liveSession) return `<div class="notice warn"><b>SESSION ALREADY LIVE</b><p>Lock the current session before building another.</p></div>`;
  return `<p class="ey">BUILD SESSION</p><h2>Choose who is in the picture today.</h2><form id="sessionForm"><div class="field"><label>Session name</label><input name="title" value="U6 Development Session" required></div><div class="tools"><button type="button" data-action="selectAll">SELECT ALL</button><button type="button" data-action="selectNone">CLEAR</button></div><div class="list rosterList">${players.map((player,index)=>`<label class="check"><input type="checkbox" name="players" value="${player.id}" ${index<12?'checked':''}><span><b>${escapeHtml(player.name)}</b><small>${escapeHtml(player.ageGroup||'U6')}</small></span></label>`).join('')}</div><button class="primary launchButton">GO LIVE</button></form><div class="notice scheduleNotice"><b>DAILY WINDOW</b><p>KIXEL opens the scheduled player window from 4:30 PM to 7:00 PM Pakistan time while the coach dashboard is active.</p></div>`;
}
function coachHistoryView() {
  const ended=sessions.filter(session=>session.status==='ended');
  return `<p class="ey">SESSION LIBRARY</p><h2>Every session becomes evidence.</h2><div class="list">${ended.length?ended.map(session=>{
    const fact=sessionFacts[session.id]||{};
    const trend=trendForSession(session.id);
    return `<div class="sessionRow"><span><b>${escapeHtml(session.title)}</b><small>${fmtDate(session.endedAt||session.endsAt)} · ${fact.players||session.activeIds?.length||0} players${trend===null?'':` · ${trend>=0?'+':''}${trend}% avg trend`}</small></span><span class="count">${fact.total||0}</span></div>`;
  }).join(''):'<div class="empty">No locked sessions yet.</div>'}</div>`;
}
function coachView() {
  if (!currentUser || !currentProfile) return staffLoginView('coach');
  if (currentProfile.role!=='coach' || currentProfile.active===false) return wrongRoleView('Coach');
  const title=currentTab==='live'?'Live Development':currentTab==='setup'?'Build Session':'Session Library';
  return `<main class="screen shell kixelShell">${shellHead('KIXEL COACH',title)}${messageBlock()}${currentTab==='live'?coachLiveView():currentTab==='setup'?coachSetupView():coachHistoryView()}<nav class="nav"><button data-tab="live" class="${currentTab==='live'?'active':''}"><span>●</span>LIVE</button><button data-tab="setup" class="${currentTab==='setup'?'active':''}"><span>＋</span>BUILD</button><button data-tab="history" class="${currentTab==='history'?'active':''}"><span>▤</span>HISTORY</button></nav></main>`;
}
function directorOverview() {
  const ended=sessions.filter(session=>session.status==='ended');
  const recent=ended.slice(0,8);
  const savedTouches=ended.reduce((sum,session)=>sum+Number(sessionFacts[session.id]?.total||0),0);
  const playerSessions=ended.reduce((sum,session)=>sum+Number(sessionFacts[session.id]?.players||0),0);
  const average=Math.round(savedTouches/Math.max(1,playerSessions));
  return `<section class="hero intelligenceHero"><div class="heroRow"><div><small>KIXEL INTELLIGENCE</small><h2>${liveSession?'Development is live.':'The system at a glance.'}</h2><p>${liveSession?'Parent inputs are shaping today’s picture in real time.':'Every locked session adds evidence to the development journey.'}</p></div>${liveSession?'<span class="status live"><span class="dot"></span>LIVE</span>':''}</div></section><div class="summaryGrid"><div class="summaryBox grass"><b>${ended.length}</b><span>SESSIONS DELIVERED</span></div><div class="summaryBox sky"><b>${savedTouches}</b><span>PLAYER MOMENTS</span></div><div class="summaryBox orange"><b>${average}</b><span>AVG INVOLVEMENT</span></div><div class="summaryBox pink"><b>${lowTouchCount()}</b><span>LIVE ATTENTION FLAGS</span></div></div><div class="sectionHead"><div><p class="ey">DEVELOPMENT RECORD</p><h3>Recent sessions</h3></div><span class="badge">${players.length} PLAYERS</span></div><div class="list">${recent.length?recent.map(session=>{
    const fact=sessionFacts[session.id]||{};
    const trend=trendForSession(session.id);
    return `<div class="sessionRow"><span><b>${escapeHtml(session.title)}</b><small>${fmtDate(session.endedAt||session.endsAt)} · ${fact.players||0} players${trend===null?'':` · ${trend>=0?'↑':'↓'} ${Math.abs(trend)}%`}</small></span><span class="count">${fact.total||0}</span></div>`;
  }).join(''):'<div class="empty">The intelligence layer begins with the first locked session.</div>'}</div>`;
}
function directorSessions() {
  return `<p class="ey">SESSION INTELLIGENCE</p><h2>See what every session produced.</h2><div class="list">${sessions.length?sessions.map(session=>{
    const fact=sessionFacts[session.id]||{};
    return `<div class="sessionRow"><span><b>${escapeHtml(session.title)}</b><small>${fmtDate(session.startsAt)} · ${session.status==='live'?'LIVE':`${fact.players||0} players · avg ${fact.average||0}`}</small></span><span class="count">${session.status==='live'?totalTouches():fact.total||0}</span></div>`;
  }).join(''):'<div class="empty">No sessions yet.</div>'}</div>`;
}
function directorSetup() {
  return `<p class="ey">KIXEL SYSTEM</p><h2>Prepare the grassroots pilot.</h2><div class="card systemCard"><span class="systemIcon">K</span><div><b>INITIALISE PILOT DATA</b><p>Create 20 sample players and secure family pairing codes in Firestore.</p></div><button class="primary" data-action="initPilot">INITIALISE</button></div><div class="notice scheduleNotice"><b>ADD A COACH</b><p>Create an Email/Password user in Firebase Authentication. Then create <code>users/{uid}</code> in Firestore with <code>role: coach</code>, the coach’s <code>displayName</code>, and <code>active: true</code>.</p></div><div class="originCard"><div>${brandLockup()}</div><p>KIXEL was born at LVFC to make sure no young player disappears inside a team.</p></div>`;
}
function masterView() {
  if (!currentUser || !currentProfile) return staffLoginView('director');
  if (currentProfile.role!=='director' || currentProfile.active===false || currentUser.uid!==DIRECTOR_UID) return wrongRoleView('Director');
  const title=currentTab==='overview'?'Development Intelligence':currentTab==='sessions'?'Session Intelligence':'System';
  return `<main class="screen shell kixelShell">${shellHead('KIXEL DIRECTOR',title)}${messageBlock()}${currentTab==='overview'?directorOverview():currentTab==='sessions'?directorSessions():directorSetup()}<nav class="nav"><button data-tab="overview" class="${currentTab==='overview'?'active':''}"><span>▦</span>OVERVIEW</button><button data-tab="sessions" class="${currentTab==='sessions'?'active':''}"><span>▤</span>SESSIONS</button><button data-tab="setup" class="${currentTab==='setup'?'active':''}"><span>⚙</span>SYSTEM</button></nav></main>`;
}
function render() { app.innerHTML=access==='parent'?parentView():access==='coach'?coachView():masterView(); }

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if (!button) return;
  try {
    uiMessage='';
    if (button.dataset.tab) { currentTab=button.dataset.tab;render();return; }
    const action=button.dataset.action;
    if (action==='logout') { await signOut(auth);return; }
    if (action==='touch') { await incrementTouch(1);return; }
    if (action==='undo') { await incrementTouch(-1);return; }
    if (action==='endSession') { await endLiveSession();return; }
    if (action==='ensureSchedule') { await ensureScheduledSession();render();return; }
    if (action==='initPilot') { await initializePilotData();render();return; }
    if (action==='selectAll') document.querySelectorAll('input[name="players"]').forEach(input=>input.checked=true);
    if (action==='selectNone') document.querySelectorAll('input[name="players"]').forEach(input=>input.checked=false);
  } catch (error) { uiMessage=`Error: ${error.message}`;render(); }
});
document.addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    uiMessage='';
    if (event.target.id==='parentLogin') await pairParent(event.target);
    if (event.target.id==='staffLogin') await signInStaff(event.target);
    if (event.target.id==='sessionForm') await startManualSession(event.target);
    render();
  } catch (error) { uiMessage=`Error: ${error.message}`;render(); }
});

onAuthStateChanged(auth,user=>refreshAuthContext(user).catch(error=>{uiMessage=`Error: ${error.message}`;render();}));
setInterval(()=>{if(access==='coach'&&currentProfile?.role==='coach')ensureScheduledSession().catch(()=>{});},30000);
if ('serviceWorker' in navigator) addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=kixel4'));
