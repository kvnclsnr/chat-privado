// ============================================================
//  js/config.js — Configuración de Firebase
// ============================================================
//
//  PASOS PARA CONFIGURAR:
//  1. Ve a https://console.firebase.google.com
//  2. Crea un proyecto (o usa uno existente)
//  3. Ve a Realtime Database → Crear base de datos → Modo de prueba
//  4. Ve a Configuración del proyecto → Tus apps → Agrega app web (</>)
//  5. Copia los valores del objeto firebaseConfig y pégalos abajo
//
// ============================================================

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDjLpGrSwQ--Q9tw-4uaydELQTZS1driuQ",
  authDomain: "chat-prueba-333e1.firebaseapp.com",
  databaseURL: "https://chat-prueba-333e1-default-rtdb.firebaseio.com",
  projectId: "chat-prueba-333e1",
  storageBucket: "chat-prueba-333e1.firebasestorage.app",
  messagingSenderId: "817788526732",
  appId: "1:817788526732:web:f544cb8dd1bfc575099ba9",
  measurementId: "G-MKN81VCCHW"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
