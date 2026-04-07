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
  renderedMsgIds: new Set(),
  activeReplyTo: null,
  stickerStudio: {
    sourceImg: null,
    xPct: 50,
    yPct: 50,
    sizePct: 65
  }
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

const ALLOWED_MESSAGE_KEYS = {
  text: ['type', 'sender', 'text', 'ts', 'replyTo'],
  image: ['type', 'sender', 'imageUrl', 'imageMeta', 'ts'],
  sticker: ['type', 'sender', 'stickerUrl', 'stickerMeta', 'ts'],
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

// ── Eventos UI ──────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => goTo('create'));
document.getElementById('btn-join').addEventListener('click', () => goTo('join'));
document.getElementById('back-create').addEventListener('click', () => goTo('home'));
document.getElementById('btn-do-create').addEventListener('click', handleCreate);
document.getElementById('c-mx').addEventListener('input', function () {
  document.getElementById('c-mv').textContent = this.value;
});

document.getElementById('back-join').addEventListener('click', () => goTo('home'));
document.getElementById('btn-do-join').addEventListener('click', handleJoin);
document.getElementById('j-id').addEventListener('input', function () {
  const cursor = this.selectionStart;
  this.value = this.value.toUpperCase();
  this.setSelectionRange(cursor, cursor);
});

['c-me', 'c-nm', 'c-cd'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleCreate(); });
});
['j-nm', 'j-id', 'j-cd'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(); });
});

document.getElementById('btn-enter').addEventListener('click', enterChat);
document.getElementById('btn-leave').addEventListener('click', leaveChat);
document.getElementById('sb').addEventListener('click', sendMessage);
document.getElementById('ab').addEventListener('click', () => document.getElementById('fi').click());
document.getElementById('fi').addEventListener('change', onImageSelected);
document.getElementById('btn-sticker').addEventListener('click', openStickerStudio);
document.getElementById('sticker-close').addEventListener('click', closeStickerStudio);
document.getElementById('sticker-cancel').addEventListener('click', closeStickerStudio);
document.getElementById('sticker-file').addEventListener('change', onStickerFileSelected);
document.getElementById('sticker-export').addEventListener('click', exportStickerAndSend);
document.getElementById('sticker-x').addEventListener('input', onStickerCropChange);
document.getElementById('sticker-y').addEventListener('input', onStickerCropChange);
document.getElementById('sticker-size').addEventListener('input', onStickerCropChange);
document.getElementById('mi').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById('mi').addEventListener('input', function () { autoResizeTextarea(this); });

document.getElementById('reply-cancel').addEventListener('click', clearActiveReply);

async function handleCreate() {
  const myName = document.getElementById('c-me').value.trim();
  const roomName = document.getElementById('c-nm').value.trim();
  const code = document.getElementById('c-cd').value.trim();
  const maxUsers = parseInt(document.getElementById('c-mx').value);

  if (!myName) return showError('c-er', 'Ingresa tu nombre');
  if (!roomName) return showError('c-er', 'Ingresa el nombre de la sala');
  if (!code) return showError('c-er', 'Define un código de acceso');

  const roomId = generateRoomId();
  const roomData = { name: roomName, code, maxUsers, createdBy: myName, createdAt: Date.now() };

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
  state.memberRef = await DB.joinRoom(roomId, state.sid, myName);

  document.getElementById('cr-id').textContent = roomId;
  document.getElementById('cr-info').innerHTML = `
    <div class="info-card-row"><span>Sala</span><span>${escapeHtml(roomName)}</span></div>
    <div class="info-card-row"><span>Clave de acceso</span><span>${escapeHtml(code)}</span></div>
    <div class="info-card-row"><span>Capacidad</span><span>${maxUsers} personas</span></div>`;

  goTo('created');
}

