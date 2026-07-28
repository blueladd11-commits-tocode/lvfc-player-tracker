import './kixel-app-v4.js?v=mobile-recovery-2';
import { getApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const appRoot = document.querySelector('#app');
const firebase = getApp();
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const access = new URLSearchParams(location.search).get('access') || 'parent';

let signedInUser = null;
let signedInProfile = null;
let reportLoading = false;
let notesLoading = false;

const exactReplacements = new Map([
  ['Every player belongs in the picture.', 'Welcome to LVFC Player Development.'],
  ['Connect this phone to one player. During live sessions, every touch becomes part of their development story.', 'Connect this phone to your LVFC player. During live LVFC sessions, every touch becomes part of their development story.'],
  ['ENTER KIXEL', 'ENTER LVFC'],
  ['KIXEL COACH', 'LVFC COACH CENTRE'],
  ['KIXEL DIRECTOR', 'LVFC PERFORMANCE INTELLIGENCE'],
  ['KIXEL INTELLIGENCE', 'LVFC DEVELOPMENT INTELLIGENCE'],
  ['KIXEL SYSTEM', 'LVFC DEVELOPMENT SYSTEM'],
  ['Today’s KIXEL session is live.', 'Today’s LVFC development session is live.'],
  ['The KIXEL pilot roster and pairing codes are ready.', 'The LVFC pilot roster and family pairing codes are ready.'],
  ['This signed-in account is not assigned to the correct KIXEL role.', 'This signed-in account is not assigned to the correct LVFC staff role.'],
  ['KIXEL opens the scheduled player window from 4:30 PM to 7:00 PM Pakistan time while the coach dashboard is active.', 'The LVFC player development window, powered by KIXEL, opens from 4:30 PM to 7:00 PM Pakistan time while the coach dashboard is active.'],
  ['KIXEL was born at LVFC to make sure no young player disappears inside a team.', 'LVFC owns the player journey. KIXEL provides the technology that makes every player’s development visible.'],
  ['Prepare the grassroots pilot.', 'Prepare the LVFC player-development pilot.'],
  ['The intelligence layer begins with the first locked session.', 'LVFC development intelligence begins with the first locked session.']
]);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[character]));
}
function toDate(value) {
  return value?.toDate ? value.toDate() : value ? new Date(value) : null;
}
function clubLockup(compact = false) {
  return `
    <div class="clubBrand ${compact ? 'compact' : ''}">
      <span class="lvfcPrimary">
        <img src="./lvfc-logo.png?v=mobile-recovery-2" alt="Lahore Virgil Football Club">
        <small>PLAYER DEVELOPMENT</small>
      </span>
      <span class="poweredBy">
        <small>POWERED BY</small>
        <img src="./kixel-logo.png?v=mobile-recovery-2" alt="KIXEL">
      </span>
    </div>`;
}
function replaceTextNodes(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const original = node.nodeValue;
    const trimmed = original.trim();
    if (!trimmed) return;
    let replacement = exactReplacements.get(trimmed);
    if (!replacement) {
      replacement = trimmed
        .replaceAll('KIXEL COACH', 'LVFC COACH CENTRE')
        .replaceAll('KIXEL DIRECTOR', 'LVFC PERFORMANCE INTELLIGENCE')
        .replaceAll('KIXEL INTELLIGENCE', 'LVFC DEVELOPMENT INTELLIGENCE')
        .replaceAll('KIXEL SYSTEM', 'LVFC DEVELOPMENT SYSTEM')
        .replaceAll('ENTER KIXEL', 'ENTER LVFC');
    }
    if (replacement && replacement !== trimmed) {
      const leading = original.match(/^\s*/)?.[0] || '';
      const trailing = original.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${replacement}${trailing}`;
    }
  });
}
function applyRoleLanguage() {
  const screen = appRoot?.querySelector('main');
  if (!screen) return;
  if (screen.classList.contains('kixelEntry')) {
    const status = screen.querySelector('.status');
    if (status?.textContent.trim() === 'FAMILY ACCESS') status.textContent = 'LVFC FAMILY ACCESS';
    if (status?.textContent.trim() === 'COACH ACCESS') status.textContent = 'LVFC COACH ACCESS';
    if (status?.textContent.trim() === 'DIRECTOR ACCESS') status.textContent = 'LVFC DIRECTOR ACCESS';
  }
  const parentPulse = screen.querySelector('.playerHero .miniLabel');
  if (parentPulse) parentPulse.textContent = 'LVFC PLAYER PULSE';
  const livePulse = screen.querySelector('.center .ey');
  if (livePulse?.textContent.includes('PLAYER PULSE')) livePulse.textContent = 'LVFC PLAYER PULSE · LIVE';
  const coachEy = [...screen.querySelectorAll('.ey')].find(element => element.textContent.trim() === 'LIVE DEVELOPMENT');
  if (coachEy) coachEy.textContent = 'LVFC LIVE DEVELOPMENT';
  const intelligenceEy = screen.querySelector('.intelligenceHero small');
  if (intelligenceEy) intelligenceEy.textContent = 'LVFC DEVELOPMENT INTELLIGENCE';
}
async function loadSignedInProfile(user) {
  if (!user) return null;
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  return snapshot.exists() ? { uid:user.uid, ...snapshot.data() } : null;
}
function reportDirection(trend) {
  if (trend === null) return { label:'Baseline building', className:'building', detail:'More sessions will reveal the direction.' };
  if (trend >= 10) return { label:'Improving', className:'improving', detail:`Up ${trend}% from the previous session.` };
  if (trend > -10) return { label:'Steady', className:'steady', detail:`${trend >= 0 ? 'Up' : 'Down'} ${Math.abs(trend)}% from the previous session.` };
  return { label:'Building', className:'building', detail:`Down ${Math.abs(trend)}% from the previous session—one session is not a verdict.` };
}
async function ensureDevelopmentReport() {
  if (access !== 'parent' || !signedInProfile?.playerId || reportLoading) return;
  const screen = appRoot?.querySelector('.parentHome, .kixelCounter');
  if (!screen || screen.querySelector('.developmentReport')) return;
  const insertionTarget = screen.querySelector('.progressPanel, .historyPanel');
  if (!insertionTarget) return;
  reportLoading = true;
  try {
    const sessionsSnapshot = await getDocs(query(collection(db,'sessions'), where('activeIds','array-contains',signedInProfile.playerId)));
    const ended = sessionsSnapshot.docs
      .map(item => ({ id:item.id, ...item.data() }))
      .filter(session => session.status === 'ended')
      .sort((a,b) => (toDate(b.endedAt || b.startsAt) || 0) - (toDate(a.endedAt || a.startsAt) || 0))
      .slice(0,3);
    const records = await Promise.all(ended.map(async session => {
      const snapshot = await getDoc(doc(db,'sessions',session.id,'playerStats',signedInProfile.playerId));
      return snapshot.exists() ? { session, ...snapshot.data() } : null;
    }));
    const valid = records.filter(Boolean);
    const latest = Number(valid[0]?.touches || 0);
    const previous = Number(valid[1]?.touches || 0);
    const average = valid.length ? Math.round(valid.reduce((sum,item)=>sum+Number(item.touches||0),0)/valid.length) : 0;
    const trend = valid.length > 1 && previous > 0 ? Math.round(((latest-previous)/previous)*100) : null;
    const direction = reportDirection(trend);
    const childName = screen.querySelector('.playerHero h1, .center h2')?.textContent.trim() || 'LVFC Player';
    const liveTouches = Number(screen.querySelector('.num')?.textContent || latest);
    const latestNoteRecord = valid.find(item => String(item.coachNote || '').trim());
    const coachNote = latestNoteRecord?.coachNote?.trim() || 'Your LVFC coach can add a personal observation during the session. It will appear here after the session is locked.';
    const report = document.createElement('section');
    report.className = 'developmentReport';
    report.innerHTML = `
      <div class="reportHeader">
        <div><p class="ey">LVFC DEVELOPMENT REPORT</p><h2>${escapeHtml(childName)}</h2></div>
        <span class="reportPowered">POWERED BY KIXEL</span>
      </div>
      <p class="reportIntro">A live picture of involvement—not a judgement of ability.</p>
      <div class="reportMetrics">
        <div class="reportMetric liveMetric"><span>${liveTouches}</span><small>${screen.classList.contains('kixelCounter') ? 'TOUCHES TODAY' : 'LATEST SESSION'}</small></div>
        <div class="reportMetric"><span>${average}</span><small>3-SESSION AVERAGE</small></div>
        <div class="reportMetric trendMetric ${direction.className}"><span>${trend === null ? '—' : `${trend >= 0 ? '+' : ''}${trend}%`}</span><small>SESSION TREND</small></div>
      </div>
      <div class="directionRow"><span class="directionDot ${direction.className}"></span><div><b>${direction.label}</b><small>${direction.detail}</small></div></div>
      <div class="coachObservation"><span>COACH OBSERVATION</span><p>“${escapeHtml(coachNote)}”</p>${latestNoteRecord ? `<small>Added by the LVFC coaching team · ${escapeHtml(latestNoteRecord.session?.title || 'Completed session')}</small>` : '<small>Awaiting the first LVFC coaching note.</small>'}</div>
      <div class="reportFooter"><span>${valid.length}/3 recent sessions captured</span><span>LVFC data · KIXEL technology</span></div>`;
    insertionTarget.insertAdjacentElement('beforebegin', report);
  } catch (error) {
    console.warn('LVFC report unavailable:', error);
  } finally {
    reportLoading = false;
  }
}
async function ensureCoachNotesPanel() {
  if (access !== 'coach' || signedInProfile?.role !== 'coach' || notesLoading) return;
  const screen = appRoot?.querySelector('.kixelShell');
  const playerList = screen?.querySelector('.playerList');
  if (!playerList || screen.querySelector('.coachNotesPanel')) return;
  notesLoading = true;
  try {
    const sessionsSnapshot = await getDocs(query(collection(db,'sessions'), orderBy('startsAt','desc'), limit(10)));
    const liveSession = sessionsSnapshot.docs.map(item=>({id:item.id,...item.data()})).find(session=>session.status==='live');
    if (!liveSession) return;
    const statsSnapshot = await getDocs(collection(db,'sessions',liveSession.id,'playerStats'));
    const stats = statsSnapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.playerName).localeCompare(String(b.playerName)));
    const panel = document.createElement('section');
    panel.className = 'coachNotesPanel';
    panel.dataset.sessionId = liveSession.id;
    panel.innerHTML = `
      <div class="sectionHead"><div><p class="ey">LVFC COACH OBSERVATIONS</p><h3>Add the human context</h3></div><span class="badge">PARENT REPORT</span></div>
      <p class="notesIntro">Save a short, specific observation. It appears in the family’s LVFC Development Report after this session is locked.</p>
      <div class="coachNoteList">${stats.map(player=>`
        <article class="coachNoteCard">
          <div><b>${escapeHtml(player.playerName || player.id)}</b><small>${Number(player.touches || 0)} touches live</small></div>
          <textarea data-player-id="${escapeHtml(player.id)}" maxlength="240" placeholder="Example: More confident receiving the ball and turning into space.">${escapeHtml(player.coachNote || '')}</textarea>
          <button type="button" class="secondary saveNote" data-action="saveCoachNote" data-player-id="${escapeHtml(player.id)}">SAVE OBSERVATION</button>
        </article>`).join('')}</div>`;
    const lockButton = screen.querySelector('.lockButton');
    if (lockButton) lockButton.insertAdjacentElement('beforebegin', panel);
    else playerList.insertAdjacentElement('afterend', panel);
  } catch (error) {
    console.warn('Coach notes unavailable:', error);
  } finally {
    notesLoading = false;
  }
}
function applyCoBranding() {
  if (!appRoot) return;
  appRoot.querySelectorAll('.brandLockup').forEach(lockup => {
    if (lockup.dataset.lvfcCobranded === 'true') return;
    const compact = lockup.classList.contains('compact');
    lockup.innerHTML = clubLockup(compact);
    lockup.dataset.lvfcCobranded = 'true';
  });
  replaceTextNodes(appRoot);
  applyRoleLanguage();
  appRoot.querySelectorAll('.originCard').forEach(card => card.classList.add('serviceProviderCard'));
  document.documentElement.dataset.brandArchitecture = 'lvfc-powered-by-kixel';
  ensureDevelopmentReport();
  ensureCoachNotesPanel();
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action="saveCoachNote"]');
  if (!button) return;
  const panel = button.closest('.coachNotesPanel');
  const playerId = button.dataset.playerId;
  const sessionId = panel?.dataset.sessionId;
  const textarea = panel?.querySelector(`textarea[data-player-id="${CSS.escape(playerId)}"]`);
  const note = textarea?.value.trim() || '';
  if (!sessionId || !playerId) return;
  button.disabled = true;
  button.textContent = 'SAVING…';
  try {
    await updateDoc(doc(db,'sessions',sessionId,'playerStats',playerId), {
      coachNote:note,
      coachNoteUpdatedAt:serverTimestamp(),
      coachNoteUpdatedBy:signedInUser?.uid || null
    });
    button.textContent = 'SAVED ✓';
    setTimeout(()=>{button.disabled=false;button.textContent='SAVE OBSERVATION';},1400);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'TRY AGAIN';
    console.error(error);
  }
});

onAuthStateChanged(auth, async user => {
  signedInUser = user;
  signedInProfile = await loadSignedInProfile(user).catch(()=>null);
  applyCoBranding();
});
const observer = new MutationObserver(() => applyCoBranding());
if (appRoot) observer.observe(appRoot, { childList:true, subtree:true, characterData:true });
applyCoBranding();
