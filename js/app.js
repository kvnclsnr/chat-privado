// ============================================================
//  js/app.js — Lógica principal y controlador de UI
// ============================================================

// ── Estado global ────────────────────────────────────────────
const state = {
  rid:            null,   // ID de la sala actual
  room:           null,   // datos de la sala { name, code, maxUsers, ... }
  me:             null,   // nombre del usuario actual
  sid:            null,   // session ID único por sesión (para presencia)
  memberRef:      null,   // referencia Firebase del miembro (para onDisconnect)
  unsubMsgs:      null,   // función para dejar de escuchar mensajes
  unsubMembers:   null,   // función para dejar de escuchar miembros
  renderedMsgIds: new Set() // IDs de mensajes ya renderizados
};

const IMAGE_LIMITS = {
  maxInputBytes:    12 * 1024 * 1024, // 12 MB máximo de archivo original
  maxUploadBytes:   850 * 1024,       // Objetivo tras compresión: ~850 KB
  maxDimension:     1600,
  preferredQuality: 0.82
};

// ── Utilidades ───────────────────────────────────────────────

/** Genera un ID de sala de 6 caracteres (sin letras/números ambiguos) */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/** Genera un session ID único para la presencia del usuario */
function generateSessionId() {
  return Math.random().toString(36).slice(2, 12);
}

/** Escapa HTML para evitar XSS */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\n/g, '<br>');
}

/** Formatea timestamp a HH:MM */
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('es', {
    hour:   '2-digit',
    minute: '2-digit'
  });
}

// ── Navegación ───────────────────────────────────────────────

/** Cambia la pantalla visible */
function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + screenId).classList.add('active');
}

/** Muestra un error temporal */
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4500);
}

/** Muestra errores en el chat (debajo de mensajes) */
function showChatError(message) {
  showError('ch-er', message);
}

// ── Eventos de UI ────────────────────────────────────────────

// Pantalla Home
document.getElementById('btn-create').addEventListener('click', () => goTo('create'));
document.getElementById('btn-join').addEventListener('click',   () => goTo('join'));

// Pantalla Crear
document.getElementById('back-create').addEventListener('click', () => goTo('home'));
document.getElementById('btn-do-create').addEventListener('click', handleCreate);
document.getElementById('c-mx').addEventListener('input', function () {
  document.getElementById('c-mv').textContent = this.value;
});

// Pantalla Unirse
document.getElementById('back-join').addEventListener('click', () => goTo('home'));
document.getElementById('btn-do-join').addEventListener('click', handleJoin);

// Convertir ID de sala a mayúsculas automáticamente
document.getElementById('j-id').addEventListener('input', function () {
  const cursor = this.selectionStart;
  this.value = this.value.toUpperCase();
  this.setSelectionRange(cursor, cursor);
});

// Enter en inputs de creación
['c-me', 'c-nm', 'c-cd'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') handleCreate();
  });
});

// Enter en inputs de unirse
['j-nm', 'j-id', 'j-cd'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') handleJoin();
  });
});

// Pantalla Creado
document.getElementById('btn-enter').addEventListener('click', enterChat);

// Pantalla Chat
document.getElementById('btn-leave').addEventListener('click', leaveChat);
document.getElementById('sb').addEventListener('click', sendMessage);
document.getElementById('ab').addEventListener('click', () => {
  document.getElementById('fi').click();
});
document.getElementById('fi').addEventListener('change', onImageSelected);
document.getElementById('mi').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById('mi').addEventListener('input', function () {
  autoResizeTextarea(this);
});

// ── Acciones principales ─────────────────────────────────────

