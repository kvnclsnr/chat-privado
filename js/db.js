// ============================================================
//  js/db.js — Operaciones de Firebase Realtime Database/Storage
// ============================================================

let _db = null;
let _storage = null;

function initDB() {
  _db = firebase.database();
  _storage = firebase.storage();
}

const DB = {
  // ── SALAS ────────────────────────────────────────────────
  getRoom: async function (roomId) {
    const snap = await _db.ref(`rooms/${roomId}`).once('value');
    return snap.val();
  },

  createRoom: async function (roomId, data) {
    await _db.ref(`rooms/${roomId}`).set(data);
  },

  // ── MENSAJES ─────────────────────────────────────────────
  onMessages: function (roomId, callback) {
    const ref = _db.ref(`messages/${roomId}`).orderByChild('ts').limitToLast(300);

    ref.on('value', function (snap) {
      const msgs = [];
      snap.forEach(function (child) {
        msgs.push({ id: child.key, ...child.val() });
      });
      callback(msgs);
    });

    return function () { ref.off('value'); };
  },

  sendMessage: async function (roomId, msg) {
    await _db.ref(`messages/${roomId}`).push(msg);
  },

  sendMessageWithId: async function (roomId, messageId, msg) {
    await _db.ref(`messages/${roomId}/${messageId}`).set(msg);
  },

  createMessageId: function (roomId) {
    return _db.ref(`messages/${roomId}`).push().key;
  },

  uploadRoomImage: async function (roomId, messageId, fileBlob, contentType) {
    const safeType = contentType || 'image/jpeg';
    const path = `rooms/${roomId}/images/${messageId}`;
    const ref = _storage.ref(path);
    const snapshot = await ref.put(fileBlob, {
      contentType: safeType,
      cacheControl: 'public,max-age=31536000'
    });

    return {
      downloadURL: await snapshot.ref.getDownloadURL(),
      fullPath: snapshot.metadata.fullPath,
      contentType: snapshot.metadata.contentType,
      size: snapshot.metadata.size
    };
  },

  uploadRoomSticker: async function (roomId, messageId, fileBlob, contentType) {
    const safeType = contentType || 'image/webp';
    const ext = safeType.includes('png') ? 'png' : 'webp';
    const path = `rooms/${roomId}/stickers/${messageId}.${ext}`;
    const ref = _storage.ref(path);
    const snapshot = await ref.put(fileBlob, {
      contentType: safeType,
      cacheControl: 'public,max-age=31536000'
    });

    return {
      downloadURL: await snapshot.ref.getDownloadURL(),
      fullPath: snapshot.metadata.fullPath,
      contentType: snapshot.metadata.contentType,
      size: snapshot.metadata.size
    };
  },

  postSystemMessage: async function (roomId, text) {
    await _db.ref(`messages/${roomId}`).push({ type: 'sys', text, ts: Date.now() });
  },

  // ── MIEMBROS ─────────────────────────────────────────────
  joinRoom: async function (roomId, sessionId, name) {
    const ref = _db.ref(`members/${roomId}/${sessionId}`);
    await ref.set({ name, joinedAt: Date.now() });
    ref.onDisconnect().remove();
    return ref;
  },

  leaveRoom: async function (roomId, sessionId) {
    await _db.ref(`members/${roomId}/${sessionId}`).remove();
  },

  kickMember: async function (roomId, targetSessionId, kickedMark) {
    const updates = {};
    updates[`members/${roomId}/${targetSessionId}`] = null;
    updates[`kicked/${roomId}/${targetSessionId}`] = kickedMark;
    await _db.ref().update(updates);
  },

  onKickState: function (roomId, sessionId, callback) {
    const ref = _db.ref(`kicked/${roomId}/${sessionId}`);
    ref.on('value', function (snap) {
      callback(snap.val());
    });
    return function () { ref.off('value'); };
  },

  onMembers: function (roomId, callback) {
    const ref = _db.ref(`members/${roomId}`);

    ref.on('value', function (snap) {
      const members = [];
      snap.forEach(function (child) {
        members.push({
          sessionId: child.key,
          ...child.val()
        });
      });
      callback(members);
    });

    return function () { ref.off('value'); };
  },

  getMemberCount: async function (roomId) {
    const snap = await _db.ref(`members/${roomId}`).once('value');
    return snap.numChildren();
  },

  isNameTaken: async function (roomId, name) {
    const snap = await _db.ref(`members/${roomId}`).once('value');
    let taken = false;
    snap.forEach(function (child) {
      if (child.val().name === name) taken = true;
    });
    return taken;
  },

  saveRecentSticker: async function (userId, sticker, keepLast) {
    const ref = _db.ref(`users/${userId}/stickers`);
    const itemRef = ref.push();
    await itemRef.set(sticker);

    const snap = await ref.orderByChild('ts').once('value');
    const items = [];
    snap.forEach(child => { items.push({ key: child.key, ...child.val() }); });

    if (items.length <= keepLast) return;
    const removeCount = items.length - keepLast;
    const oldest = items.slice(0, removeCount);
    await Promise.all(oldest.map(it => ref.child(it.key).remove()));
  }
};
