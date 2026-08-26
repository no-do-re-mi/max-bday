(() => {
  'use strict';

  const PRESET_AVATARS = {
    elbow:  'assets/elbow.png',
    venus:  'assets/venus.png',
    hotdog: 'assets/hotdog.png'
  };

  const LOCAL_KEY = 'max-birthday:local-rsvps';
  const RSVPED_KEY = 'max-birthday:rsvped';
  const AVATAR_PX = 256;

  const $ = (id) => document.getElementById(id);

  const el = {
    home:        $('view-home'),
    guests:      $('view-guests'),
    guestGrid:   $('guest-grid'),
    guestCount:  $('guest-count'),
    openRsvp:    $('open-rsvp'),
    rsvpAgain:   $('rsvp-again'),
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
    el.guestCount.textContent = `${list.length} in orbit`;
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

  async function uploadCustomAvatar() {
    const res = await fetch('api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: state.customDataUrl })
    });
    if (!res.ok) throw new Error('upload failed');
    const { url } = await res.json();
    if (!url) throw new Error('upload failed');
    return url;
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
    let delivered = true;
    let id = null;

    try {
      if (going && state.avatar === 'custom') src = await uploadCustomAvatar();

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
          src
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
    applyRsvpedState();

    if (going) {
      const guest = { id, name, avatar: state.avatar, src, plusOne: state.plusOne === true };
      if (!delivered) rememberLocally(guest);
      state.pending = guest;
      renderGuests();
      closeModal();
      showView('guests');
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

  applyRsvpedState();

  // Warm the guest list so "who's coming" lands populated.
  loadGuests();
})();
