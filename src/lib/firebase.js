import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = { 
  apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo", 
  authDomain: "chiplun-connect.firebaseapp.com", 
  projectId: "chiplun-connect", 
  storageBucket: "chiplun-connect.firebasestorage.app", 
  messagingSenderId: "861830187280", 
  appId: "1:861830187280:web:504064454581cdeb84bd95" 
};

// Singleton Pattern: Ensures we only initialize once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const APP_ID = "chiplun-v50-supreme-final";
export const MASTER_ADMIN_UID = "mno2A46Df1fKmme9JSqPE9CMFB02";
