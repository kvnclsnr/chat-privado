// ============================================================
//  js/app.js — Lógica principal y controlador de UI
// ============================================================

const state = {
  rid: null,
  room: null,
  me: null,
  sid: null,
  userId: null,
  memberRef: null,
  unsubMsgs: null,
  unsubMembers: null,
  unsubKick: null,
  members: [],
  membersPanelOpen: false,
  renderedMsgIds: new Set(),
  activeReplyTo: null,
  replyCollapseTimer: null,
  unsubUserStickers: null,
  savedStickers: [],
  stickerPanelOpen: false,
  stickerStudio: {
    sourceImg: null,
    xPct: 50,
    yPct: 50,
    sizePct: 65
  },
  stickerPanelTimeoutId: null,
  pendingJoinNotice: ''
};

const IMAGE_LIMITS = {
  maxInputBytes: 12 * 1024 * 1024,
  maxUploadBytes: 850 * 1024,
  maxDimension: 1600,
  preferredQuality: 0.82
};

const STICKER_LIMITS = {
  maxInputBytes: 12 * 1024 * 1024,
  maxUploadBytes: 420 * 1024,
  outputSize: 512,
  minCropPx: 48,
  recentLimit: 12
};

const SWIPE_REPLY = {
  thresholdPx: 42,
  maxTranslatePx: 62
};
const REPLY_AUTO_COLLAPSE_MS = 3200;
const REPLY_BAND_ANIM_MS = 210;

const ALLOWED_MESSAGE_KEYS = {
  text: ['type', 'sender', 'text', 'ts', 'replyTo'],
  image: ['type', 'sender', 'imageUrl', 'imageMeta', 'ts', 'replyTo'],
  sticker: ['type', 'sender', 'stickerUrl', 'stickerMeta', 'ts', 'replyTo'],
  sys: ['type', 'text', 'ts']
};

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateSessionId() {
  return Math.random().toString(36).slice(2, 12);
}

function generateUserId(name) {
  const clean = String(name || '').trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < clean.length; i++) hash = ((hash << 5) + hash) + clean.charCodeAt(i);
  return `u_${Math.abs(hash).toString(36)}`;
}

async function hashAccessCode(code) {
  const normalized = String(code || '').trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function makeTextPreview(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '(sin texto)';
  return clean.length > 90 ? clean.slice(0, 90) + '…' : clean;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + screenId).classList.add('active');
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4500);
}

function showChatError(message) {
  showError('ch-er', message);
}