/** Crea una nueva sala */
async function handleCreate() {
  const myName  = document.getElementById('c-me').value.trim();
  const roomName = document.getElementById('c-nm').value.trim();
  const code     = document.getElementById('c-cd').value.trim();
  const maxUsers = parseInt(document.getElementById('c-mx').value);

  if (!myName)   return showError('c-er', 'Ingresa tu nombre');
  if (!roomName) return showError('c-er', 'Ingresa el nombre de la sala');
  if (!code)     return showError('c-er', 'Define un código de acceso');

  const roomId = generateRoomId();
  const roomData = {
    name:      roomName,
    code:      code,
    maxUsers:  maxUsers,
    createdBy: myName,
    createdAt: Date.now()
  };

  try {
    await DB.createRoom(roomId, roomData);
    await DB.postSystemMessage(roomId, `Sala creada por ${myName}`);
  } catch (err) {
    console.error('Error al crear sala:', err);
    return showError('c-er', 'Error de conexión. Verifica tu configuración de Firebase.');
  }

  // Guardar estado
  state.rid  = roomId;
  state.room = roomData;
  state.me   = myName;
  state.sid  = generateSessionId();

  // Registrar al creador como miembro
  state.memberRef = await DB.joinRoom(roomId, state.sid, myName);

  // Mostrar pantalla de confirmación
  document.getElementById('cr-id').textContent = roomId;
  document.getElementById('cr-info').innerHTML = `
    <div class="info-card-row">
      <span>Sala</span>
      <span>${escapeHtml(roomName)}</span>
    </div>
    <div class="info-card-row">
      <span>Clave de acceso</span>
      <span>${escapeHtml(code)}</span>
    </div>
    <div class="info-card-row">
      <span>Capacidad</span>
      <span>${maxUsers} personas</span>
    </div>
  `;

  goTo('created');
}

/** Verifica credenciales y une al usuario a una sala existente */
async function handleJoin() {
  const name   = document.getElementById('j-nm').value.trim();
  const roomId = document.getElementById('j-id').value.trim().toUpperCase();
  const code   = document.getElementById('j-cd').value.trim();

  if (!name)          return showError('j-er', 'Ingresa tu nombre');
  if (roomId.length !== 6) return showError('j-er', 'El código de sala tiene 6 caracteres');
  if (!code)          return showError('j-er', 'Ingresa el código de acceso');

  // Obtener datos de la sala
  let room;
  try {
    room = await DB.getRoom(roomId);
  } catch (err) {
    console.error('Error al obtener sala:', err);
    return showError('j-er', 'Error de conexión. Verifica tu configuración de Firebase.');
  }

  if (!room)          return showError('j-er', 'Sala no encontrada — verifica el ID');
  if (room.code !== code) return showError('j-er', 'Código de acceso incorrecto');

  // Verificar capacidad
  const count = await DB.getMemberCount(roomId);
  if (count >= room.maxUsers) {
    return showError('j-er', `Sala llena (${count}/${room.maxUsers} usuarios)`);
  }

  // Verificar nombre duplicado
  const nameTaken = await DB.isNameTaken(roomId, name);
  if (nameTaken) {
    return showError('j-er', 'Ese nombre ya está en uso en esta sala');
  }

  // Guardar estado y unirse
  state.rid  = roomId;
  state.room = room;
  state.me   = name;
  state.sid  = generateSessionId();

  state.memberRef = await DB.joinRoom(roomId, state.sid, name);
  await DB.postSystemMessage(roomId, `${name} se unió`);

  enterChat();
}

/** Inicia la pantalla de chat y suscribe a Firebase */
function enterChat() {
  // Actualizar UI del header
  document.getElementById('ch-nm').textContent = state.room.name;
  document.getElementById('ch-id').textContent = state.rid;
  document.getElementById('ch-me').textContent = 'Tú: ' + state.me;

  // Limpiar mensajes previos
  document.getElementById('msgs').innerHTML = '';
  state.renderedMsgIds = new Set();

  goTo('chat');

  // Suscribir a mensajes en tiempo real
  state.unsubMsgs = DB.onMessages(state.rid, function (msgs) {
    renderMessages(msgs);
  });

  // Suscribir al conteo de miembros en tiempo real
  state.unsubMembers = DB.onMembers(state.rid, function (members) {
    document.getElementById('ch-cnt').textContent = members.length;
  });
}

