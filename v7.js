(() => {
  const PK_ZONE_7 = 'Asia/Karachi';
  const START_MIN_7 = 16 * 60 + 30;
  const END_MIN_7 = 19 * 60;

  function pkParts7(date = new Date()) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: PK_ZONE_7,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(date)
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value])
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  function pkIso7(date, hour, minute) {
    return new Date(
      `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:00`
    ).toISOString();
  }

  function scheduleMessage7() {
    const now = pkParts7();
    if (now.minutes < START_MIN_7) {
      return "Today's session opens automatically at 4:30 PM Pakistan time.";
    }
    if (now.minutes < END_MIN_7) {
      return "Today's session is live until 7:00 PM Pakistan time.";
    }
    return "Today's session ended automatically at 7:00 PM Pakistan time.";
  }

  function syncScheduledSession7() {
    const now = pkParts7();
    let changed = false;

    state.sessions
      .filter(session => session.status === 'live')
      .forEach(session => {
        const sessionDate =
          session.scheduleDate || pkParts7(new Date(session.startedAt)).date;
        if (
          sessionDate < now.date ||
          (sessionDate === now.date && now.minutes >= END_MIN_7)
        ) {
          session.status = 'ended';
          session.endedAt = pkIso7(sessionDate, 19, 0);
          if (state.liveSessionId === session.id) state.liveSessionId = null;
          changed = true;
        }
      });

    const todayId = `auto-${now.date}`;
    let today = state.sessions.find(session => session.id === todayId);
    const insideWindow = now.minutes >= START_MIN_7 && now.minutes < END_MIN_7;

    if (insideWindow && !today && !live()) {
      const activeIds = PLAYERS.map(item => item.id);
      today = {
        id: todayId,
        title: 'U6 Daily Development Session',
        date: now.date,
        ageGroup: 'U6',
        status: 'live',
        autoScheduled: true,
        scheduleDate: now.date,
        startedAt: pkIso7(now.date, 16, 30),
        endedAt: null,
        activeIds,
        counts: Object.fromEntries(activeIds.map(id => [id, 0]))
      };
      state.sessions.push(today);
      state.liveSessionId = today.id;
      changed = true;
    } else if (insideWindow && today?.status === 'live' && state.liveSessionId !== today.id) {
      state.liveSessionId = today.id;
      changed = true;
    }

    if (changed) persist(false);
    return changed;
  }

  function parentHistory7(child, dark = false) {
    const rows = completed()
      .filter(session => session.activeIds.includes(child.id))
      .slice(0, 3);

    const outerClass = dark ? 'historyPanel' : 'scheduleCard';
    if (!rows.length) {
      return `<div class="${outerClass}"><p class="ey">Previous sessions</p><p class="${dark ? '' : 'muted'}">No completed sessions recorded yet.</p></div>`;
    }

    return `<div class="${outerClass}">
      <p class="ey">Previous 3 sessions</p>
      <div class="historyStrip">
        ${rows
          .map(
            session => `<div class="historyItem">
              <span><b>${session.title}</b><small>${fmtDate(session.endedAt)} · ${duration(session)} min</small></span>
              <span class="historyTouch">${session.counts[child.id] || 0}</span>
            </div>`
          )
          .join('')}
      </div>
    </div>`;
  }

  const extraStyle = document.createElement('style');
  extraStyle.textContent = `
    .historyStrip{display:grid;gap:9px;margin-top:12px}
    .historyItem{background:#fff;border:1px solid var(--l);border-radius:16px;padding:12px;display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center;color:var(--i)}
    .historyItem small{display:block;color:var(--m);margin-top:3px}
    .historyTouch{font-size:20px;font-weight:950;color:var(--r)}
    .historyPanel{margin-top:14px;background:#ffffff12;border:1px solid #ffffff24;border-radius:20px;padding:14px}
    .scheduleCard{margin-top:16px;background:#fff;border:1px solid var(--l);border-radius:18px;padding:15px;text-align:left}
    .liveNote{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:900;color:#c9f4dd}
    .liveNote .dot{animation:lvfcPulse 1.4s infinite}
    @keyframes lvfcPulse{50%{opacity:.35}}
  `;
  document.head.appendChild(extraStyle);

  parentView = function parentViewV7() {
    const parentRecord = JSON.parse(localStorage.getItem(PKEY) || 'null');
    if (!parentRecord) return parentLogin();

    const child = player(parentRecord.playerId);
    const current = live();

    if (!current || !current.activeIds.includes(child.id)) {
      return `<main class="screen">
        <div class="top">${logoCrimson()}<button class="iconBtn" data-action="parentLogout">↗</button></div>
        <span class="status">Parent access</span>
        <div class="empty" style="margin-top:20px">
          <h2>No live session for ${child.name}</h2>
          <p class="muted">${scheduleMessage7()}</p>
        </div>
        ${parentHistory7(child, false)}
      </main>`;
    }

    const count = current.counts[child.id] || 0;
    return `<main class="screen counter">
      <div class="top">${logoWhite()}<button class="back" data-action="parentLogout">↗</button></div>
      <div class="center">
        <p class="ey">${current.title}</p>
        <h2>${child.name}'s ball touches</h2>
        <p>Tap once every time ${child.name} touches the ball.</p>
        <span class="liveNote"><span class="dot"></span>Input updating live</span>
      </div>
      <div class="counterBody">
        <button class="touch" data-action="touch" data-player="${child.id}">
          <span class="num">${count}</span>
          <span class="tap">Record Ball Touch</span>
        </button>
      </div>
      <div class="counterFoot">
        <button class="ghost" data-action="undo" data-player="${child.id}">− Undo</button>
        <button class="ghost" disabled>Autosaved ✓</button>
      </div>
      ${parentHistory7(child, true)}
    </main>`;
  };

  const originalCoachLive7 = coachLive;
  coachLive = function coachLiveV7() {
    if (!live()) {
      return `<div class="empty">
        <h2>No active session</h2>
        <p class="muted">${scheduleMessage7()}</p>
        <button class="primary" data-tab="setup">View daily schedule</button>
      </div>`;
    }
    return originalCoachLive7().replace('Autosaving', 'Updating live');
  };

  coachSetup = function coachSetupV7() {
    const now = pkParts7();
    const today = state.sessions.find(session => session.id === `auto-${now.date}`);
    return `<p class="ey">Automatic schedule</p>
      <h2>Daily session window.</h2>
      <div class="card">
        <div class="factTable">
          <div class="fact"><strong>Automatic start</strong><span>4:30 PM PKT</span></div>
          <div class="fact"><strong>Automatic end & save</strong><span>7:00 PM PKT</span></div>
          <div class="fact"><strong>Default active roster</strong><span>${PLAYERS.length} players</span></div>
          <div class="fact"><strong>Today's status</strong><span>${today?.status === 'live' ? 'LIVE' : today?.status === 'ended' ? 'SAVED' : 'WAITING'}</span></div>
        </div>
      </div>
      <div class="demo"><b>Automatic workflow:</b> opening any parent, coach, or director screen during the session window activates today's session. Any open screen closes and saves it at 7:00 PM Pakistan time.</div>
      ${live() ? '<button class="danger" style="margin-top:14px" data-action="endSession">End Today Early & Save</button>' : ''}`;
  };

  syncScheduledSession7();
  render();
  setInterval(() => {
    syncScheduledSession7();
    render();
  }, 15000);
})();
