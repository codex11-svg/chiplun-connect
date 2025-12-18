import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- YOUR LIVE FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo",
  authDomain: "chiplun-connect.firebaseapp.com",
  projectId: "chiplun-connect",
  storageBucket: "chiplun-connect.firebasestorage.app",
  messagingSenderId: "861830187280",
  appId: "1:861830187280:web:504064454581cdeb84bd95"
};

// Safety Check for Firebase Init
let db, auth;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Setup Error", e);
}

const appId = "chiplun-main-v1";
const ADMIN_PIN = "2025";

export default function App() {
  const [renderError, setRenderError] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Minimal App State
  const [selectedStore, setSelectedStore] = useState(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [regForm, setRegForm] = useState({ bizName: '', addr: '' });

  // 1. Error Boundary Logic
  useEffect(() => {
    window.onerror = (msg, url, line) => {
      setRenderError(`Error: ${msg} at line ${line}`);
    };
  }, []);

  // 2. Authentication
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch (e) { setRenderError("Auth Blocked: Enable Anonymous in Console"); }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 3. Data Sync
  useEffect(() => {
    if (!user || !db) return;
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), 
      (snap) => setStores(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.log("Stores Permission Denied")
    );
    return () => unsub();
  }, [user]);

  // If there is a hard crash, show it on screen
  if (renderError) {
    return (
      <div style={{ padding: '20px', color: 'red', textAlign: 'center', paddingTop: '100px' }}>
        <h2>⚠️ App Error</h2>
        <p>{renderError}</p>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: '20px' }}>Reload</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col font-sans text-gray-900 shadow-2xl">
      
      {/* ALWAYS VISIBLE HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-10 rounded-b-[3rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center">
          <div>
            <h1 onClick={() => setView('home')} className="text-2xl font-black tracking-tighter cursor-pointer">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Live Trial Mode</p>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <Lucide.ShieldCheck size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-32">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Lucide.Loader2 className="animate-spin text-emerald-600 mb-4" size={32} />
            <p className="text-xs font-bold text-gray-400">CONNECTING...</p>
          </div>
        ) : (
          <>
            {/* VIEW: HOME */}
            {view === 'home' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-4 gap-3">
                  {['Salon', 'Travel', 'Clinic', 'Food'].map(n => (
                    <div key={n} className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center text-emerald-600">
                        <Lucide.Store size={24} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{n}</span>
                    </div>
                  ))}
                </div>

                <section className="pt-4">
                  <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">Live Businesses</h2>
                  <div className="space-y-3">
                    {stores.filter(s => s.isLive).map(store => (
                      <div key={store.id} className="bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm border border-gray-100">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-bold">
                          {store.name[0]}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-sm">{store.name}</h3>
                          <p className="text-[10px] text-gray-400">{store.address}</p>
                        </div>
                        <Lucide.ChevronRight size={18} className="text-gray-300" />
                      </div>
                    ))}
                    {stores.filter(s => s.isLive).length === 0 && (
                      <div className="text-center py-10 opacity-50">
                        <Lucide.Info size={32} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-xs font-medium">No stores online in Chiplun yet.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* VIEW: ADMIN AUTH */}
            {view === 'admin_auth' && (
              <div className="text-center py-10 animate-in zoom-in-95">
                <Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={40} />
                <h2 className="text-xl font-bold mb-6">Admin Login</h2>
                <input 
                  type="password" 
                  maxLength={4} 
                  placeholder="PIN"
                  value={adminPinInput} 
                  onChange={e => setAdminPinInput(e.target.value)} 
                  className="w-32 text-center text-4xl font-black border-b-2 outline-none mb-10 bg-transparent border-emerald-200" 
                />
                <button 
                  onClick={() => adminPinInput === ADMIN_PIN ? setView('admin_panel') : alert("Wrong PIN")}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold"
                >
                  Verify
                </button>
              </div>
            )}

            {/* VIEW: ADMIN PANEL */}
            {view === 'admin_panel' && (
              <div className="space-y-6">
                <h2 className="text-xl font-black">Management</h2>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest">Store Requests</p>
                {/* Applications will show here once you test them */}
                <p className="text-center py-10 text-gray-300 text-xs italic">All caught up!</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* FIXED NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 p-6 flex justify-around items-center z-50">
        <button onClick={() => setView('home')} className={`flex flex-col items-center ${view === 'home' ? 'text-emerald-600' : 'text-gray-300'}`}>
          <Lucide.Home size={22} /><span className="text-[9px] font-bold uppercase mt-1">Explore</span>
        </button>
        <button onClick={() => setView('vendor_portal')} className={`flex flex-col items-center ${view.includes('vendor') ? 'text-emerald-600' : 'text-gray-300'}`}>
          <Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-bold uppercase mt-1">Business</span>
        </button>
        <button className="flex flex-col items-center text-gray-300">
          <Lucide.Calendar size={22} /><span className="text-[9px] font-bold uppercase mt-1">Bookings</span>
        </button>
      </nav>
    </div>
  );
}