/** Sale del chat y limpia el estado */
async function leaveChat() {
  // Dejar de escuchar Firebase
  if (state.unsubMsgs)    { state.unsubMsgs();    state.unsubMsgs    = null; }
  if (state.unsubMembers) { state.unsubMembers(); state.unsubMembers = null; }

  // Cancelar onDisconnect y eliminar miembro
  if (state.rid && state.sid) {
    try {
      if (state.memberRef) await state.memberRef.onDisconnect().cancel();
      await DB.postSystemMessage(state.rid, `${state.me} salió`);
      await DB.leaveRoom(state.rid, state.sid);
    } catch (err) {
      console.error('Error al salir:', err);
    }
  }

  // Resetear estado
  state.rid        = null;
  state.room       = null;
  state.me         = null;
  state.sid        = null;
  state.memberRef  = null;

  document.getElementById('msgs').innerHTML = '';
  goTo('home');
}

// ── Mensajes ─────────────────────────────────────────────────

/** Renderiza solo los mensajes nuevos (evita duplicados) */
function renderMessages(msgs) {
  const container = document.getElementById('msgs');
  const wasAtBottom =
    container.scrollHeight - container.clientHeight - container.scrollTop < 80;

  let addedCount = 0;

  msgs.forEach(function (msg) {
    if (state.renderedMsgIds.has(msg.id)) return;
    state.renderedMsgIds.add(msg.id);

    const el = document.createElement('div');

    if (msg.type === 'sys') {
      // Mensaje de sistema
      el.className   = 'msg-sys';
      el.textContent = msg.text;

    } else if (msg.type === 'image') {
      const isMine = msg.sender === state.me;
      const imageUrl = String(msg.imageUrl || '');
      if (!/^https?:\/\//i.test(imageUrl)) return;

      el.className = isMine ? 'msg-row-me' : 'msg-row-other';

      if (!isMine) {
        const senderEl = document.createElement('div');
        senderEl.className = 'msg-sender';
        senderEl.textContent = msg.sender || 'Usuario';
        el.appendChild(senderEl);
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
      el.appendChild(wrap);

    } else if (msg.sender === state.me) {
      // Mensaje propio (derecha, burbuja azul)
      el.className = 'msg-row-me';
      el.innerHTML = `
        <div>
          <div class="bubble-me">${escapeHtml(msg.text || '')}</div>
          <div class="msg-time" style="text-align: right; margin-right: 4px;">
            ${formatTime(msg.ts)}
          </div>
        </div>`;

    } else {
      // Mensaje ajeno (izquierda, burbuja gris)
      el.className = 'msg-row-other';
      el.innerHTML = `
        <div class="msg-sender">${escapeHtml(msg.sender)}</div>
        <div class="bubble-other">${escapeHtml(msg.text || '')}</div>
        <div class="msg-time" style="margin-left: 3px;">
          ${formatTime(msg.ts)}
        </div>`;
    }

    container.appendChild(el);
    addedCount++;
  });

  // Auto-scroll si el usuario estaba al fondo
  if (addedCount > 0 && wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

/** Envía un mensaje a Firebase */
async function sendMessage() {
  const input = document.getElementById('mi');
  const text  = input.value.trim();
  if (!text || !state.rid) return;

  input.value = '';
  autoResizeTextarea(input);

  try {
    await DB.sendMessage(state.rid, {
      type:   'text',
      sender: state.me,
      text:   text,
      ts:     Date.now()
    });
  } catch (err) {
    console.error('Error al enviar mensaje:', err);
  }
}

/** Valida input, comprime imagen y la sube a Storage para enviar mensaje de tipo image */
async function onImageSelected(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = '';

  if (!file || !state.rid) return;

  if (!file.type || !file.type.startsWith('image/')) {
    return showChatError('Solo se permiten archivos de imagen.');
  }
  if (file.size > IMAGE_LIMITS.maxInputBytes) {
    return showChatError('Imagen demasiado grande. Máximo permitido: 12 MB.');
  }

  const attachBtn = document.getElementById('ab');
  attachBtn.disabled = true;
  attachBtn.textContent = '⏳';

  try {
    const packed = await compressImage(file, IMAGE_LIMITS);
    if (packed.blob.size > IMAGE_LIMITS.maxUploadBytes * 1.4) {
      throw new Error('No se pudo reducir lo suficiente la imagen.');
    }

    const messageId = DB.createMessageId(state.rid);
    const upload = await DB.uploadRoomImage(state.rid, messageId, packed.blob, packed.mime);

    await DB.sendMessageWithId(state.rid, messageId, {
      type: 'image',
      imageUrl: upload.downloadURL,
      imageMeta: {
        w: packed.width,
        h: packed.height,
        size: packed.blob.size,
        mime: packed.mime
      },
      sender: state.me,
      ts: Date.now()
    });
  } catch (err) {
    console.error('Error al subir imagen:', err);
    showChatError('No se pudo enviar la imagen. Intenta con otra más liviana.');
  } finally {
    attachBtn.disabled = false;
    attachBtn.textContent = '📎';
  }
}

/** Comprime/redimensiona una imagen en cliente con Canvas */
async function compressImage(file, limits) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const ratio = Math.min(1, limits.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const targetW = Math.max(1, Math.round(img.naturalWidth * ratio));
  const targetH = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  let quality = limits.preferredQuality;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

  while (blob.size > limits.maxUploadBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  return {
    blob: blob,
    width: targetW,
    height: targetH,
    mime: 'image/jpeg'
  };
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
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('No se pudo procesar la imagen.'));
      resolve(blob);
    }, type, quality);
  });
}

