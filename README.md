# 💬 Mensajes — Chat Privado

Chat en tiempo real con código de acceso privado y estilo iOS 26 modo oscuro.  
Construido con HTML, CSS, JavaScript vanilla y **Firebase Realtime Database**.

---

## ✨ Funciones

- Crear salas privadas con código de acceso secreto
- Elegir la capacidad máxima de usuarios (2–20)
- Código de sala único de 6 caracteres para compartir
- Mensajes en tiempo real sin recarga (Firebase listeners)
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

### 4. Reglas de seguridad (recomendado)

En Firebase Console → Realtime Database → **Reglas**, pega esto para producción:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read":  true,
        ".write": "!data.exists()"
      }
    },
    "messages": {
      "$roomId": {
        ".read":  true,
        ".write": true
      }
    },
    "members": {
      "$roomId": {
        ".read":  true,
        ".write": true
      }
    }
  }
}
```

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
- Fuente del sistema iOS/macOS (`-apple-system, SF Pro Text`)
- Desplegable en cualquier hosting estático (GitHub Pages, Netlify, Vercel, etc.)