function setChatStatus(message) {
  const el = document.getElementById('chat-status');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

function setStickerStatus(message) {
  const el = document.getElementById('sticker-status');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

function setStickerPanelStatus(message, timeoutMs = null) {
  const el = document.getElementById('sticker-panel-status');
  if (!el) return;
  if (state.stickerPanelTimeoutId) {
    clearTimeout(state.stickerPanelTimeoutId);
    state.stickerPanelTimeoutId = null;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
  if (timeoutMs) {
    state.stickerPanelTimeoutId = setTimeout(() => setStickerPanelStatus(''), timeoutMs);
  }
}

function bindIfExists(elementId, eventName, handler) {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn(`[ui] Listener omitido: #${elementId} no existe para "${eventName}"`);
    return null;
  }
  el.addEventListener(eventName, handler);
  return el;
}

function initEventListeners() {
  bindIfExists('btn-create', 'click', () => goTo('create'));
  bindIfExists('btn-join', 'click', () => goTo('join'));
  bindIfExists('back-create', 'click', () => goTo('home'));
  bindIfExists('btn-do-create', 'click', handleCreate);
  bindIfExists('c-mx', 'input', function () {
    const valueEl = document.getElementById('c-mv');
    if (valueEl) valueEl.textContent = this.value;
  });

  bindIfExists('back-join', 'click', () => goTo('home'));
  bindIfExists('btn-do-join', 'click', handleJoin);
  bindIfExists('j-id', 'input', function () {
    const cursor = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(cursor, cursor);
  });

  ['c-me', 'c-nm', 'c-cd'].forEach(id => {
    bindIfExists(id, 'keydown', e => { if (e.key === 'Enter') handleCreate(); });
  });
  ['j-nm', 'j-id', 'j-cd'].forEach(id => {
    bindIfExists(id, 'keydown', e => { if (e.key === 'Enter') handleJoin(); });
  });

  bindIfExists('btn-enter', 'click', enterChat);
  bindIfExists('btn-leave', 'click', leaveChat);
  bindIfExists('sb', 'click', sendMessage);
  bindIfExists('ab', 'click', () => document.getElementById('fi')?.click());
  bindIfExists('fi', 'change', onImageSelected);
  bindIfExists('btn-sticker', 'click', openStickerPanel);
  bindIfExists('sticker-panel-close', 'click', closeStickerPanel);
  bindIfExists('sticker-panel-cancel', 'click', closeStickerPanel);
  bindIfExists('sticker-panel-create', 'click', () => {
    closeStickerPanel();
    openStickerStudio();
  });
  bindIfExists('sticker-close', 'click', closeStickerStudio);
  bindIfExists('sticker-cancel', 'click', closeStickerStudio);
  bindIfExists('sticker-file', 'change', onStickerFileSelected);
  bindIfExists('sticker-file-btn', 'click', () => {
    document.getElementById('sticker-file')?.click();
  });
  bindIfExists('sticker-export', 'click', exportStickerAndSend);
  bindIfExists('sticker-x', 'input', onStickerCropChange);
  bindIfExists('sticker-y', 'input', onStickerCropChange);
  bindIfExists('sticker-size', 'input', onStickerCropChange);
  bindIfExists('mi', 'keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  bindIfExists('mi', 'input', function () {
    autoResizeTextarea(this);
    cancelReplyAutoCollapse();
  });
  bindIfExists('mi', 'focus', cancelReplyAutoCollapse);
  bindIfExists('mi', 'blur', scheduleReplyAutoCollapse);

  bindIfExists('reply-cancel', 'click', clearActiveReply);
  bindIfExists('members-pill', 'click', toggleMembersPanel);
  bindIfExists('members-close', 'click', closeMembersPanel);
  bindIfExists('s-chat', 'click', evt => {
    if (!state.membersPanelOpen) return;
    const panel = document.getElementById('members-panel');
    const pill = document.getElementById('members-pill');
    if (!panel || !pill) return;
    if (panel.contains(evt.target) || pill.contains(evt.target)) return;
    closeMembersPanel();
  });
}

document.addEventListener('DOMContentLoaded', initEventListeners);

async function handleCreate() {
  const myName = document.getElementById('c-me').value.trim();
  const roomName = document.getElementById('c-nm').value.trim();
  const code = document.getElementById('c-cd').value.trim();
  const maxUsers = parseInt(document.getElementById('c-mx').value);

  if (!myName) return showError('c-er', 'Ingresa tu nombre');
  if (!roomName) return showError('c-er', 'Ingresa el nombre de la sala');
  const requiresPass = code.length > 0;

  const roomId = generateRoomId();
  const roomData = {
    name: roomName,
    requiresPass,
    maxUsers,
    createdBy: myName,
    createdAt: Date.now()
  };
  if (requiresPass) roomData.codeHash = await hashAccessCode(code);

  try {
    await DB.createRoom(roomId, roomData);
    await DB.postSystemMessage(roomId, `Sala creada por ${myName}`);
  } catch (err) {
    console.error('Error al crear sala:', err);
    return showError('c-er', 'Error de conexión. Verifica tu configuración de Firebase.');
  }

  state.rid = roomId;
  state.room = roomData;
  state.me = myName;
  state.sid = generateSessionId();
  state.userId = generateUserId(myName);
  state.memberRef = await DB.joinRoom(roomId, state.sid, myName, state.userId);

  document.getElementById('cr-id').textContent = roomId;
  document.getElementById('cr-info').innerHTML = `
    <div class="info-card-row"><span>Sala</span><span>${escapeHtml(roomName)}</span></div>
    <div class="info-card-row"><span>Clave de acceso</span><span>${requiresPass ? escapeHtml(code) : 'Sin clave'}</span></div>
    <div class="info-card-row"><span>Capacidad</span><span>${maxUsers} personas</span></div>`;

  goTo('created');
}

async function handleJoin() {
  const name = document.getElementById('j-nm').value.trim();
  const roomId = document.getElementById('j-id').value.trim().toUpperCase();
  const code = document.getElementById('j-cd').value.trim();

  if (!name) return showError('j-er', 'Ingresa tu nombre');
  if (roomId.length !== 6) return showError('j-er', 'El código de sala tiene 6 caracteres');

  let room;
  try {
    room = await DB.getRoom(roomId);
  } catch (err) {
    console.error('Error al obtener sala:', err);
    return showError('j-er', 'Error de conexión. Verifica tu configuración de Firebase.');
  }

  if (!room) return showError('j-er', 'Sala no encontrada — verifica el ID');

  const requiresPass = room.requiresPass === true
    || (room.requiresPass === undefined && (typeof room.codeHash === 'string' || typeof room.code === 'string'));

  if (requiresPass) {
    if (!code) return showError('j-er', 'Esta sala requiere contraseña');
    const incomingCodeHash = await hashAccessCode(code);
    if (room.codeHash && room.codeHash !== incomingCodeHash) return showError('j-er', 'Código de acceso incorrecto');
    if (!room.codeHash && room.code && room.code !== code) return showError('j-er', 'Código de acceso incorrecto');
  }

  const count = await DB.getMemberCount(roomId);
  if (count >= room.maxUsers) return showError('j-er', `Sala llena (${count}/${room.maxUsers} usuarios)`);

  if (await DB.isNameTaken(roomId, name)) return showError('j-er', 'Ese nombre ya está en uso en esta sala');

  const userKey = generateUserId(name);
  let banState = null;
  try {
    banState = await DB.getBan(roomId, userKey);
  } catch (err) {
    const code = String(err?.code || '').toLowerCase();
    const message = String(err?.message || '').toLowerCase();
    const isPermissionDenied = code.includes('permission_denied') || message.includes('permission_denied');
    if (isPermissionDenied) {
      console.warn('[join] No se pudo verificar ban por permisos. Continuando sin ban temporal.', err);
      state.pendingJoinNotice = 'Aviso: no se pudo validar estado de ban por permisos. Se aplicará validación al actualizar el estado.';
    } else {
      console.error('[join] Error al verificar ban:', err);
      return showError('j-er', 'No se pudo validar el estado de ban. Intenta de nuevo.');
    }
  }

  if (banState && typeof banState === 'object') {
    const reason = String(banState.reason || '').trim();
    const reasonSuffix = reason ? ` Motivo: ${reason}` : '';
    return showError('j-er', `No puedes entrar: estás baneado de esta sala.${reasonSuffix}`);
  }

  state.rid = roomId;
  state.room = room;
  state.me = name;
  state.sid = generateSessionId();
  state.userId = userKey;

  try {
    state.memberRef = await DB.joinRoom(roomId, state.sid, name, state.userId);
  } catch (err) {
    console.error('[join] Error al unirse a la sala:', err);
    return showError('j-er', 'No se pudo completar el ingreso a la sala. Intenta nuevamente.');
  }

  try {
    await DB.postSystemMessage(roomId, `${name} se unió`);
  } catch (err) {
    console.error('[join] Error al publicar mensaje de sistema:', err);
    showError('j-er', 'Entraste a la sala, pero no se pudo publicar el mensaje de sistema.');
  }

  enterChat();
}

function enterChat() {
  document.getElementById('ch-nm').textContent = state.room.name;
  document.getElementById('ch-id').textContent = state.rid;
  document.getElementById('ch-me').textContent = 'Tú: ' + state.me;

  document.getElementById('msgs').innerHTML = '';
  state.renderedMsgIds = new Set();
  clearActiveReply();
  setChatStatus('');

  goTo('chat');

  if (state.pendingJoinNotice) {
    setChatStatus(state.pendingJoinNotice);
    setTimeout(() => setChatStatus(''), 6000);
    state.pendingJoinNotice = '';
  }

  state.unsubMsgs = DB.onMessages(state.rid, renderMessages);
  state.unsubMembers = DB.onMembers(state.rid, members => {
    state.members = members;
    document.getElementById('ch-cnt').textContent = members.length;
    renderMembersPanel();
  });
  state.unsubKick = DB.onKickState(state.rid, state.sid, kickedState => {
    if (!kickedState) return;
    const kickedBy = String(kickedState.kickedBy || 'moderador');
    forceLeaveFromKick(`Has sido expulsado de la sala por ${kickedBy}.`);
  });
  if (state.userId) {
    state.unsubUserStickers = DB.onUserStickers(state.userId, stickers => {
      state.savedStickers = stickers.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      renderSavedStickerGrid();
    });
  }
}

async function leaveChat(options = {}) {
  const skipSystemMessage = options.skipSystemMessage === true;
  if (state.unsubMsgs) { state.unsubMsgs(); state.unsubMsgs = null; }
  if (state.unsubMembers) { state.unsubMembers(); state.unsubMembers = null; }
  if (state.unsubKick) { state.unsubKick(); state.unsubKick = null; }
  if (state.unsubUserStickers) { state.unsubUserStickers(); state.unsubUserStickers = null; }

  if (state.rid && state.sid) {
    try {
      if (state.memberRef) await state.memberRef.onDisconnect().cancel();
      if (!skipSystemMessage) await DB.postSystemMessage(state.rid, `${state.me} salió`);
      await DB.leaveRoom(state.rid, state.sid);
    } catch (err) {
      console.error('Error al salir:', err);
    }
  }

  state.rid = null;
  state.room = null;
  state.me = null;
  state.sid = null;
  state.userId = null;
  state.memberRef = null;
  state.activeReplyTo = null;
  state.members = [];
  state.membersPanelOpen = false;
  state.savedStickers = [];
  state.stickerPanelOpen = false;

  document.getElementById('msgs').innerHTML = '';
  setChatStatus('');
  closeMembersPanel();
  closeStickerPanel();
  goTo('home');
}

function isRoomCreator() {
  return String(state.me || '').trim() !== '' && String(state.me || '').trim() === String(state.room?.createdBy || '').trim();
}

async function handleKickMember(member) {
  if (!member || !member.sessionId) return;
  if (!isRoomCreator()) return;
  if (member.sessionId === state.sid) return;

  const targetName = String(member.name || 'usuario').trim() || 'usuario';
  const confirmed = window.confirm(`¿Sacar a ${targetName} de la sala?`);
  if (!confirmed) return;

  try {
    await DB.kickMember(state.rid, member.sessionId, {
      kickedAt: Date.now(),
      kickedBy: state.me,
      kickedBySession: state.sid,
      targetName
    });
    await DB.postSystemMessage(state.rid, `${targetName} fue expulsado por ${state.me}`);
  } catch (err) {
    console.error('Error al expulsar usuario:', err);
    showChatError('No se pudo expulsar al usuario. Intenta de nuevo.');
  }
}

async function handleBanMember(member) {
  if (!member || !member.sessionId || !member.userKey) return;
  if (!isRoomCreator()) return;
  if (member.sessionId === state.sid) return;

  const targetName = String(member.name || 'usuario').trim() || 'usuario';
  const reasonInput = window.prompt(`Motivo del baneo para ${targetName} (opcional):`, '');
  if (reasonInput === null) return;
  const reason = String(reasonInput).trim().slice(0, 140);
  const confirmed = window.confirm(`¿Banear a ${targetName} de la sala? No podrá volver a entrar.`);
  if (!confirmed) return;

  try {
    await DB.banMember(
      state.rid,
      member.sessionId,
      member.userKey,
      {
        bannedAt: Date.now(),
        bannedBy: state.me,
        bannedBySession: state.sid,
        targetName,
        ...(reason ? { reason } : {})
      },
      {
        kickedAt: Date.now(),
        kickedBy: state.me,
        kickedBySession: state.sid,
        targetName
      }
    );
    const reasonSuffix = reason ? ` (motivo: ${reason})` : '';
    await DB.postSystemMessage(state.rid, `${targetName} fue baneado por ${state.me}${reasonSuffix}`);
  } catch (err) {
    console.error('Error al banear usuario:', err);
    showChatError('No se pudo banear al usuario. Intenta de nuevo.');
  }
}

function forceLeaveFromKick(message) {
  window.alert(message);
  leaveChat({ skipSystemMessage: true });
}

function toggleMembersPanel() {
  if (state.membersPanelOpen) {
    closeMembersPanel();
    return;
  }
  state.membersPanelOpen = true;
  const panel = document.getElementById('members-panel');
  const pill = document.getElementById('members-pill');
  panel.hidden = false;
  pill.classList.add('is-open');
  pill.setAttribute('aria-expanded', 'true');
  renderMembersPanel();
}

function closeMembersPanel() {
  state.membersPanelOpen = false;
  const panel = document.getElementById('members-panel');
  const pill = document.getElementById('members-pill');
  panel.hidden = true;
  pill.classList.remove('is-open');
  pill.setAttribute('aria-expanded', 'false');
}

function renderMembersPanel() {
  const list = document.getElementById('members-list');
  const creator = String(state.room?.createdBy || '').trim();
  const canModerate = isRoomCreator();
  list.innerHTML = '';

  state.members
    .slice()
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .forEach(member => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.dataset.sessionId = member.sessionId || '';

      const nameWrap = document.createElement('div');
      nameWrap.className = 'member-name-wrap';

      const dot = document.createElement('span');
      dot.className = 'member-online-dot';
      dot.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'member-name';
      name.textContent = member.name || 'Usuario';

      nameWrap.appendChild(dot);
      nameWrap.appendChild(name);

      row.appendChild(nameWrap);

      if ((member.name || '').trim() === creator) {
        const badge = document.createElement('span');
        badge.className = 'member-creator-tag';
        badge.textContent = 'Creador';
        row.appendChild(badge);
      }

      if (canModerate && member.sessionId !== state.sid) {
        const actions = document.createElement('div');
        actions.className = 'member-actions';

        const kickBtn = document.createElement('button');
        kickBtn.className = 'member-kick-btn';
        kickBtn.type = 'button';
        kickBtn.textContent = 'Sacar';
        kickBtn.addEventListener('click', evt => {
          evt.stopPropagation();
          handleKickMember(member);
        });
        actions.appendChild(kickBtn);

        const banBtn = document.createElement('button');
        banBtn.className = 'member-ban-btn';
        banBtn.type = 'button';
        banBtn.textContent = 'Banear';
        if (!member.userKey) {
          banBtn.disabled = true;
          banBtn.title = 'No disponible para este miembro';
        }
        banBtn.addEventListener('click', evt => {
          evt.stopPropagation();
          handleBanMember(member);
        });
        actions.appendChild(banBtn);

        row.appendChild(actions);
      }

      list.appendChild(row);
    });
}

