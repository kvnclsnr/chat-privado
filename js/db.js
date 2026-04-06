// ============================================================
//  js/db.js — Operaciones de Firebase Realtime Database
//
//  Estructura de datos en Firebase:
//
//  /rooms/{roomId}
//    name      : string   — nombre de la sala
//    code      : string   — código de acceso
//    maxUsers  : number   — capacidad máxima
//    createdBy : string   — nombre del creador
//    createdAt : number   — timestamp de creación
//
//  /messages/{roomId}/{autoId}
//    sender : string   — nombre del remitente (omit en sys)
//    text   : string   — contenido del mensaje (omit en sys)
//    type   : string   — "sys" para mensajes de sistema
//    replyTo: object?  — referencia al mensaje respondido (opcional)
//      id          : string — id del mensaje original
//      sender      : string — remitente del mensaje original
//      textPreview : string — recorte de texto para vista previa
//    ts     : number   — timestamp
//
//  /members/{roomId}/{sessionId}
//    name     : string  — nombre del usuario
//    joinedAt : number  — timestamp de entrada
//
// ============================================================

let _db = null;
let _storage = null;

/** Inicializa la referencia a la base de datos */
function initDB() {
  _db = firebase.database();
  _storage = firebase.storage();
}

const DB = {

  // ── SALAS ────────────────────────────────────────────────

  /** Obtiene los datos de una sala por su ID */
  getRoom: async function (roomId) {
    const snap = await _db.ref(`rooms/${roomId}`).once('value');
    return snap.val();
  },

  /** Crea una sala nueva con sus datos iniciales */
  createRoom: async function (roomId, data) {
    await _db.ref(`rooms/${roomId}`).set(data);
  },

  // ── MENSAJES ─────────────────────────────────────────────

  /**
   * Suscribe a mensajes en tiempo real.
   * @param {string}   roomId   - ID de la sala
   * @param {Function} callback - recibe array de mensajes
   * @returns {Function} unsubscribe — llámala para dejar de escuchar
   */
  onMessages: function (roomId, callback) {
    const ref = _db.ref(`messages/${roomId}`).limitToLast(300);

    ref.on('value', function (snap) {
      const msgs = [];
      snap.forEach(function (child) {
        msgs.push({ id: child.key, ...child.val() });
      });
      callback(msgs);
    });

    // Devuelve función para desuscribirse
    return function () { ref.off('value'); };
  },

  /** Envía un mensaje de usuario */
  sendMessage: async function (roomId, msg) {
    await _db.ref(`messages/${roomId}`).push(msg);
  },

  /** Envía un mensaje usando un ID predefinido */
  sendMessageWithId: async function (roomId, messageId, msg) {
    await _db.ref(`messages/${roomId}/${messageId}`).set(msg);
  },

  /** Crea una clave de mensaje para poder reutilizarla en uploads */
  createMessageId: function (roomId) {
    return _db.ref(`messages/${roomId}`).push().key;
  },

  /**
   * Sube una imagen a Firebase Storage en la ruta de sala/mensaje
   * @returns {Object} { downloadURL, fullPath, contentType, size }
   */
  uploadRoomImage: async function (roomId, messageId, fileBlob, contentType) {
    const safeType = contentType || 'image/jpeg';
    const path = `rooms/${roomId}/images/${messageId}`;
    const ref = _storage.ref(path);
    const snapshot = await ref.put(fileBlob, {
      contentType: safeType,
      cacheControl: 'public,max-age=31536000'
    });
    const downloadURL = await snapshot.ref.getDownloadURL();
    return {
      downloadURL: downloadURL,
      fullPath: snapshot.metadata.fullPath,
      contentType: snapshot.metadata.contentType,
      size: snapshot.metadata.size
    };
  },

  /** Publica un mensaje de sistema (ej. "María se unió") */
  postSystemMessage: async function (roomId, text) {
    await _db.ref(`messages/${roomId}`).push({
      type: 'sys',
      text: text,
      ts:   Date.now()
    });
  },

  // ── MIEMBROS ─────────────────────────────────────────────

  /**
   * Agrega al usuario como miembro activo.
   * `onDisconnect().remove()` elimina al miembro si pierde conexión.
   * @returns La referencia de Firebase (para cancelar el onDisconnect si es necesario)
   */
  joinRoom: async function (roomId, sessionId, name) {
    const ref = _db.ref(`members/${roomId}/${sessionId}`);
    await ref.set({ name: name, joinedAt: Date.now() });
    ref.onDisconnect().remove();
    return ref;
  },

  /** Elimina al usuario de la lista de miembros */
  leaveRoom: async function (roomId, sessionId) {
    await _db.ref(`members/${roomId}/${sessionId}`).remove();
  },

  /**
   * Suscribe al conteo de miembros en tiempo real.
   * @param {string}   roomId   - ID de la sala
   * @param {Function} callback - recibe array de miembros
   * @returns {Function} unsubscribe
   */
  onMembers: function (roomId, callback) {
    const ref = _db.ref(`members/${roomId}`);

    ref.on('value', function (snap) {
      const members = [];
      snap.forEach(function (child) {
        members.push(child.val());
      });
      callback(members);
    });

    return function () { ref.off('value'); };
  },

  /** Obtiene el conteo actual de miembros (una sola vez) */
  getMemberCount: async function (roomId) {
    const snap = await _db.ref(`members/${roomId}`).once('value');
    return snap.numChildren();
  },

  /** Verifica si un nombre ya está en uso en la sala */
  isNameTaken: async function (roomId, name) {
    const snap = await _db.ref(`members/${roomId}`).once('value');
    let taken = false;
    snap.forEach(function (child) {
      if (child.val().name === name) taken = true;
    });
    return taken;
  }

};
