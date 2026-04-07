# 💬 Mensajes — Chat Privado

Chat en tiempo real con código de acceso privado y estilo iOS 26 modo oscuro.  
Construido con HTML, CSS, JavaScript vanilla, **Firebase Realtime Database** y **Firebase Storage**.

---

## ✨ Funciones

- Crear salas privadas con código de acceso secreto
- Elegir la capacidad máxima de usuarios (2–20)
- Código de sala único de 6 caracteres para compartir
- Mensajes en tiempo real sin recarga (Firebase listeners)
- Envío de imágenes con compresión/redimensión en cliente antes de subir
- Sticker Studio (recorte + exportación WebP/PNG transparente y envío como mensaje `sticker`)
- Presencia automática: los miembros se eliminan al cerrar la pestaña
- Diseño iOS 26 modo oscuro, responsive para móvil y escritorio

---

## 🚀 Configuración

### 1. Crear proyecto en Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Haz clic en **Agregar proyecto** y sigue los pasos
3. En el menú lateral, ve a **Build → Realtime Database**
4. Haz clic en **Crear base de datos**
5. Elige una región y selecciona **Modo de prueba** (permite lectura/escritura temporal)
6. Haz clic en **Listo**

### 2. Obtener las credenciales

1. En Firebase Console, ve al ícono de engranaje ⚙️ → **Configuración del proyecto**
2. Baja hasta la sección **Tus apps** y haz clic en el ícono `</>`  (web)
3. Dale un nombre a la app y haz clic en **Registrar app**
4. Copia el objeto `firebaseConfig` que aparece

### 3. Pegar las credenciales

Abre `js/config.js` y reemplaza los valores:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "mi-proyecto.firebaseapp.com",
  databaseURL:       "https://mi-proyecto-default-rtdb.firebaseio.com",
  projectId:         "mi-proyecto",
  storageBucket:     "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### 4. Habilitar Firebase Storage

1. En Firebase Console ve a **Build → Storage**
2. Crea el bucket (recomendado mismo proyecto/región del Realtime Database)
3. Verifica que `storageBucket` en `js/config.js` corresponda a tu bucket

### 5. Reglas de seguridad (recomendado)

En Firebase Console → Realtime Database → **Reglas**, usa validaciones por tipo:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read":  true,
        ".write": "!data.exists()",
        ".validate": "newData.hasChildren(['name','codeHash','maxUsers','createdBy','createdAt'])"
      }
    },
    "messages": {
      "$roomId": {
        ".read":  true,
        "$msgId": {
          ".write": "root.child('rooms').child($roomId).exists()",
          ".validate": "newData.hasChildren(['type','ts']) && ((newData.child('type').val() === 'text' && newData.hasChildren(['sender','text'])) || (newData.child('type').val() === 'image' && newData.hasChildren(['sender','imageUrl','imageMeta'])) || (newData.child('type').val() === 'sticker' && newData.hasChildren(['sender','stickerUrl','stickerMeta'])) || (newData.child('type').val() === 'sys' && newData.hasChildren(['text'])))"
        }
      }
    },
    "members": {
      "$roomId": {
        ".read": "root.child('rooms').child($roomId).exists()",
        "$sessionId": {
          ".write": "root.child('rooms').child($roomId).exists()",
          ".validate": "newData.hasChildren(['name','joinedAt'])"
        }
      }
    }
  }
}
```

Y en Firebase Console → Storage → **Reglas**:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /rooms/{roomId}/images/{messageId} {
      allow read: if roomId.matches('^[A-Z0-9]{6}$');
      allow write: if
        roomId.matches('^[A-Z0-9]{6}$') &&
        messageId.size() > 5 &&
        messageId.size() < 80 &&
        request.resource.contentType.matches('^image/.*$') &&
        request.resource.size < 1500000;
    }
  }
}
```

> Firebase Storage no puede consultar Realtime Database directamente desde reglas. Por eso aquí se valida el formato de ruta (`rooms/{roomId}/images/{messageId}`) y longitud de IDs.


Archivos de reglas listos para usar en este repo:

- `firebase.database.rules.json`
- `firebase.storage.rules`

Incluyen índices `.indexOn` en `messages/{roomId}` y `users/{userId}/stickers` para consultas por `ts` con `orderByChild('ts')` + `limitToLast(...)`.

Puedes cargarlos con Firebase CLI:

```bash
firebase deploy --only database,storage
```

### 6. Límites recomendados para imágenes