function renderMessages(msgs) {
  const container = document.getElementById('msgs');
  const wasAtBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 80;
  let addedCount = 0;

  msgs.forEach(msg => {
    if (state.renderedMsgIds.has(msg.id)) return;
    state.renderedMsgIds.add(msg.id);

    const el = document.createElement('div');

    if (msg.type === 'sys') {
      el.className = 'msg-sys';
      el.textContent = msg.text;

    } else if (msg.type === 'image') {
      renderImageMessage(el, msg);

    } else if (msg.type === 'sticker') {
      renderStickerMessage(el, msg);

    } else {
      renderTextMessage(el, msg);
    }

    container.appendChild(el);
    addedCount++;
  });

  if (addedCount > 0 && wasAtBottom) container.scrollTop = container.scrollHeight;
}

function renderTextMessage(container, msg) {
  const isMine = msg.sender === state.me;
  const shell = buildReplyShell(container, msg, isMine);
  renderReplyQuote(shell.body, msg.replyTo);
  const bubble = document.createElement('div');
  bubble.className = isMine ? 'bubble-me' : 'bubble-other';
  bubble.innerHTML = escapeHtml(msg.text || '');

  shell.body.appendChild(bubble);
  shell.body.appendChild(makeTimeNode(msg.ts, isMine));
  shell.body.appendChild(shell.replyBtn);
}

