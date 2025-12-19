import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- SECURE CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo",
      authDomain: "chiplun-connect.firebaseapp.com",
      projectId: "chiplun-connect",
      storageBucket: "chiplun-connect.firebasestorage.app",
      messagingSenderId: "861830187280",
      appId: "1:861830187280:web:504064454581cdeb84bd95"
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'chiplun-pro-v50-stable'; 
const ADMIN_PIN = "112607";

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500' },
  { id: 'clinic', n: 'Clinic', i: <Lucide.Stethoscope size={20}/>, c: 'bg-emerald-50 text-emerald-500' },
  { id: 'repair', n: 'Repair', i: <Lucide.Wrench size={20}/>, c: 'bg-amber-50 text-amber-500' }
];

export default function App() {
  // --- STATE MANAGEMENT ---
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notify, setNotify] = useState(null);
  
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState(null); 
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [bizSubView, setBizSubView] = useState('login');
  const [mTab, setMTab] = useState('ledger'); 

  const [bookForm, setBookForm] = useState({ date: '', time: '', phone: '', resId: '', seats: 1 });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [tracked, setTracked] = useState(null);

  // --- UI HELPERS ---
  const toast = (msg, type = 'info') => {
    setNotify({ msg, type });
    setTimeout(() => setNotify(null), 3500);
  };

  // --- FIREBASE LIFECYCLE ---
  useEffect(() => {
    const init = async () => {
      onAuthStateChanged(auth, async (u) => {
        if (!u) {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
          else await signInAnonymously(auth);
        }
        setUser(u);
      });
    };
    init();
  }, []);

  useEffect(() => {
    if (!user) return;
    const paths = {
      profile: doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'),
      stores: collection(db, 'artifacts', appId, 'public', 'data', 'stores'),
      bookings: collection(db, 'artifacts', appId, 'public', 'data', 'bookings'),
      requests: collection(db, 'artifacts', appId, 'public', 'data', 'requests')
    };
    const unsubs = [
      onSnapshot(paths.profile, (s) => s.exists() ? setProfile(s.data()) : setDoc(paths.profile, { role: 'customer', uid: user.uid })),
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.bookings, (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    setTimeout(() => setLoading(false), 1200);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- DEFENSIVE MEMOS ---
  const liveStores = useMemo(() => (stores || []).filter(s => 
    s.isLive && (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [stores, searchQuery]);

  const mData = useMemo(() => {
    if (!profile?.businessId) return null;
    const s = stores.find(x => x.id === profile.businessId);
    const b = bookings.filter(x => x.storeId === profile.businessId);
    return {
      store: s || { resources: [], services: [] },
      rev: b.filter(x => x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0),
      pending: b.filter(x => x.status === 'pending')
    };
  }, [bookings, profile, stores]);

  const getInventory = (sId, rId, capacity) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const used = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(capacity) || 0) - used };
  };

  // --- HANDLERS ---
  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const finalPrice = Number(cart?.price || 0) * (Number(bookForm.seats) || 1);
      const payload = { ...bookForm, displayId: id, storeId: selectedStore.id, storeName: selectedStore.name, serviceName: cart?.name, totalPrice: finalPrice, status: 'pending', timestamp: Date.now() };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setTracked(payload);
      setView('track');
    } catch (e) { toast("Booking Error", "error"); }
    setIsProcessing(false);
  };

  const handleVLogin = async () => {
    if (!vLogin.id) return toast("Enter ID", "error");
    setIsProcessing(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase()));
      if (snap.exists() && snap.data().password === vLogin.pass) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
        setView('merchant');
        toast("Access Granted");
      } else toast("Invalid Key", "error");
    } catch (e) { toast("Login Failed", "error"); }
    setIsProcessing(false);
  };

  // --- RENDER ---
  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-[0.4em]">CHIPLUN CONNECT</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme Stability • V50</p>
          </div>
          <button 
            onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'business' || view === 'merchant' ? 'bg-white text-emerald-600 border-white shadow-inner' : 'bg-white/10'}`}
          >
            <Lucide.Briefcase size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Search Chiplun services..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 transition-all" />
          </div>
        )}
      </header>

      {/* TOAST */}
      {notify && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4">
            <div className={`px-6 py-3 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-widest border ${notify.type === 'error' ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-emerald-600 border-emerald-100'}`}>
                {notify.msg}
            </div>
        </div>
      )}

      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in">
               {CATEGORIES.map(c => (
                 <button key={c.id} onClick={() => setSearchQuery(c.id === searchQuery ? '' : c.id)} className={`flex flex-col items-center gap-2 p-1 transition-all ${searchQuery === c.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                   <div className={`p-4 rounded-2xl border shadow-sm ${searchQuery === c.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}>{c.i}</div>
                   <span className="text-[9px] font-black uppercase text-slate-500">{c.n}</span>
                 </button>
               ))}
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Verified Partners</h2>
              <div className="space-y-4">
                {liveStores.map(store => (
                  <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart(null); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight uppercase mt-1">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200" />
                  </div>
                ))}
                {liveStores.length === 0 && <div className="text-center py-20 text-slate-300 font-black uppercase text-[10px] tracking-widest opacity-50">Discovery Empty</div>}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: MERCHANT (MANUAL FIXED PRICING MODE) */}
        {view === 'merchant' && mData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90 transition-all"><Lucide.LogOut size={20}/></button>
            </div>

            <div className={`p-6 rounded-[2.5rem] flex items-center justify-between shadow-lg transition-all ${mData.store.isLive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div><p className="text-[9px] font-black uppercase opacity-70">Shop Visibility</p><p className="text-xl font-black uppercase italic tracking-tighter">{mData.store.isLive ? 'Online & Live' : 'Hidden (Offline)'}</p></div>
              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !mData.store.isLive })} className={`w-14 h-8 rounded-full p-1 ${mData.store.isLive ? 'bg-white' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all ${mData.store.isLive ? 'bg-emerald-600 ml-6' : 'bg-white'}`} /></button>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                {['ledger', 'assets', 'menu'].map(t => (
                    <button key={t} onClick={() => setMerchantTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-widest ${merchantTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>{t}</button>
                ))}
            </div>

            {merchantTab === 'ledger' && (
               <section className="space-y-4 pb-20">
                  <div className="grid grid-cols-2 gap-4 px-1">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 tracking-widest">REVENUE</p><p className="text-2xl font-black text-emerald-600 tracking-tighter">₹{mData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 tracking-widest">PENDING</p><p className="text-2xl font-black text-blue-600 tracking-tighter">{mData.pending.length}</p></div>
                  </div>
                  {mData.pending.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm animate-in slide-in-from-left-4 mx-1">
                      <div className="flex-1 pr-4">
                        <p className="font-black text-sm uppercase italic leading-none">{b.custName || 'Guest'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">{b.serviceName} • {b.time}</p>
                      </div>
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl active:scale-90 transition-all"><Lucide.CheckCircle2 size={18}/></button>
                    </div>
                  ))}
               </section>
            )}

            {merchantTab === 'assets' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                <button onClick={() => {
                   const n = prompt(mData.store.category === 'salon' ? "Expert Name:" : "Trip Route/Time:");
                   const c = mData.store.category === 'travel' ? prompt("Total Available Seats:") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-500 transition-all">+ Add {mData.store.category === 'salon' ? 'Staff' : 'Fleet'}</button>
                <div className="space-y-3">
                   {mData.store.resources?.map((r, i) => (
                     <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                        <div><p className="font-black text-xs uppercase italic leading-none">{r.name}</p>{mData.store.category === 'travel' && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Capacity: {r.capacity}</p>}</div>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {merchantTab === 'menu' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic opacity-60">Fixed-Price Catalog</h3>
                  <button onClick={() => {
                     const n = prompt("Service/Route Name (e.g. Khed to Mumbai):");
                     const p = prompt("Fixed Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Rate Entry</button>
                  <div className="space-y-3">
                     {mData.store.services?.map((s, i) => (
                       <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                          <p className="font-black text-xs uppercase italic leading-none">{s.name} • ₹{s.price}</p>
                          <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="p-2 text-rose-500 active:scale-90 transition-all"><Lucide.X size={16}/></button>
                       </div>
                     ))}
                  </div>
               </div>
            )}
          </div>
        )}

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && profile.role !== 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">Business Hub</h2></div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 ${bizSubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${bizSubView === 'register' ? 'text-white' : 'text-slate-500'}`}>New Partner</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${bizSubView === 'login' ? 'text-white' : 'text-slate-500'}`}>Login</button>
            </div>
            {bizSubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 mx-1">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Business Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="WhatsApp Number" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none">
                  <option value="salon">Salon</option><option value="travel">Travel Agency</option>
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Full Area" />
                <button onClick={() => { setIsProcessing(true); addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() }).then(() => { toast("Application Submitted!"); setView('home'); setIsProcessing(false); }) }} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-[0.97] transition-all shadow-xl shadow-emerald-100">Apply for Listing</button>
                <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-widest pt-4">Administrator Console</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 text-center mx-1">
                <Lucide.ShieldCheck size={36} className="mx-auto text-emerald-600 mb-4" />
                <input value={vLogin.id} onChange={e => setVLogin({...vLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 text-center tracking-tighter" placeholder="Merchant ID" />
                <input type="password" value={vLogin.pass} onChange={e => setVLogin({...vLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none focus:border-emerald-500" placeholder="••••••••" />
                <button onClick={handleVLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Unlock Dashboard</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: ADMIN Master Terminal */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">System Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <input type="password" placeholder="Admin PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else toast("Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Authorize Session</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1">
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Stores ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm animate-in slide-in-from-bottom-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                          <button onClick={async () => {
                             const mId = prompt("Merchant ID:");
                             const key = prompt("Security Key:");
                             if (mId && key) {
                               setIsProcessing(true);
                               const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
                               await setDoc(sRef, { name: r.bizName, category: r.category, address: r.address, isLive: false, merchantId: mId.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
                               await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mId.toUpperCase()), { storeId: sRef.id, businessName: r.bizName, password: key });
                               await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id));
                               setIsProcessing(false); toast("Approved");
                             }
                          }} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95">Manual Approve</button>
                        </div>
                    </div>
                 )) : stores.map(s => (
                    <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center animate-in fade-in">
                       <div><h4 className="font-black text-xs uppercase italic leading-none">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1 uppercase tracking-widest">ID: {s.merchantId}</p></div>
                       <button onClick={() => { if(window.confirm("Purge?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="p-2 bg-slate-50 rounded-lg text-rose-600 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                    </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL (USER BOOKING ENGINE) */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest active:scale-95 px-2"><Lucide.ArrowLeft size={16} className="mr-2"/> Back to Discovery</button>
            <div className="relative mx-1">
              <img src={selectedStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl shadow-emerald-900/10" alt={selectedStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4 mx-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Choose Entry</h3>
              <div className="space-y-2">
                {selectedStore.services?.length > 0 ? selectedStore.services.map((s, idx) => (
                  <div key={idx} onClick={() => setCart(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                )) : <p className="text-center text-[9px] text-slate-300 font-black uppercase py-4">Waiting for partner pricing</p>}
              </div>
            </section>

            {cart && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5 mx-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Selection</h3>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      {selectedStore.resources?.map(r => {
                        const { count, left } = getInventory(selectedStore.id, r.id, r.capacity);
                        const isFull = selectedStore.category === 'travel' && left <= 0;
                        return (
                          <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed' : ''}`}>
                            <span className="font-black text-[10px] uppercase italic tracking-tight leading-none">{r.name}</span>
                            <span className={`text-[8px] font-black uppercase tracking-tighter ${isFull ? 'text-rose-500' : 'text-emerald-600'} leading-none`}>
                              {selectedStore.category === 'salon' ? `Queue: ${count}` : isFull ? 'Full' : `${left} Seats Left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedStore.category === 'travel' && bookForm.resId && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Seats Required</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                    <input type="time" onChange={e => setBookForm({...bookForm, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                  </div>
                  <input placeholder="WhatsApp Number" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner" />
                  <button disabled={!bookForm.date || !bookForm.time || !bookForm.phone || !bookForm.resId} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Issue Booking Token</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACKING */}
        {view === 'track' && tracked && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center leading-none">Token Generated</h2>
            <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 mx-1">
                <Lucide.Ticket size={40} className="text-emerald-600 mx-auto" />
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase italic leading-none">{tracked.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[9px] font-black uppercase text-left space-y-2 border border-slate-100 shadow-inner">
                  <div className="flex justify-between leading-none italic tracking-widest"><span>Merchant:</span><span className="text-emerald-700 font-black">{tracked.storeName}</span></div>
                  <div className="flex justify-between leading-none italic tracking-widest"><span>Service:</span><span>{tracked.serviceName}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs font-black leading-none italic tracking-widest"><span>Total:</span><span className="text-emerald-600 text-lg tracking-tighter">₹{tracked.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg tracking-[0.2em]">Home Explorer</button>
            </div>
          </div>
        )}
      </main>

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Compass size={24} /></button>
        <button onClick={() => setView('admin')} className={`transition-all ${view === 'admin' ? 'text-rose-600 scale-125' : 'text-slate-300'}`}><Lucide.ShieldCheck size={24} /></button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button 
          onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
          className={`transition-all ${view === 'business' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}
        >
          <Lucide.Briefcase size={24} />
        </button>
      </nav>

    </div>
  );
}