- Tipo permitido: `image/*` (jpg, png, webp, etc.)
- Tamaño de archivo de entrada: **hasta 12 MB**
- Redimensión cliente: lado máximo **1600 px**
- Salida comprimida: JPEG con objetivo ~**850 KB**
- En chats de alto tráfico, evalúa bajar a 1200 px / 500 KB para reducir costo de transferencia.

---

## 🌐 Despliegue en GitHub Pages

### Opción A — Desde la interfaz de GitHub

1. Sube todos los archivos a un repositorio en GitHub
2. Ve a **Settings → Pages**
3. En **Source**, selecciona la rama `main` y la carpeta `/ (root)`
4. Haz clic en **Save**
5. En unos segundos tu app estará en `https://tu-usuario.github.io/nombre-repo/`

### Opción B — Con Git desde la terminal

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/tu-usuario/nombre-repo.git
git push -u origin main
```

Luego activa GitHub Pages como en la Opción A.

---

## 📁 Estructura de archivos

```
mensajes-chat/
├── index.html          # Estructura HTML y pantallas
├── css/
│   └── styles.css      # Estilos iOS 26 modo oscuro
├── js/
│   ├── config.js       # 🔑 Configuración de Firebase (editar)
│   ├── db.js           # Capa de acceso a Firebase
│   └── app.js          # Lógica principal y controlador de UI
└── README.md
```

---

## 🧾 Esquema de mensajes (Firebase)

Cada mensaje en `/messages/{roomId}/{autoId}` usa este contrato:

```js
{
  type: "text",               // text | image | sticker | sys
  sender: "Ana",              // requerido excepto type=sys
  ts: 1712599200000,          // timestamp en milisegundos
  text: "Hola 👋",            // solo para type=text y type=sys
  imageUrl: "https://...",    // solo para type=image
  imageMeta: { w: 1200, h: 900, size: 540000, mime: "image/jpeg" },
  stickerUrl: "https://...",  // solo para type=sticker
  stickerMeta: { w: 512, h: 512, size: 180000, mime: "image/webp" },
  replyTo: {                  // opcional, solo si es una respuesta
    id: "-Nu1AbCdEf",         // id del mensaje original
    sender: "Luis",           // remitente del mensaje original
    textPreview: "¿Ya..."     // recorte de texto para vista previa
  }
}
```

Las salas se guardan en `/rooms/{roomId}` con `codeHash` (SHA-256 hexadecimal) en vez de almacenar el código plano.

### Migración y convivencia con mensajes antiguos

- **Mensajes sin `type`:** el cliente mantiene fallback visual para tratarlos como texto si tienen `sender/text`.
- **Mensajes sin `replyTo`:** siguen siendo válidos, se renderizan sin banda de respuesta.
- **Salas antiguas con `code` plano:** el cliente acepta ambas variantes durante la transición:
  - si existe `codeHash`, valida contra hash;
  - si aún no existe, compara con `code` legado.
- Recomendación de migración de salas: crear un script administrativo que recorra `/rooms`, calcule hash para cada `code`, escriba `codeHash` y luego elimine `code`.

---

## 🔧 Desarrollo local

Puedes usar cualquier servidor estático. Por ejemplo con Python:

```bash
# Python 3
python -m http.server 3000
```

O con Node.js:

```bash
npx serve .
```

> **Nota:** No abras `index.html` directamente con `file://` porque los módulos
> de Firebase pueden bloquearse. Usa siempre un servidor local.

---

## 📝 Notas

- Los mensajes se guardan indefinidamente en Firebase (puedes limpiarlos desde la consola)
- El plan gratuito de Firebase (Spark) soporta hasta 1 GB de almacenamiento y 10 GB/mes de transferencia, más que suficiente para uso personal
- Los miembros se eliminan automáticamente cuando cierran la pestaña gracias a `onDisconnect()`
- El ID de sala se genera aleatoriamente; es prácticamente imposible adivinarlo por fuerza bruta

---

## 🛠️ Tecnologías

- HTML5 / CSS3 / JavaScript (vanilla, sin frameworks)
- [Firebase Realtime Database](https://firebase.google.com/docs/database) v10
- [Firebase Storage](https://firebase.google.com/docs/storage) v10 (compat)
- Fuente del sistema iOS/macOS (`-apple-system, SF Pro Text`)
- Desplegable en cualquier hosting estático (GitHub Pages, Netlify, Vercel, etc.)