function renderImageMessage(container, msg) {
  const isMine = msg.sender === state.me;
  const imageUrl = String(msg.imageUrl || '');
  if (!/^https?:\/\//i.test(imageUrl)) return;

  const shell = buildReplyShell(container, msg, isMine);
  renderReplyQuote(shell.body, msg.replyTo);
  const btn = document.createElement('button');
  btn.className = `${isMine ? 'bubble-me' : 'bubble-other'} bubble-image img-btn`;
  btn.setAttribute('data-img', encodeURIComponent(imageUrl));

  const img = document.createElement('img');
  img.className = 'chat-img';
  img.src = imageUrl;
  img.alt = `Imagen enviada por ${msg.sender || 'usuario'}`;
  img.loading = 'lazy';
  btn.appendChild(img);

  shell.body.appendChild(btn);
  shell.body.appendChild(makeTimeNode(msg.ts, isMine));
  shell.body.appendChild(shell.replyBtn);
}

function renderStickerMessage(container, msg) {
  const isMine = msg.sender === state.me;
  const stickerUrl = String(msg.stickerUrl || '');
  if (!/^https?:\/\//i.test(stickerUrl)) return;

  const shell = buildReplyShell(container, msg, isMine, true);
  renderReplyQuote(shell.body, msg.replyTo);
  const wrap = document.createElement('div');
  wrap.className = 'sticker-wrap';

  const btn = document.createElement('button');
  btn.className = 'sticker-btn img-btn';
  btn.setAttribute('data-img', encodeURIComponent(stickerUrl));
  btn.setAttribute('data-sticker-url', encodeURIComponent(stickerUrl));
  btn.setAttribute('data-sticker-sender', msg.sender || '');
  btn.setAttribute('data-sticker-msgid', msg.id || '');
  btn.setAttribute('data-sticker-mine', isMine ? '1' : '0');
  btn.setAttribute('data-sticker-meta', encodeURIComponent(JSON.stringify(msg.stickerMeta || {})));

  const img = document.createElement('img');
  img.className = 'chat-sticker';
  img.src = stickerUrl;
  img.alt = `Sticker de ${msg.sender || 'usuario'}`;
  img.loading = 'lazy';
  btn.appendChild(img);

  wrap.appendChild(btn);
  shell.body.appendChild(wrap);
  shell.body.appendChild(makeTimeNode(msg.ts, isMine));
  shell.body.appendChild(shell.replyBtn);
}

function renderReplyQuote(body, replyTo) {
  if (!replyTo || typeof replyTo !== 'object') return;
  const sender = String(replyTo.sender || '').trim();
  const preview = String(replyTo.textPreview || '').trim();
  if (!sender && !preview) return;

  const quote = document.createElement('div');
  quote.className = 'reply-quote';

  const senderEl = document.createElement('div');
  senderEl.className = 'reply-quote-sender';
  senderEl.textContent = sender || 'Usuario';

  const previewEl = document.createElement('div');
  previewEl.className = 'reply-quote-text';
  previewEl.textContent = preview || '(sin vista previa)';

  quote.appendChild(senderEl);
  quote.appendChild(previewEl);
  body.appendChild(quote);
}

function buildReplyShell(container, msg, isMine, extraStickerClass = false) {
  container.className = `${isMine ? 'msg-row-me' : 'msg-row-other'} msg-row${extraStickerClass ? ' msg-row-sticker' : ''}`;

  const content = document.createElement('div');
  content.className = 'msg-content';
  const swipeTrack = document.createElement('div');
  swipeTrack.className = 'msg-swipe-track';
  swipeTrack.dataset.swipeable = '1';

  if (!isMine) {
    const senderEl = document.createElement('div');
    senderEl.className = 'msg-sender';
    senderEl.textContent = msg.sender || 'Usuario';
    swipeTrack.appendChild(senderEl);
  }

  const body = document.createElement('div');
  body.className = `msg-body ${isMine ? 'msg-body-me' : 'msg-body-other'}`;
  swipeTrack.appendChild(body);
  content.appendChild(swipeTrack);

  const replyBtn = createReplyButton(msg, isMine);
  container.appendChild(content);

  attachSwipeReply(swipeTrack, msg);
  return { content, body, replyBtn };
}

function createReplyButton(msg, isMine) {
  const btn = document.createElement('button');
  btn.className = `msg-reply-icon ${isMine ? 'msg-reply-icon-me' : 'msg-reply-icon-other'}`;
  btn.type = 'button';
  btn.setAttribute('aria-label', `Responder a ${msg.sender || 'mensaje'}`);
  btn.title = 'Responder';
  btn.innerHTML = `
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M7.2 5.2L2.4 10l4.8 4.8v-3h3.2c2.7 0 5 1.1 7.2 3.5-.5-5-3.3-7.5-8-7.5H7.2v-2.6z" fill="currentColor"></path>
    </svg>`;
  btn.addEventListener('click', () => setActiveReplyFromMessage(msg));
  return btn;
}

function makeTimeNode(ts, isMine) {
  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(ts);
  if (isMine) time.classList.add('msg-time-me');
  return time;
}

function attachSwipeReply(targetEl, msg) {
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let tracking = false;
  let pointerId = null;
  let consumed = false;

  targetEl.addEventListener('pointerdown', evt => {
    if (evt.pointerType === 'mouse') return;
    tracking = true;
    consumed = false;
    pointerId = evt.pointerId;
    startX = evt.clientX;
    startY = evt.clientY;
    translateX = 0;
    targetEl.style.transition = '';
  });

  targetEl.addEventListener('pointermove', evt => {
    if (!tracking || evt.pointerId !== pointerId) return;
    const dx = evt.clientX - startX;
    const dy = evt.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 9) {
      tracking = false;
      resetSwipeTransform(targetEl);
      return;
    }
    translateX = Math.max(0, Math.min(SWIPE_REPLY.maxTranslatePx, dx));
    if (translateX > 0) {
      consumed = true;
      targetEl.style.transform = `translateX(${translateX}px)`;
    }
  });

  function finishSwipe() {
    if (tracking && translateX >= SWIPE_REPLY.thresholdPx) {
      setActiveReplyFromMessage(msg);
      if (navigator.vibrate) navigator.vibrate(10);
    }
    tracking = false;
    pointerId = null;
    resetSwipeTransform(targetEl);
  }

  targetEl.addEventListener('pointerup', finishSwipe);
  targetEl.addEventListener('pointercancel', finishSwipe);
  targetEl.addEventListener('click', evt => {
    if (consumed) evt.stopPropagation();
    consumed = false;
  }, true);
}

function resetSwipeTransform(targetEl) {
  targetEl.style.transition = 'transform 130ms ease-out';
  targetEl.style.transform = 'translateX(0px)';
  setTimeout(() => { targetEl.style.transition = ''; }, 150);
}

function setActiveReplyFromMessage(msg) {
  if (!msg || msg.type === 'sys' || !msg.id) return;
  cancelReplyAutoCollapse();
  const preview = msg.type === 'sticker' ? '[sticker]' : (msg.type === 'image' ? '[imagen]' : makeTextPreview(msg.text));
  state.activeReplyTo = { id: msg.id, sender: msg.sender || 'Usuario', textPreview: preview };
  renderReplyBand();
  document.getElementById('mi').focus();
}

function clearActiveReply() {
  cancelReplyAutoCollapse();
  state.activeReplyTo = null;
  renderReplyBand();
}

function renderReplyBand() {
  const band = document.getElementById('reply-band');
  const preview = document.getElementById('reply-preview');
  const clearHideTimer = () => {
    if (band._hideTimer) {
      clearTimeout(band._hideTimer);
      band._hideTimer = null;
    }
  };

  if (!state.activeReplyTo) {
    preview.textContent = '';
    if (band.hidden) return;
    clearHideTimer();
    band.classList.remove('is-visible');
    band._hideTimer = setTimeout(() => {
      band.hidden = true;
      band._hideTimer = null;
    }, REPLY_BAND_ANIM_MS);
    return;
  }

  clearHideTimer();
  preview.textContent = `↩︎ @${state.activeReplyTo.sender} · ${state.activeReplyTo.textPreview}`;
  if (!band.hidden && band.classList.contains('is-visible')) return;
  band.hidden = false;
  requestAnimationFrame(() => {
    band.classList.add('is-visible');
  });
}

function scheduleReplyAutoCollapse() {
  cancelReplyAutoCollapse();
  if (!state.activeReplyTo) return;
  const input = document.getElementById('mi');
  if (!input || input.value.trim()) return;
  state.replyCollapseTimer = setTimeout(() => {
    const currentInput = document.getElementById('mi');
    if (!currentInput || currentInput.value.trim()) return;
    clearActiveReply();
  }, REPLY_AUTO_COLLAPSE_MS);
}

function cancelReplyAutoCollapse() {
  if (!state.replyCollapseTimer) return;
  clearTimeout(state.replyCollapseTimer);
  state.replyCollapseTimer = null;
}

function validateOutgoingMessage(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('Payload inválido');
  const allowed = ALLOWED_MESSAGE_KEYS[msg.type];
  if (!allowed) throw new Error('Tipo de mensaje inválido');

  const keys = Object.keys(msg);
  if (keys.some(k => !allowed.includes(k))) throw new Error('Campos no esperados en payload');

  function validateReplyTo(replyTo) {
    if (!replyTo) return;
    const rt = replyTo;
    if (typeof rt !== 'object' || typeof rt.id !== 'string' || typeof rt.sender !== 'string' || typeof rt.textPreview !== 'string') {
      throw new Error('replyTo inválido');
    }
    if (rt.id.length > 120 || rt.sender.length > 40 || rt.textPreview.length > 120) throw new Error('replyTo excede límites');
  }

  if (msg.type === 'text') {
    if (!msg.sender || typeof msg.sender !== 'string' || msg.sender.length > 24) throw new Error('Remitente inválido');
    if (!msg.text || typeof msg.text !== 'string' || msg.text.length > 1800) throw new Error('Texto inválido');
    validateReplyTo(msg.replyTo);
  }

  if (msg.type === 'image') {
    if (!/^https?:\/\//i.test(msg.imageUrl || '')) throw new Error('URL de imagen inválida');
    const m = msg.imageMeta || {};
    if (!m.w || !m.h || !m.size || !m.mime) throw new Error('Meta de imagen incompleta');
    if (m.size > IMAGE_LIMITS.maxUploadBytes * 1.5) throw new Error('Imagen excede límite');
    validateReplyTo(msg.replyTo);
  }

  if (msg.type === 'sticker') {
    if (!/^https?:\/\//i.test(msg.stickerUrl || '')) throw new Error('URL de sticker inválida');
    const m = msg.stickerMeta || {};
    if (!m.w || !m.h || !m.size || !m.mime) throw new Error('Meta de sticker incompleta');
    if (m.size > STICKER_LIMITS.maxUploadBytes * 1.6) throw new Error('Sticker excede límite');
    if (m.w > 1024 || m.h > 1024) throw new Error('Sticker excede dimensiones permitidas');
    validateReplyTo(msg.replyTo);
  }

  if (typeof msg.ts !== 'number' || msg.ts < 1700000000000 || msg.ts > Date.now() + 2 * 60 * 1000) {
    throw new Error('Timestamp inválido');
  }
}

async function sendMessage() {
  const input = document.getElementById('mi');
  const text = input.value.trim();
  if (!text || !state.rid) return;

  input.value = '';
  autoResizeTextarea(input);

  try {
    const msg = {
      type: 'text',
      sender: state.me,
      text,
      ts: Date.now()
    };

    if (state.activeReplyTo) {
      msg.replyTo = {
        id: state.activeReplyTo.id,
        sender: state.activeReplyTo.sender,
        textPreview: state.activeReplyTo.textPreview
      };
    }

    validateOutgoingMessage(msg);
    await DB.sendMessage(state.rid, msg);
    clearActiveReply();
  } catch (err) {
    console.error('Error al enviar mensaje:', err);
    showChatError('No se pudo enviar el mensaje.');
  }
}

async function onImageSelected(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || !state.rid) return;

  if (!file.type || !file.type.startsWith('image/')) return showChatError('Solo se permiten archivos de imagen.');
  if (file.size > IMAGE_LIMITS.maxInputBytes) return showChatError('Imagen demasiado grande. Máximo: 12 MB.');

  const attachBtn = document.getElementById('ab');
  attachBtn.disabled = true;
  attachBtn.textContent = '⏳';
  setChatStatus('Subiendo imagen: comprimiendo…');

  try {
    const packed = await compressImage(file, IMAGE_LIMITS);
    if (packed.strategy === 'fallback') {
      setChatStatus('Subiendo imagen: compresión reforzada aplicada…');
    }
    if (packed.blob.size > IMAGE_LIMITS.maxUploadBytes * 1.4) throw new Error('No se redujo suficiente.');

    const messageId = DB.createMessageId(state.rid);
    setChatStatus('Subiendo imagen: enviando a Storage…');
    const upload = await DB.uploadRoomImage(state.rid, messageId, packed.blob, packed.mime);

    setChatStatus('Subiendo imagen: creando mensaje…');
    const msg = {
      type: 'image',
      imageUrl: upload.downloadURL,
      imageMeta: { w: packed.width, h: packed.height, size: packed.blob.size, mime: packed.mime },
      sender: state.me,
      ts: Date.now()
    };
    if (state.activeReplyTo) msg.replyTo = { ...state.activeReplyTo };

    validateOutgoingMessage(msg);
    await DB.sendMessageWithId(state.rid, messageId, msg);
    clearActiveReply();
    setChatStatus('Imagen enviada.');
    setTimeout(() => setChatStatus(''), 1400);
  } catch (err) {
    console.error('Error al subir imagen:', err);
    showChatError(`No se pudo enviar la imagen: ${err.message || 'error desconocido'}.`);
    setChatStatus('');
  } finally {
    attachBtn.disabled = false;
    attachBtn.textContent = '📎';
  }
}

function openStickerStudio() {
  const modal = document.getElementById('sticker-studio');
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('open'));
  setStickerStatus('Selecciona una imagen para comenzar.');
  renderStickerPreview();
}

function openStickerPanel() {
  const modal = document.getElementById('sticker-panel');
  modal.hidden = false;
  state.stickerPanelOpen = true;
  requestAnimationFrame(() => modal.classList.add('open'));
  renderSavedStickerGrid();
  setStickerPanelStatus('');
}

function closeStickerPanel() {
  const modal = document.getElementById('sticker-panel');
  if (!modal) return;
  state.stickerPanelOpen = false;
  setStickerPanelStatus('');
  modal.classList.remove('open');
  setTimeout(() => { modal.hidden = true; }, 140);
}

function renderSavedStickerGrid() {
  const grid = document.getElementById('saved-stickers-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!state.savedStickers.length) {
    const empty = document.createElement('div');
    empty.className = 'saved-sticker-empty';
    empty.textContent = 'Aún no tienes stickers guardados.';
    grid.appendChild(empty);
    return;
  }

  state.savedStickers.forEach(item => {
    if (!item.stickerUrl) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'saved-sticker-item';
    btn.title = 'Enviar sticker';
    btn.addEventListener('click', () => sendSavedSticker(item));

    const img = document.createElement('img');
    img.src = item.stickerUrl;
    img.alt = `Sticker guardado de ${item.sender || item.lastSender || 'usuario'}`;
    img.loading = 'lazy';
    btn.appendChild(img);
    grid.appendChild(btn);
  });
}

async function sendSavedSticker(item) {
  if (!state.rid || !item || !item.stickerUrl) return;
  setStickerPanelStatus('Enviando sticker…');
  const pendingTimeout = setTimeout(() => {
    setStickerPanelStatus('Esto está tardando más de lo normal… seguimos intentando.');
  }, 4200);
  try {
    const msg = {
      type: 'sticker',
      stickerUrl: item.stickerUrl,
      stickerMeta: item.stickerMeta || {
        w: STICKER_LIMITS.outputSize,
        h: STICKER_LIMITS.outputSize,
        size: 1,
        mime: 'image/webp'
      },
      sender: state.me,
      ts: Date.now()
    };
    if (state.activeReplyTo) msg.replyTo = { ...state.activeReplyTo };
    validateOutgoingMessage(msg);
    await DB.sendMessage(state.rid, msg);
    clearActiveReply();
    clearTimeout(pendingTimeout);
    setStickerPanelStatus('Sticker enviado.', 1200);
    closeStickerPanel();
  } catch (err) {
    clearTimeout(pendingTimeout);
    console.error('Error al enviar sticker guardado:', err);
    const reason = err && err.message ? err.message : 'error desconocido';
    showChatError(`No se pudo enviar el sticker guardado: ${reason}.`);
    setStickerPanelStatus(`Error al enviar: ${reason}`, 2800);
  }
}

function closeStickerStudio() {
  const modal = document.getElementById('sticker-studio');
  setStickerStatus('');
  modal.classList.remove('open');
  setTimeout(() => { modal.hidden = true; }, 140);
}

async function onStickerFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) return showChatError('Selecciona una imagen válida para el sticker.');
  if (file.size > STICKER_LIMITS.maxInputBytes) return showChatError('La imagen base excede 12 MB.');

  try {
    setStickerStatus('Cargando imagen base…');
    const dataUrl = await readFileAsDataURL(file);
    state.stickerStudio.sourceImg = await loadImage(dataUrl);
    state.stickerStudio.xPct = 50;
    state.stickerStudio.yPct = 50;
    state.stickerStudio.sizePct = 65;
    syncStickerSliders();
    renderStickerPreview();
    setStickerStatus('Imagen lista. Ajusta recorte y envía.');
  } catch (err) {
    console.error('Error al leer imagen base de sticker:', err);
    showChatError(`No se pudo cargar la imagen para sticker: ${err.message || 'error desconocido'}.`);
    setStickerStatus('');
  }
}

