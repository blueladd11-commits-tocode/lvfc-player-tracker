import './kixel-app-v4.js?v=lvfc-kixel5';

const appRoot = document.querySelector('#app');

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

function clubLockup(compact = false) {
  return `
    <div class="clubBrand ${compact ? 'compact' : ''}">
      <span class="lvfcPrimary">
        <img src="./lvfc-logo-white.svg?v=lvfc-kixel5" alt="Lahore Virgil Football Club">
        <small>PLAYER DEVELOPMENT</small>
      </span>
      <span class="poweredBy">
        <small>POWERED BY</small>
        <img src="./kixel-logo.svg?v=lvfc-kixel5" alt="KIXEL">
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

  const familyHeading = screen.querySelector('.kixelEntry h1');
  if (familyHeading?.textContent.trim() === 'Every player belongs in the picture.') {
    familyHeading.textContent = 'Welcome to LVFC Player Development.';
  }

  const parentPulse = screen.querySelector('.playerHero .miniLabel');
  if (parentPulse) parentPulse.textContent = 'LVFC PLAYER PULSE';

  const livePulse = screen.querySelector('.center .ey');
  if (livePulse?.textContent.includes('PLAYER PULSE')) {
    livePulse.textContent = 'LVFC PLAYER PULSE · LIVE';
  }

  const coachEy = [...screen.querySelectorAll('.ey')].find(element => element.textContent.trim() === 'LIVE DEVELOPMENT');
  if (coachEy) coachEy.textContent = 'LVFC LIVE DEVELOPMENT';

  const intelligenceEy = screen.querySelector('.intelligenceHero small');
  if (intelligenceEy) intelligenceEy.textContent = 'LVFC DEVELOPMENT INTELLIGENCE';
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

  appRoot.querySelectorAll('.originCard').forEach(card => {
    card.classList.add('serviceProviderCard');
  });

  document.documentElement.dataset.brandArchitecture = 'lvfc-powered-by-kixel';
}

const observer = new MutationObserver(() => applyCoBranding());
if (appRoot) observer.observe(appRoot, { childList: true, subtree: true, characterData: true });
applyCoBranding();