/** Ajusta la altura del textarea automáticamente */
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 96) + 'px';
}

// ── Inicialización ───────────────────────────────────────────

window.addEventListener('load', function () {
  try {
    initDB();
    console.log('✅ Firebase inicializado correctamente');
  } catch (err) {
    console.error('❌ Error al inicializar Firebase:', err);

    document.body.innerHTML = `
      <div style="
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; height: 100vh; gap: 16px; padding: 40px;
        text-align: center; color: white; background: #08080f;
        font-family: -apple-system, system-ui, sans-serif;
      ">
        <div style="font-size: 48px;">⚠️</div>
        <div style="font-size: 22px; font-weight: 700;">Error de configuración</div>
        <div style="font-size: 15px; color: rgba(255,255,255,.55); max-width: 320px; line-height: 1.6;">
          Abre <code style="background: rgba(255,255,255,.1); padding: 2px 6px; border-radius: 5px;">js/config.js</code>
          y reemplaza los valores con los de tu proyecto en Firebase.
        </div>
        <a href="https://console.firebase.google.com" target="_blank"
           style="color: #007AFF; font-size: 15px; margin-top: 8px;">
          Ir a Firebase Console →
        </a>
      </div>`;
  }
});

// Apertura de imágenes en tamaño completo
document.addEventListener('click', function (e) {
  const imgBtn = e.target.closest('.img-btn');
  if (!imgBtn) return;
  const src = decodeURIComponent(imgBtn.getAttribute('data-img') || '');
  if (!src) return;
  openImageViewer(src);
});

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('img-viewer');
  if (overlay) overlay.classList.remove('open');
});

function openImageViewer(src) {
  let overlay = document.getElementById('img-viewer');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'img-viewer';
    overlay.className = 'img-viewer';
    overlay.innerHTML = `
      <button class="img-viewer-close" aria-label="Cerrar imagen">✕</button>
      <img class="img-viewer-image" alt="Vista completa" />
    `;
    overlay.addEventListener('click', function (evt) {
      if (evt.target === overlay || evt.target.classList.contains('img-viewer-close')) {
        overlay.classList.remove('open');
      }
    });
    document.body.appendChild(overlay);
  }

  overlay.querySelector('.img-viewer-image').src = src;
  overlay.classList.add('open');
}

// Limpieza al cerrar la pestaña
window.addEventListener('beforeunload', function () {
  if (state.rid && state.sid) {
    // Eliminar miembro de forma síncrona (best-effort)
    navigator.sendBeacon && navigator.sendBeacon('/'); // trigger
    firebase.database().ref(`members/${state.rid}/${state.sid}`).remove();
  }
});
