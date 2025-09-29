// firebase.js
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyA-5ZWhSy5bUtLLSI_OdgJGXa7kVIt2Jks",
  authDomain: "lawyer-diary-f6546.firebaseapp.com",
  projectId: "lawyer-diary-f6546",
  storageBucket: "lawyer-diary-f6546.firebasestorage.app",
  messagingSenderId: "702028179672",
  appId: "1:702028179672:web:3c95300c3bcaf513f1cfad",
  measurementId: "G-WEFB83Q7SN"
};

function validateFirebaseConfig(config) {
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const missing = requiredKeys.filter((key) => {
    const value = config[key];
    if (typeof value !== 'string') return true;
    const trimmed = value.trim();
    if (!trimmed) return true;
    return trimmed === `YOUR_${key.toUpperCase()}`;
  });
  if (missing.length) {
    console.warn('[firebase] Missing or placeholder config keys:', missing.join(', '));
  }
  console.log('[firebase] Configured for project:', config.projectId || 'unknown');
}

validateFirebaseConfig(firebaseConfig);

let firebaseApp;
try {
  firebaseApp = initializeApp(firebaseConfig);
} catch (error) {
  console.error('[firebase] Failed to initialize Firebase app', error);
  throw error;
}

export const app = firebaseApp;

// Initialize Auth with React Native persistence so sessions survive app restarts
// Falls back to getAuth if initializeAuth was already called (e.g., during HMR)
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // In dev with Fast Refresh, initializeAuth can throw if already initialized.
  // Fallback to getAuth using the existing instance.
  const { getAuth } = require('firebase/auth');
  authInstance = getAuth(app);
}

export const auth = authInstance;