function syncStickerSliders() {
  document.getElementById('sticker-x').value = String(state.stickerStudio.xPct);
  document.getElementById('sticker-y').value = String(state.stickerStudio.yPct);
  document.getElementById('sticker-size').value = String(state.stickerStudio.sizePct);
}

function onStickerCropChange() {
  state.stickerStudio.xPct = parseInt(document.getElementById('sticker-x').value, 10);
  state.stickerStudio.yPct = parseInt(document.getElementById('sticker-y').value, 10);
  state.stickerStudio.sizePct = parseInt(document.getElementById('sticker-size').value, 10);
  renderStickerPreview();
}

function renderStickerPreview() {
  const canvas = document.getElementById('sticker-preview');
  const ctx = canvas.getContext('2d');

  // tablero para transparencia
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 20) {
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.fillStyle = ((x + y) / 20) % 2 === 0 ? '#1a1a24' : '#202030';
      ctx.fillRect(x, y, 20, 20);
    }
  }

  if (!state.stickerStudio.sourceImg) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '14px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Carga una imagen para iniciar', canvas.width / 2, canvas.height / 2);
    return;
  }

  const crop = getStickerCropRect(state.stickerStudio.sourceImg);
  ctx.drawImage(
    state.stickerStudio.sourceImg,
    crop.sx, crop.sy, crop.sw, crop.sh,
    0, 0, canvas.width, canvas.height
  );
}