async function handleJoin() {
  const name = document.getElementById('j-nm').value.trim();
  const roomId = document.getElementById('j-id').value.trim().toUpperCase();
  const code = document.getElementById('j-cd').value.trim();

  if (!name) return showError('j-er', 'Ingresa tu nombre');
  if (roomId.length !== 6) return showError('j-er', 'El código de sala tiene 6 caracteres');
  if (!code) return showError('j-er', 'Ingresa el código de acceso');

  let room;
  try {
    room = await DB.getRoom(roomId);
  } catch (err) {
    console.error('Error al obtener sala:', err);
    return showError('j-er', 'Error de conexión. Verifica tu configuración de Firebase.');
  }

  if (!room) return showError('j-er', 'Sala no encontrada — verifica el ID');
  if (room.code !== code) return showError('j-er', 'Código de acceso incorrecto');

  const count = await DB.getMemberCount(roomId);
  if (count >= room.maxUsers) return showError('j-er', `Sala llena (${count}/${room.maxUsers} usuarios)`);

  if (await DB.isNameTaken(roomId, name)) return showError('j-er', 'Ese nombre ya está en uso en esta sala');

  state.rid = roomId;
  state.room = room;
  state.me = name;
  state.sid = generateSessionId();
  state.userId = generateUserId(name);

  state.memberRef = await DB.joinRoom(roomId, state.sid, name);
  await DB.postSystemMessage(roomId, `${name} se unió`);
  enterChat();
}

function enterChat() {
  document.getElementById('ch-nm').textContent = state.room.name;
  document.getElementById('ch-id').textContent = state.rid;
  document.getElementById('ch-me').textContent = 'Tú: ' + state.me;

  document.getElementById('msgs').innerHTML = '';
  state.renderedMsgIds = new Set();
  clearActiveReply();

  goTo('chat');

  state.unsubMsgs = DB.onMessages(state.rid, renderMessages);
  state.unsubMembers = DB.onMembers(state.rid, members => {
    document.getElementById('ch-cnt').textContent = members.length;
  });
}

async function leaveChat() {
  if (state.unsubMsgs) { state.unsubMsgs(); state.unsubMsgs = null; }
  if (state.unsubMembers) { state.unsubMembers(); state.unsubMembers = null; }

  if (state.rid && state.sid) {
    try {
      if (state.memberRef) await state.memberRef.onDisconnect().cancel();
      await DB.postSystemMessage(state.rid, `${state.me} salió`);
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

  document.getElementById('msgs').innerHTML = '';
  goTo('home');
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

    } else if (msg.sender === state.me) {
      el.className = 'msg-row-me';
      el.innerHTML = `<div><div class="bubble-me">${escapeHtml(msg.text || '')}</div><div class="msg-time" style="text-align:right; margin-right:4px;">${formatTime(msg.ts)}</div><button class="msg-reply-btn" type="button">Responder</button></div>`;
      el.querySelector('.msg-reply-btn').addEventListener('click', () => setActiveReplyFromMessage(msg));
    } else {
      el.className = 'msg-row-other';
      el.innerHTML = `<div class="msg-sender">${escapeHtml(msg.sender || 'Usuario')}</div><div class="bubble-other">${escapeHtml(msg.text || '')}</div><div class="msg-time" style="margin-left:3px;">${formatTime(msg.ts)}</div><button class="msg-reply-btn" type="button">Responder</button>`;
      el.querySelector('.msg-reply-btn').addEventListener('click', () => setActiveReplyFromMessage(msg));
    }

    container.appendChild(el);
    addedCount++;
  });

  if (addedCount > 0 && wasAtBottom) container.scrollTop = container.scrollHeight;
}

