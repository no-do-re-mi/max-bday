(() => {
  'use strict';

  const PRESET_AVATARS = {
    elbow:  'assets/elbow.png',
    venus:  'assets/venus.png',
    hotdog: 'assets/hotdog.png'
  };

  const LOCAL_KEY = 'max-birthday:local-rsvps';
  const RSVPED_KEY = 'max-birthday:rsvped';
  const NAME_KEY = 'max-birthday:name';
  const AVATAR_PX = 256;

  const $ = (id) => document.getElementById(id);

  const el = {
    home:        $('view-home'),
    guests:      $('view-guests'),
    guestGrid:   $('guest-grid'),
    guestCount:  $('guest-count'),
    openRsvp:    $('open-rsvp'),
    rsvpAgain:   $('rsvp-again'),
    already:     $('already-rsvped'),
    actScrim:    $('activity-scrim'),
    actPanel:    $('activity-panel'),
    actAsk:      $('act-ask'),
    actDone:     $('act-done'),
    actName:     $('act-name'),
    actSubmit:   $('act-submit'),
    actError:    $('act-error'),
    actConfirm:  $('act-confirm'),
    actSub:      $('act-sub'),
    actOnward:   $('act-onward'),
    actReopen:   $('activity-reopen'),
    faqTrigger:  $('faq-trigger'),
    faqBody:     $('faq-body'),
    scrim:       $('scrim'),
    panel:       $('panel'),
    step1:       $('step-1'),
    step2:       $('step-2'),
    step3:       $('step-3'),
    goingLabel:  $('going-label'),
    fieldWhy:    $('field-why'),
    name:        $('rsvp-name'),
    phone:       $('rsvp-phone'),
    why:         $('rsvp-why'),
    customFile:  $('custom-file'),
    customPlus:  $('custom-plus'),
    customImg:   $('custom-preview'),
    tileCustom:  $('tile-custom'),
    send:        $('send-it'),
    error:       $('form-error')
  };

  const goingOnly = Array.from(document.querySelectorAll('.going-only'));
  const plusTogs  = Array.from(document.querySelectorAll('[data-plus]'));
  const presetTiles = Array.from(document.querySelectorAll('[data-avatar]'));

  const state = {
    view: 'home',
    open: false,
    step: 1,
    going: null,
    plusOne: null,
    avatar: null,
    customDataUrl: '',
    guests: [],
    // The guest this browser just submitted. Blob listings are eventually
    // consistent, so we keep showing them until the server list catches up —
    // nobody should RSVP and then not find themselves on the list.
    pending: null,
    lastFocus: null
  };

  /* ── guest list ───────────────────────────────────────────── */

  function localGuests() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function rememberLocally(guest) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(localGuests().concat([guest])));
    } catch {
      /* private browsing — the guest still shows for this session */
    }
  }

  /* ── "already rsvp'd" state ───────────────────────────────── */

  function hasRsvped() {
    try {
      return Boolean(JSON.parse(localStorage.getItem(RSVPED_KEY) || 'null'));
    } catch {
      return false;
    }
  }

  function rememberName(name) {
    try { if (name) localStorage.setItem(NAME_KEY, name); } catch { /* private browsing */ }
  }

  function knownName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  }

  function rememberRsvped(going) {
    try {
      localStorage.setItem(RSVPED_KEY, JSON.stringify({ at: Date.now(), going }));
    } catch {
      // Private browsing. The button just stays on "rsvp" — no worse than before.
    }
  }

  // Once this browser has RSVP'd, the hero's call to action is no longer the
  // form — it's the guest list. Applies to declines too: someone who said no
  // shouldn't be invited to say it again.
  function applyRsvpedState() {
    const done = hasRsvped();
    el.openRsvp.textContent = done ? 'see who\u2019s coming' : 'rsvp';
    el.openRsvp.dataset.mode = done ? 'guests' : 'rsvp';
    el.rsvpAgain.hidden = !done;
    // The flag only lives in this browser, so someone who RSVP'd on their
    // phone lands here as a stranger. Let them say so rather than RSVP twice.
    el.already.hidden = done;
  }

  async function loadGuests(fresh = false) {
    try {
      const res = await fetch(fresh ? 'api/guests?fresh=1' : 'api/guests', {
        headers: { accept: 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('guests ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data.guests)) throw new Error('bad payload');
      state.guests = data.guests;
    } catch {
      // no backend yet (or offline): fall back to whatever this browser knows
      state.guests = localGuests();
    }
    renderGuests();
  }

  function avatarSrc(guest) {
    return guest.src || PRESET_AVATARS[guest.avatar] || PRESET_AVATARS.venus;
  }

  function visibleGuests() {
    const list = state.guests.slice();
    const pending = state.pending;
    if (!pending) return list;

    // Trust the server-issued id when we have one; only fall back to matching
    // on name for the offline path, where no id was ever issued.
    const alreadyThere = pending.id
      ? list.some((g) => g.id === pending.id)
      : list.some((g) => g.name === pending.name && g.plusOne === pending.plusOne);
    if (alreadyThere) {
      state.pending = null;
      return list;
    }
    return list.concat([pending]);
  }

  function renderGuests() {
    const list = visibleGuests();
    // Heads, not cards: someone bringing a plus one is two people at the party.
    const heads = list.length + list.filter((g) => g.plusOne).length;
    el.guestCount.textContent = `${heads} in orbit`;
    el.guestGrid.textContent = '';

    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'guests-empty';
      empty.textContent = 'nobody yet. be the first.';
      el.guestGrid.append(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const guest of list) {
      const card = document.createElement('div');
      card.className = 'guest';

      const avatar = document.createElement('div');
      avatar.className = 'guest-avatar';
      const img = document.createElement('img');
      img.src = avatarSrc(guest);
      img.alt = '';
      img.loading = 'lazy';
      avatar.append(img);

      const text = document.createElement('div');
      text.className = 'guest-text';
      const name = document.createElement('span');
      name.className = 'guest-name';
      name.textContent = guest.name;
      const note = document.createElement('span');
      note.className = 'guest-note';
      note.textContent = guest.plusOne ? '+1' : '';
      text.append(name, note);

      card.append(avatar, text);
      frag.append(card);
    }
    el.guestGrid.append(frag);
  }

  /* ── views ────────────────────────────────────────────────── */

  function showView(view) {
    state.view = view;
    el.home.hidden = view !== 'home';
    el.guests.hidden = view !== 'guests';
    window.scrollTo(0, 0);
    if (view === 'guests') loadGuests(Boolean(state.pending));
  }

  /* ── modal ────────────────────────────────────────────────── */

  function showStep(step) {
    state.step = step;
    el.step1.hidden = step !== 1;
    el.step2.hidden = step !== 2;
    el.step3.hidden = step !== 3;
  }

  function resetModal() {
    state.going = null;
    state.plusOne = null;
    state.avatar = null;
    state.customDataUrl = '';
    el.step2.reset();
    el.customFile.value = '';
    el.customImg.hidden = true;
    el.customImg.removeAttribute('src');
    el.customPlus.hidden = false;
    el.tileCustom.classList.remove('is-selected');
    plusTogs.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    presetTiles.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    setError('');
    setBusy(false);
    showStep(1);
  }

  function openModal() {
    state.lastFocus = document.activeElement;
    state.open = true;
    resetModal();
    el.scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    el.panel.querySelector('button, [href], input, textarea')?.focus();
  }

  function closeModal() {
    state.open = false;
    el.scrim.hidden = true;
    document.body.style.overflow = '';
    resetModal();
    if (state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
  }

  function setError(message) {
    el.error.textContent = message;
    el.error.hidden = !message;
  }

  function setBusy(busy) {
    el.send.setAttribute('aria-busy', String(busy));
    el.send.textContent = busy ? 'sending…' : 'send it';
    refreshSubmit();
  }

  function chooseGoing(going) {
    state.going = going;
    el.goingLabel.textContent = going ? 'going' : 'not going';
    goingOnly.forEach((node) => { node.hidden = !going; });
    el.fieldWhy.hidden = going;
    showStep(2);
    refreshSubmit();
    el.name.focus();
  }

  function isReady() {
    const named = el.name.value.trim().length > 0;
    if (state.going !== true) return named;
    return named
      && el.phone.value.trim().length > 0
      && state.plusOne !== null
      && state.avatar !== null;
  }

  function refreshSubmit() {
    el.send.disabled = !isReady() || el.send.getAttribute('aria-busy') === 'true';
  }

  function selectAvatar(kind) {
    state.avatar = kind;
    presetTiles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.avatar === kind)));
    el.tileCustom.classList.toggle('is-selected', kind === 'custom');
    refreshSubmit();
  }

  /* ── avatar upload ────────────────────────────────────────── */

  // Downscale to a square before it ever leaves the browser: keeps the
  // request small and every guest avatar the same size on the grid.
  function squareDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('could not read that file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('that file is not an image'));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = AVATAR_PX;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(
            img,
            (img.width - side) / 2, (img.height - side) / 2, side, side,
            0, 0, AVATAR_PX, AVATAR_PX
          );
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await squareDataUrl(file);
      state.customDataUrl = dataUrl;
      el.customImg.src = dataUrl;
      el.customImg.hidden = false;
      el.customPlus.hidden = true;
      selectAvatar('custom');
    } catch (err) {
      setError(err.message);
    }
  }

  // Returns { path, url }: the path is what the server validates and stores,
  // the url is what the browser renders.
  async function uploadCustomAvatar() {
    const res = await fetch('api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: state.customDataUrl })
    });
    if (!res.ok) throw new Error('upload failed');
    const { path, url } = await res.json();
    if (!path || !url) throw new Error('upload failed');
    return { path, url };
  }

  /* ── submit ───────────────────────────────────────────────── */

  async function submit(event) {
    event.preventDefault();
    if (!isReady()) return;

    const going = state.going === true;
    const name = el.name.value.trim().toLowerCase();
    setBusy(true);
    setError('');

    let src = null;
    let avatarPath = null;
    let delivered = true;
    let id = null;

    try {
      if (going && state.avatar === 'custom') {
        const uploaded = await uploadCustomAvatar();
        avatarPath = uploaded.path;
        src = uploaded.url;
      }

      const res = await fetch('api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          going,
          name,
          phone: going ? el.phone.value.trim() : '',
          why:   going ? '' : el.why.value.trim(),
          plusOne: going ? state.plusOne === true : false,
          avatar: going ? state.avatar : null,
          avatarPath
        })
      });
      if (!res.ok) throw new Error('rsvp ' + res.status);
      id = (await res.json()).id || null;
    } catch {
      // Storage isn't wired up (or the network dropped). Don't lose the
      // RSVP in front of the guest — keep it in this browser and carry on.
      delivered = false;
      if (going && state.avatar === 'custom') src = state.customDataUrl;
    }

    setBusy(false);
    rememberRsvped(going);
    rememberName(name);

    if (going) {
      const guest = { id, name, avatar: state.avatar, src, plusOne: state.plusOne === true };
      if (!delivered) rememberLocally(guest);
      state.pending = guest;
      renderGuests();
      closeModal();
      openActivity({ name, onward: 'guests' });
    } else {
      showStep(3);
    }
  }

  /* ── wiring ───────────────────────────────────────────────── */

  el.openRsvp.addEventListener('click', () => {
    if (hasRsvped()) showView('guests');
    else openModal();
  });
  $('rsvp-again-btn').addEventListener('click', openModal);

  $('already-btn').addEventListener('click', () => {
    rememberRsvped(null);
    applyRsvpedState();
    showView('guests');
  });
  $('modal-close').addEventListener('click', closeModal);
  $('decline-close').addEventListener('click', closeModal);
  $('go-home').addEventListener('click', () => showView('home'));
  $('pick-going').addEventListener('click', () => chooseGoing(true));
  $('pick-not-going').addEventListener('click', () => chooseGoing(false));

  el.step2.addEventListener('submit', submit);
  el.step2.addEventListener('input', refreshSubmit);
  el.customFile.addEventListener('change', handleFile);

  plusTogs.forEach((btn) => btn.addEventListener('click', () => {
    state.plusOne = btn.dataset.plus === 'yes';
    plusTogs.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    refreshSubmit();
  }));

  presetTiles.forEach((btn) => btn.addEventListener('click', () => selectAvatar(btn.dataset.avatar)));

  el.faqTrigger.addEventListener('click', () => {
    const open = el.faqBody.hidden;
    el.faqBody.hidden = !open;
    el.faqTrigger.setAttribute('aria-expanded', String(open));
  });

  el.scrim.addEventListener('mousedown', (e) => { if (e.target === el.scrim) closeModal(); });

  document.addEventListener('keydown', (e) => {
    if (!state.open) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;

    const focusable = el.panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]'
    );
    const visible = Array.from(focusable).filter((n) => n.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0];
    const last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ── structured activity modal ────────────────────────────── */

  const activity = { picked: null, done: false, onward: 'home', lastFocus: null };
  const actTimes = Array.from(document.querySelectorAll('.act-time'));

  function actReady() {
    return activity.picked !== null && el.actName.value.trim().length > 0;
  }

  // The submit label is the hint: it says what's still missing.
  function refreshActivity() {
    const named = el.actName.value.trim().length > 0;
    el.actSubmit.disabled = !actReady() || el.actSubmit.getAttribute('aria-busy') === 'true';
    if (el.actSubmit.getAttribute('aria-busy') === 'true') return;
    el.actSubmit.textContent =
      activity.picked === null ? 'pick a time'
      : !named ? 'add your name'
      : `i\u2019m in from ${activity.picked}pm`;
  }

  function openActivity({ name = '', onward = 'home' } = {}) {
    activity.onward = onward;
    activity.done = false;
    activity.picked = null;
    activity.lastFocus = document.activeElement;
    actTimes.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    el.actName.value = name || knownName();
    el.actError.hidden = true;
    el.actSubmit.removeAttribute('aria-busy');
    el.actAsk.hidden = false;
    el.actDone.hidden = true;
    el.actOnward.textContent = onward === 'guests' ? 'see who\u2019s coming' : 'back to the site';
    el.actScrim.hidden = false;
    el.actReopen.hidden = true;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('act-open');
    refreshActivity();
    // Focus the dialog itself, so the question is announced before the
    // controls rather than dropping straight onto "5pm".
    el.actPanel.focus();
  }

  function closeActivity(goOnward) {
    el.actScrim.hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('act-open');
    // At /activity the hero is the backdrop, so offer a way back in.
    el.actReopen.hidden = !onActivityRoute();
    if (goOnward && activity.onward === 'guests') showView('guests');
    else if (activity.lastFocus instanceof HTMLElement) activity.lastFocus.focus();
  }

  async function sendActivity(skipped) {
    const name = el.actName.value.trim();
    if (!skipped && !actReady()) return;
    if (!name) { el.actName.focus(); return; }

    el.actSubmit.setAttribute('aria-busy', 'true');
    el.actSubmit.textContent = 'sending\u2026';
    el.actSubmit.disabled = true;
    el.actError.hidden = true;

    try {
      const res = await fetch('api/activity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, activityStart: skipped ? null : activity.picked, skipped })
      });
      if (!res.ok) throw new Error('activity ' + res.status);
    } catch {
      el.actSubmit.removeAttribute('aria-busy');
      el.actError.textContent = 'that didn\u2019t send. check your connection and try again.';
      el.actError.hidden = false;
      refreshActivity();
      return;
    }

    rememberName(name);
    el.actSubmit.removeAttribute('aria-busy');
    activity.done = true;
    const first = name.split(/\s+/)[0].toLowerCase();
    // No time is echoed back: the exact hour and place get confirmed by text,
    // so promising "6pm it is" here would be committing to something that
    // hasn't been settled yet.
    el.actConfirm.textContent = skipped
      ? (first ? `see you at 9, ${first}.` : 'see you at 9.')
      : (first ? `lovely, ${first}.` : 'lovely.');
    // Where the activity happens isn't public, so joiners get told they'll be
    // texted. Anyone arriving at 9 is coming to the party address as printed.
    el.actSub.textContent = skipped
      ? 'the party is at 15 sheridan square, from 9pm.'
      : 'noemie will text you with exactly when and where to meet.';
    el.actAsk.hidden = true;
    el.actDone.hidden = false;
    el.actOnward.focus();
  }

  const onActivityRoute = () => /^\/activity\/?$/.test(location.pathname);

  actTimes.forEach((btn) => btn.addEventListener('click', () => {
    activity.picked = Number(btn.dataset.hour);
    actTimes.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    refreshActivity();
  }));

  el.actName.addEventListener('input', refreshActivity);
  el.actSubmit.addEventListener('click', () => sendActivity(false));
  $('act-skip').addEventListener('click', () => sendActivity(true));
  $('act-close').addEventListener('click', () => closeActivity(false));
  el.actOnward.addEventListener('click', () => closeActivity(true));
  $('activity-reopen-btn').addEventListener('click', () => openActivity({ onward: 'home' }));

  el.actScrim.addEventListener('mousedown', (e) => { if (e.target === el.actScrim) closeActivity(false); });

  document.addEventListener('keydown', (e) => {
    if (el.actScrim.hidden) return;
    if (e.key === 'Escape') { closeActivity(false); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(el.actPanel.querySelectorAll('button:not([disabled]), input'))
      .filter((n) => n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // /activity is the homepage with this modal over it — the backdrop the
  // handoff asks for is simply the real hero.
  if (onActivityRoute()) {
    const fromLink = new URLSearchParams(location.search).get('name') || '';
    setTimeout(() => openActivity({ name: fromLink, onward: 'home' }), 600);
  }

  applyRsvpedState();

  // Warm the guest list so "who's coming" lands populated.
  loadGuests();
})();