function getStickerCropRect(img) {
  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  const sizeRatio = 0.2 + (state.stickerStudio.sizePct / 100) * 0.8;
  const cropSize = Math.max(STICKER_LIMITS.minCropPx, Math.round(minSide * sizeRatio));

  const maxX = img.naturalWidth - cropSize;
  const maxY = img.naturalHeight - cropSize;

  const cx = (state.stickerStudio.xPct / 100) * maxX;
  const cy = (state.stickerStudio.yPct / 100) * maxY;

  return {
    sx: Math.max(0, Math.min(maxX, Math.round(cx))),
    sy: Math.max(0, Math.min(maxY, Math.round(cy))),
    sw: cropSize,
    sh: cropSize
  };
}

async function exportStickerAndSend() {
  if (!state.rid || !state.stickerStudio.sourceImg) {
    return showChatError('Primero carga una imagen para crear sticker.');
  }

  const btn = document.getElementById('sticker-export');
  btn.disabled = true;
  btn.textContent = 'Procesando…';
  setStickerStatus('Creando sticker…');
  setChatStatus('Creando sticker…');

  try {
    const sticker = await buildStickerAsset(state.stickerStudio.sourceImg);
    setStickerStatus(`Sticker listo: ${sticker.reason}. Subiendo…`);
    setChatStatus('Subiendo sticker…');
    const messageId = DB.createMessageId(state.rid);
    const upload = await DB.uploadRoomSticker(state.rid, messageId, sticker.blob, sticker.mime);

    const msg = {
      type: 'sticker',
      stickerUrl: upload.downloadURL,
      stickerMeta: {
        w: sticker.width,
        h: sticker.height,
        size: sticker.blob.size,
        mime: sticker.mime,
        sourceW: sticker.sourceW,
        sourceH: sticker.sourceH
      },
      sender: state.me,
      ts: Date.now()
    };
    if (state.activeReplyTo) msg.replyTo = { ...state.activeReplyTo };

    validateOutgoingMessage(msg);
    setChatStatus('Creando mensaje de sticker…');
    await DB.sendMessageWithId(state.rid, messageId, msg);
    clearActiveReply();
    setStickerStatus('Sticker enviado.');
    setChatStatus('Sticker enviado.');
    setTimeout(() => {
      setStickerStatus('');
      setChatStatus('');
    }, 1400);

    if (state.userId) {
      const shouldSave = window.confirm('¿Guardar este sticker?');
      if (shouldSave) await DB.saveStickerForUser(state.userId, {
        stickerUrl: upload.downloadURL,
        stickerMeta: msg.stickerMeta,
        hash: await hashStickerBlob(sticker.blob),
        sender: state.me,
        ts: msg.ts,
        saveSource: 'created'
      });
    }

    closeStickerStudio();
  } catch (err) {
    console.error('Error al exportar/enviar sticker:', err);
    const reason = err && err.message ? err.message : 'error desconocido';
    showChatError(`No se pudo enviar el sticker: ${reason}.`);
    setStickerStatus(`Error: ${reason}`);
    setChatStatus('');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar sticker';
  }
}