function renderImageMessage(container, msg) {
  const isMine = msg.sender === state.me;
  const imageUrl = String(msg.imageUrl || '');
  if (!/^https?:\/\//i.test(imageUrl)) return;

  container.className = isMine ? 'msg-row-me' : 'msg-row-other';

  if (!isMine) {
    const senderEl = document.createElement('div');
    senderEl.className = 'msg-sender';
    senderEl.textContent = msg.sender || 'Usuario';
    container.appendChild(senderEl);
  }

  const wrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = `${isMine ? 'bubble-me' : 'bubble-other'} bubble-image img-btn`;
  btn.setAttribute('data-img', encodeURIComponent(imageUrl));

  const img = document.createElement('img');
  img.className = 'chat-img';
  img.src = imageUrl;
  img.alt = `Imagen enviada por ${msg.sender || 'usuario'}`;
  img.loading = 'lazy';
  btn.appendChild(img);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.style.cssText = isMine ? 'text-align:right; margin-right:4px;' : 'margin-left:3px;';
  time.textContent = formatTime(msg.ts);

  wrap.appendChild(btn);
  wrap.appendChild(time);
  container.appendChild(wrap);
}

function renderStickerMessage(container, msg) {
  const isMine = msg.sender === state.me;
  const stickerUrl = String(msg.stickerUrl || '');
  if (!/^https?:\/\//i.test(stickerUrl)) return;

  container.className = isMine ? 'msg-row-me msg-row-sticker' : 'msg-row-other msg-row-sticker';

  if (!isMine) {
    const senderEl = document.createElement('div');
    senderEl.className = 'msg-sender';
    senderEl.textContent = msg.sender || 'Usuario';
    container.appendChild(senderEl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'sticker-wrap';

  const btn = document.createElement('button');
  btn.className = 'sticker-btn img-btn';
  btn.setAttribute('data-img', encodeURIComponent(stickerUrl));

  const img = document.createElement('img');
  img.className = 'chat-sticker';
  img.src = stickerUrl;
  img.alt = `Sticker de ${msg.sender || 'usuario'}`;
  img.loading = 'lazy';
  btn.appendChild(img);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.style.cssText = isMine ? 'text-align:right; margin-right:2px;' : 'margin-left:2px;';
  time.textContent = formatTime(msg.ts);

  wrap.appendChild(btn);
  wrap.appendChild(time);
  container.appendChild(wrap);
}

function setActiveReplyFromMessage(msg) {
  if (!msg || msg.type === 'sys' || !msg.id) return;
  const preview = msg.type === 'sticker' ? '[sticker]' : (msg.type === 'image' ? '[imagen]' : makeTextPreview(msg.text));
  state.activeReplyTo = { id: msg.id, sender: msg.sender || 'Usuario', textPreview: preview };
  renderReplyBand();
  document.getElementById('mi').focus();
}

function clearActiveReply() {
  state.activeReplyTo = null;
  renderReplyBand();
}

function renderReplyBand() {
  const band = document.getElementById('reply-band');
  const sender = document.getElementById('reply-sender');
  const preview = document.getElementById('reply-preview');

  if (!state.activeReplyTo) {
    band.hidden = true;
    sender.textContent = '';
    preview.textContent = '';
    return;
  }

  band.hidden = false;
  sender.textContent = state.activeReplyTo.sender;
  preview.textContent = state.activeReplyTo.textPreview;
}

function validateOutgoingMessage(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('Payload inválido');
  const allowed = ALLOWED_MESSAGE_KEYS[msg.type];
  if (!allowed) throw new Error('Tipo de mensaje inválido');

  const keys = Object.keys(msg);
  if (keys.some(k => !allowed.includes(k))) throw new Error('Campos no esperados en payload');

  if (msg.type === 'text') {
    if (!msg.sender || typeof msg.sender !== 'string' || msg.sender.length > 24) throw new Error('Remitente inválido');
    if (!msg.text || typeof msg.text !== 'string' || msg.text.length > 1800) throw new Error('Texto inválido');
    if (msg.replyTo) {
      const rt = msg.replyTo;
      if (typeof rt !== 'object' || typeof rt.id !== 'string' || typeof rt.sender !== 'string' || typeof rt.textPreview !== 'string') {
        throw new Error('replyTo inválido');
      }
      if (rt.id.length > 120 || rt.sender.length > 40 || rt.textPreview.length > 120) throw new Error('replyTo excede límites');
    }
  }

  if (msg.type === 'image') {
    if (!/^https?:\/\//i.test(msg.imageUrl || '')) throw new Error('URL de imagen inválida');
    const m = msg.imageMeta || {};
    if (!m.w || !m.h || !m.size || !m.mime) throw new Error('Meta de imagen incompleta');
    if (m.size > IMAGE_LIMITS.maxUploadBytes * 1.5) throw new Error('Imagen excede límite');
  }

  if (msg.type === 'sticker') {
    if (!/^https?:\/\//i.test(msg.stickerUrl || '')) throw new Error('URL de sticker inválida');
    const m = msg.stickerMeta || {};
    if (!m.w || !m.h || !m.size || !m.mime) throw new Error('Meta de sticker incompleta');
    if (m.size > STICKER_LIMITS.maxUploadBytes * 1.6) throw new Error('Sticker excede límite');
    if (m.w > 1024 || m.h > 1024) throw new Error('Sticker excede dimensiones permitidas');
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

  try {
    const packed = await compressImage(file, IMAGE_LIMITS);
    if (packed.blob.size > IMAGE_LIMITS.maxUploadBytes * 1.4) throw new Error('No se redujo suficiente.');

    const messageId = DB.createMessageId(state.rid);
    const upload = await DB.uploadRoomImage(state.rid, messageId, packed.blob, packed.mime);

    const msg = {
      type: 'image',
      imageUrl: upload.downloadURL,
      imageMeta: { w: packed.width, h: packed.height, size: packed.blob.size, mime: packed.mime },
      sender: state.me,
      ts: Date.now()
    };

    validateOutgoingMessage(msg);
    await DB.sendMessageWithId(state.rid, messageId, msg);
  } catch (err) {
    console.error('Error al subir imagen:', err);
    showChatError('No se pudo enviar la imagen. Intenta con otra más liviana.');
  } finally {
    attachBtn.disabled = false;
    attachBtn.textContent = '📎';
  }
}

function openStickerStudio() {
  const modal = document.getElementById('sticker-studio');
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('open'));
  renderStickerPreview();
}

function closeStickerStudio() {
  const modal = document.getElementById('sticker-studio');
  modal.classList.remove('open');
  setTimeout(() => { modal.hidden = true; }, 140);
}

async function onStickerFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type || !file.type.startsWith('image/')) return showChatError('Selecciona una imagen válida para el sticker.');
  if (file.size > STICKER_LIMITS.maxInputBytes) return showChatError('La imagen base excede 12 MB.');

  try {
    const dataUrl = await readFileAsDataURL(file);
    state.stickerStudio.sourceImg = await loadImage(dataUrl);
    state.stickerStudio.xPct = 50;
    state.stickerStudio.yPct = 50;
    state.stickerStudio.sizePct = 65;
    syncStickerSliders();
    renderStickerPreview();
  } catch (err) {
    console.error('Error al leer imagen base de sticker:', err);
    showChatError('No se pudo cargar la imagen para sticker.');
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
  btn.textContent = 'Exportando…';

  try {
    const sticker = await buildStickerAsset(state.stickerStudio.sourceImg);
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

    validateOutgoingMessage(msg);
    await DB.sendMessageWithId(state.rid, messageId, msg);

    if (state.userId) {
      await DB.saveRecentSticker(state.userId, {
        stickerUrl: upload.downloadURL,
        stickerMeta: msg.stickerMeta,
        sender: state.me,
        ts: msg.ts
      }, STICKER_LIMITS.recentLimit);
    }

    closeStickerStudio();
  } catch (err) {
    console.error('Error al exportar/enviar sticker:', err);
    showChatError('No se pudo enviar el sticker.');
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
      sourceH: sourceImg.naturalHeight
    };
  }

  const png = await canvasToBlob(canvas, 'image/png');
  if (png.size > STICKER_LIMITS.maxUploadBytes * 1.8) throw new Error('Sticker demasiado pesado');

  return {
    blob: png,
    mime: 'image/png',
    width: canvas.width,
    height: canvas.height,
    sourceW: sourceImg.naturalWidth,
    sourceH: sourceImg.naturalHeight
  };
}

async function compressImage(file, limits) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const ratio = Math.min(1, limits.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
  const targetH = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);

  let quality = limits.preferredQuality;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > limits.maxUploadBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  return { blob, width: targetW, height: targetH, mime: 'image/jpeg' };
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

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('img-viewer');
    if (overlay) overlay.classList.remove('open');
    closeStickerStudio();
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
