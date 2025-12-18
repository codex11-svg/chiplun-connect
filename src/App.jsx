import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

// --- YOUR LIVE FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo",
  authDomain: "chiplun-connect.firebaseapp.com",
  projectId: "chiplun-connect",
  storageBucket: "chiplun-connect.firebasestorage.app",
  messagingSenderId: "861830187280",
  appId: "1:861830187280:web:504064454581cdeb84bd95"
};

const App = () => {
  const [status, setStatus] = useState("Checking Connection...");
  const [error, setError] = useState(null);

  useEffect(() => {
    const runDiagnostic = async () => {
      try {
        // 1. Test Initialization
        setStatus("Step 1: Initializing Firebase...");
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const auth = getAuth(app);
        const db = getFirestore(app);

        // 2. Test Anonymous Auth
        setStatus("Step 2: Testing Anonymous Login...");
        const userCred = await signInAnonymously(auth);
        const userId = userCred.user.uid;

        // 3. Test Database Access
        setStatus("Step 3: Testing Database Rules...");
        const testDocRef = doc(db, 'diagnostic', 'test');
        await setDoc(testDocRef, { lastCheck: new Date().toISOString(), user: userId });
        
        setStatus("✅ ALL SYSTEMS GO! Your Firebase is connected perfectly.");
      } catch (err) {
        console.error(err);
        setError(err.code || err.message);
      }
    };

    runDiagnostic();
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#f0fdf4', minHeight: '100vh' }}>
      <h1 style={{ color: '#065f46' }}>ChiplunConnect Diagnostic</h1>
      <div style={{ padding: '20px', borderRadius: '12px', backgroundColor: 'white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <p style={{ fontWeight: 'bold' }}>Current Status:</p>
        <p style={{ color: '#059669' }}>{status}</p>

        {error && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fee2e2', borderRadius: '8px', border: '1px solid #ef4444' }}>
            <p style={{ color: '#991b1b', fontWeight: 'bold' }}>❌ CONNECTION ERROR FOUND:</p>
            <p style={{ color: '#b91c1c', fontSize: '14px', fontFamily: 'monospace' }}>{error}</p>
            <hr />
            <p style={{ fontSize: '12px', color: '#7f1d1d' }}>
              {error.includes("auth/operation-not-allowed") && "FIX: Enable 'Anonymous' in Firebase Authentication tab."}
              {error.includes("permission-denied") && "FIX: Set Firestore Rules to 'allow read, write: if true;'"}
              {error.includes("auth/unauthorized-domain") && "FIX: Add 'chiplun-connect.vercel.app' to Authorized Domains."}
            </p>
          </div>
        )}
      </div>
      <p style={{ fontSize: '10px', marginTop: '20px', color: '#9ca3af' }}>Refresh this page after making changes in Firebase Console.</p>
    </div>
  );
};

export default App;