async function buildStickerAsset(sourceImg) {
  const crop = getStickerCropRect(sourceImg);
  const canvas = document.createElement('canvas');
  canvas.width = STICKER_LIMITS.outputSize;
  canvas.height = STICKER_LIMITS.outputSize;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImg, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);

  let quality = 0.92;
  let webp = await canvasToBlob(canvas, 'image/webp', quality);
  while (webp.size > STICKER_LIMITS.maxUploadBytes && quality > 0.5) {
    quality -= 0.08;
    webp = await canvasToBlob(canvas, 'image/webp', quality);
  }

  if (webp.size <= STICKER_LIMITS.maxUploadBytes * 1.25) {
    return {
      blob: webp,
      mime: 'image/webp',
      width: canvas.width,
      height: canvas.height,
      sourceW: sourceImg.naturalWidth,
      sourceH: sourceImg.naturalHeight,
      reason: `WEBP optimizado (q=${quality.toFixed(2)})`
    };
  }

  const png = await canvasToBlob(canvas, 'image/png');
  if (png.size > STICKER_LIMITS.maxUploadBytes * 1.8) {
    throw new Error(`falló WEBP (${Math.round(webp.size / 1024)}KB) y PNG quedó demasiado pesado (${Math.round(png.size / 1024)}KB)`);
  }

  return {
    blob: png,
    mime: 'image/png',
    width: canvas.width,
    height: canvas.height,
    sourceW: sourceImg.naturalWidth,
    sourceH: sourceImg.naturalHeight,
    reason: `WEBP excedió límite (${Math.round(webp.size / 1024)}KB), enviado como PNG`
  };
}

async function compressImage(file, limits) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const baseRatio = Math.min(1, limits.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let dimFactor = 1;
  let quality = limits.preferredQuality;
  let blob = null;
  let strategy = 'normal';
  let attempts = 0;

  while (attempts < 8) {
    const targetW = Math.max(1, Math.round(img.naturalWidth * baseRatio * dimFactor));
    const targetH = Math.max(1, Math.round(img.naturalHeight * baseRatio * dimFactor));
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let localQuality = quality;
    blob = await canvasToBlob(canvas, 'image/jpeg', localQuality);
    while (blob.size > limits.maxUploadBytes && localQuality > 0.4) {
      localQuality -= 0.07;
      blob = await canvasToBlob(canvas, 'image/jpeg', localQuality);
    }

    if (blob.size <= limits.maxUploadBytes || (dimFactor <= 0.62 && localQuality <= 0.45)) {
      quality = localQuality;
      return { blob, width: targetW, height: targetH, mime: 'image/jpeg', strategy };
    }

    strategy = 'fallback';
    dimFactor *= 0.86;
    quality = Math.max(0.45, quality - 0.05);
    attempts += 1;
  }

  throw new Error(`compresión insuficiente (${Math.round((blob?.size || 0) / 1024)}KB)`);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('No se pudo procesar la imagen.'));
      resolve(blob);
    }, type, quality);
  });
}

async function hashStickerBlob(blob) {
  const data = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 96) + 'px';
}

window.addEventListener('load', function () {
  try {
    initDB();
    console.log('✅ Firebase inicializado correctamente');
    renderReplyBand();
    renderStickerPreview();
  } catch (err) {
    console.error('❌ Error al inicializar Firebase:', err);
    document.body.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:16px; padding:40px; text-align:center; color:white; background:#08080f; font-family:-apple-system, system-ui, sans-serif;">
        <div style="font-size:48px;">⚠️</div>
        <div style="font-size:22px; font-weight:700;">Error de configuración</div>
        <div style="font-size:15px; color:rgba(255,255,255,.55); max-width:320px; line-height:1.6;">
          Abre <code style="background:rgba(255,255,255,.1); padding:2px 6px; border-radius:5px;">js/config.js</code>
          y reemplaza los valores con los de tu proyecto en Firebase.
        </div>
      </div>`;
  }
});

document.addEventListener('click', function (e) {
  const imgBtn = e.target.closest('.img-btn');
  if (!imgBtn) return;
  const src = decodeURIComponent(imgBtn.getAttribute('data-img') || '');
  if (!src) return;
  openImageViewer(src);
});

let stickerLongPressTimer = null;
document.addEventListener('pointerdown', function (e) {
  const stickerBtn = e.target.closest('.sticker-btn');
  if (!stickerBtn) return;
  stickerLongPressTimer = setTimeout(() => {
    maybeSaveStickerFromButton(stickerBtn);
  }, 520);
});
document.addEventListener('pointerup', function () {
  if (!stickerLongPressTimer) return;
  clearTimeout(stickerLongPressTimer);
  stickerLongPressTimer = null;
});
document.addEventListener('pointercancel', function () {
  if (!stickerLongPressTimer) return;
  clearTimeout(stickerLongPressTimer);
  stickerLongPressTimer = null;
});
document.addEventListener('contextmenu', function (e) {
  const stickerBtn = e.target.closest('.sticker-btn');
  if (!stickerBtn) return;
  e.preventDefault();
  maybeSaveStickerFromButton(stickerBtn);
});

async function maybeSaveStickerFromButton(buttonEl) {
  if (!state.userId || !buttonEl) return;
  if (buttonEl.getAttribute('data-sticker-mine') === '1') return;
  const rawUrl = decodeURIComponent(buttonEl.getAttribute('data-sticker-url') || '');
  if (!rawUrl) return;
  const confirmed = window.confirm('¿Guardar este sticker?');
  if (!confirmed) return;

  try {
    const hash = await hashString(rawUrl);
    const metaRaw = decodeURIComponent(buttonEl.getAttribute('data-sticker-meta') || '%7B%7D');
    const parsedMeta = safeParseStickerMeta(metaRaw);
    await DB.saveStickerForUser(state.userId, {
      stickerUrl: rawUrl,
      hash,
      stickerMeta: parsedMeta,
      sender: buttonEl.getAttribute('data-sticker-sender') || null,
      ts: Date.now(),
      saveSource: 'received'
    });
  } catch (err) {
    console.error('Error guardando sticker recibido:', err);
    showChatError('No se pudo guardar el sticker.');
  }
}

async function hashString(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeParseStickerMeta(raw) {
  try {
    const meta = JSON.parse(raw);
    if (!meta || typeof meta !== 'object') throw new Error('invalid');
    return {
      w: Number(meta.w) || STICKER_LIMITS.outputSize,
      h: Number(meta.h) || STICKER_LIMITS.outputSize,
      size: Number(meta.size) || 1,
      mime: String(meta.mime || 'image/webp')
    };
  } catch (_) {
    return { w: STICKER_LIMITS.outputSize, h: STICKER_LIMITS.outputSize, size: 1, mime: 'image/webp' };
  }
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('img-viewer');
    if (overlay) overlay.classList.remove('open');
    closeStickerStudio();
    closeStickerPanel();
  }
});

function openImageViewer(src) {
  let overlay = document.getElementById('img-viewer');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-viewer';
    overlay.className = 'img-viewer';
    overlay.innerHTML = `<button class="img-viewer-close" aria-label="Cerrar imagen">✕</button><img class="img-viewer-image" alt="Vista completa" />`;
    overlay.addEventListener('click', function (evt) {
      if (evt.target === overlay || evt.target.classList.contains('img-viewer-close')) overlay.classList.remove('open');
    });
    document.body.appendChild(overlay);
  }

  overlay.querySelector('.img-viewer-image').src = src;
  overlay.classList.add('open');
}

window.addEventListener('beforeunload', function () {
  if (state.rid && state.sid) {
    navigator.sendBeacon && navigator.sendBeacon('/');
    firebase.database().ref(`members/${state.rid}/${state.sid}`).remove();
  }
});
