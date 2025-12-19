import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- PRODUCTION CONFIG ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { 
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'chiplun-supreme-v50-pro';
const ADMIN_PIN = "112607";

export default function App() {
  // Session
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Database
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // UI
  const [search, setSearch] = useState('');
  const [activeStore, setActiveStore] = useState(null);
  const [activeCart, setActiveCart] = useState(null); 
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [mTab, setMTab] = useState('ledger'); 
  const [hubView, setHubView] = useState('login');

  // Booking & Tracking
  const [bookForm, setBookForm] = useState({ custName: '', date: '', time: '', phone: '', resId: '', seats: 1 });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [trackInput, setTrackInput] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const notify = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- FIREBASE SYNC ---
  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      setUser(u);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const root = ['artifacts', appId];
    const unsubs = [
      onSnapshot(doc(db, ...root, 'users', user.uid, 'profile', 'data'), (s) => {
        if (s.exists()) setProfile(s.data());
        else setDoc(doc(db, ...root, 'users', user.uid, 'profile', 'data'), { role: 'customer', uid: user.uid });
      }),
      onSnapshot(collection(db, ...root, 'public', 'data', 'stores'), (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, ...root, 'public', 'data', 'bookings'), (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, ...root, 'public', 'data', 'requests'), (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    setTimeout(() => setLoading(false), 1200);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- COMPUTATIONS ---
  const marketplace = useMemo(() => (stores || []).filter(s => 
    s.isLive && (s.name?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase()))
  ), [stores, search]);

  const merchantData = useMemo(() => {
    if (!profile?.businessId || stores.length === 0) return null;
    const s = stores.find(x => x.id === profile.businessId);
    if (!s) return null;
    const b = bookings.filter(x => x.storeId === profile.businessId);
    return {
      store: s,
      rev: b.filter(x => x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0),
      queue: b.filter(x => x.status === 'pending').sort((a,b) => a.timestamp - b.timestamp)
    };
  }, [bookings, profile, stores]);

  const getCapacity = (sId, rId, total) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const taken = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(total) || 0) - taken };
  };

  const liveTracker = useMemo(() => {
    if (!activeReceipt) return null;
    const live = bookings.find(b => b.displayId === activeReceipt.displayId);
    if (!live || live.status !== 'pending') return { error: 'Invalid or Finished' };
    const ahead = bookings.filter(b => b.storeId === live.storeId && b.resId === live.resId && b.status === 'pending' && b.timestamp < live.timestamp);
    return { ...live, pos: ahead.length + 1, wait: ahead.length * 20 };
  }, [bookings, activeReceipt]);

  // --- HANDLERS ---
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 800000) return notify("Image too large. Max 800KB", "error");
    
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { image: reader.result });
      notify("Business Image Updated!");
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleBookingSubmit = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');

    if (bookForm.date === today && bookForm.time < currentTime && activeStore.category === 'salon') {
      return notify("You cannot pick a past time!", "error");
    }

    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const total = Number(activeCart.price) * (activeStore.category === 'travel' ? (bookForm.seats || 1) : 1);
      
      let finalTime = bookForm.time;
      if (activeStore.category === 'travel') {
         const trip = activeStore.resources?.find(r => r.id === bookForm.resId);
         finalTime = trip?.time || "Scheduled";
      }

      const payload = { ...bookForm, time: finalTime, displayId: id, storeId: activeStore.id, storeName: activeStore.name, serviceName: activeCart.name, totalPrice: total, status: 'pending', timestamp: Date.now(), payment: 'Cash' };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setActiveReceipt(payload);
      setShowFinalConfirm(false);
      setShowPayment(false);
      setView('track');
    } catch (e) { notify("Error", "error"); }
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-[0.4em]">CHIPLUN CONNECT</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Master V50 Pro</p>
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
            <input type="text" placeholder="Search agencies or salons..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      {/* NOTIFICATION */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-4">
            <div className={`px-6 py-3 rounded-full shadow-2xl font-black text-[10px] uppercase tracking-widest border ${toast.type === 'error' ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-emerald-600 border-emerald-100'}`}>
                {toast.msg}
            </div>
        </div>
      )}

      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in">
               <button onClick={() => setSearch('salon')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Scissors size={20} className="text-rose-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Salon</span></button>
               <button onClick={() => setSearch('travel')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Bus size={20} className="text-blue-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Travel</span></button>
               <button onClick={() => setView('track')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Ticket size={20} className="text-emerald-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Tracker</span></button>
               <button onClick={() => setView('admin')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Shield size={20} className="text-rose-400"/></div><span className="text-[9px] font-black uppercase text-slate-400">Master</span></button>
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live from Chiplun</h2>
              <div className="space-y-4">
                {marketplace.map(store => (
                  <div key={store.id} onClick={() => { setActiveStore(store); setView('detail'); setActiveCart(null); setBookForm({ custName: '', date:'', time:'', phone:'', resId:'', seats:1 }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50 shadow-inner" alt={store.name} />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-tighter">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight uppercase mt-1">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: LIVE TRACKER */}
        {view === 'track' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Live Queue Tracking</h2>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                 <input placeholder="Enter Token ID (e.g. CH-X2A)" value={trackInput} onChange={e => setTrackInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black text-center outline-none tracking-widest" />
                 <button onClick={() => { const found = bookings.find(x => x.displayId === trackInput); if(found) setActiveReceipt(found); else notify("Token not found", "error"); }} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg">Locate My Spot</button>
              </div>

              {liveTracker && !liveTracker.error ? (
                <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black italic shadow-inner">{liveTracker.pos}</div>
                   <div>
                      <h3 className="text-3xl font-black tracking-tighter uppercase italic">{liveTracker.displayId}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Passenger: {liveTracker.custName}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase">Users Ahead</p>
                         <p className="text-xl font-black text-emerald-600">{liveTracker.pos - 1}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase">Est. Wait</p>
                         <p className="text-xl font-black text-blue-600">{liveTracker.wait}m</p>
                      </div>
                   </div>
                   <button onClick={() => setView('home')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Explorer Mode</button>
                </div>
              ) : activeReceipt && <p className="text-center text-rose-500 font-black uppercase text-[10px] tracking-widest py-10">Token has been completed or removed</p>}
           </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD (IMAGE UPLOAD & LEDGER) */}
        {view === 'merchant' && merchantData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90 transition-all"><Lucide.LogOut size={20}/></button>
            </div>

            {/* LIVE SWITCH & IMAGE UPLOAD */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex flex-col justify-between shadow-lg h-44">
                 <div><p className="text-[8px] font-black uppercase opacity-50 mb-1">Status</p><p className="text-lg font-black uppercase italic tracking-tighter leading-none">{merchantData.store.isLive ? 'Publicly Live' : 'Hidden Mode'}</p></div>
                 <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !merchantData.store.isLive })} className={`w-14 h-8 rounded-full p-1 transition-all ${merchantData.store.isLive ? 'bg-emerald-600' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all bg-white ${merchantData.store.isLive ? 'ml-6' : 'ml-0'}`} /></button>
              </div>
              <div className="bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-lg relative group overflow-hidden h-44">
                 <img src={merchantData.store.image} className="w-full h-full object-cover rounded-[2rem] opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0 transition-all" alt="Business" />
                 <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                    <Lucide.Camera size={24} className="text-slate-800" />
                    <span className="text-[8px] font-black uppercase mt-2 text-slate-800">Update Photo</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                 </label>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                {['ledger', 'assets', 'prices'].map(t => (
                    <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>
                      {t === 'assets' ? (merchantData.store.category === 'salon' ? 'Staff' : 'Fleet') : t}
                    </button>
                ))}
            </div>

            {/* TAB: LEDGER (CALL/COMPLETE/CANCEL) */}
            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20 px-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">REVENUE</p><p className="text-2xl font-black text-emerald-600 italic">₹{merchantData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">WAITING</p><p className="text-2xl font-black text-blue-600 italic">{merchantData.queue.length}</p></div>
                  </div>
                  {merchantData.queue.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm space-y-4 animate-in slide-in-from-left-4">
                      <div className="flex justify-between items-start">
                        <div>
                           <p className="font-black text-sm uppercase italic tracking-tight leading-none">{b.custName || 'Guest User'}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">{b.serviceName} • {b.time}</p>
                           <p className="text-[8px] text-blue-600 font-black uppercase mt-1">Status: Paid via {b.payment}</p>
                        </div>
                        <span className="bg-slate-50 px-2 py-1 rounded text-[10px] font-black italic">#{b.displayId}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`tel:${b.phone}`)} className="flex-1 p-3 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center gap-2"><Lucide.Phone size={16}/><span className="text-[9px] font-black uppercase">Call</span></button>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="flex-1 p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center gap-2"><Lucide.CheckCircle2 size={16}/><span className="text-[9px] font-black uppercase">Complete</span></button>
                        <button onClick={async () => { if(window.confirm("Cancel Booking? Capacity will be restored.")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id)); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl transition-all active:scale-90"><Lucide.X size={18}/></button>
                      </div>
                    </div>
                  ))}
               </section>
            )}

            {/* TAB: ASSETS */}
            {mTab === 'assets' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                <button onClick={() => {
                   const n = prompt(merchantData.store.category === 'salon' ? "Staff Name:" : "Trip (e.g. Mumbai 9AM Bus):");
                   const t = merchantData.store.category === 'travel' ? prompt("Starting Time (e.g. 09:00 AM):") : "";
                   const c = merchantData.store.category === 'travel' ? prompt("Total Seats Available:") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, time: t, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all">+ Add Asset</button>
                <div className="space-y-3">
                   {merchantData.store.resources?.map((r, i) => (
                     <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div><p className="font-black text-xs uppercase italic leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Leaves: {r.time} • Capacity: {r.capacity}</p>}</div>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90"><Lucide.Trash2 size={16}/></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {/* TAB: PRICES */}
            {mTab === 'prices' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                  <button onClick={() => {
                     const n = prompt("Item Description:");
                     const p = prompt("Fixed Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300">+ Add New Price Point</button>
                  <div className="space-y-3">
                     {merchantData.store.services?.map((s, i) => (
                       <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                          <p className="font-black text-xs uppercase italic leading-none">{s.name} • ₹{s.price}</p>
                          <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="p-2 text-rose-500 active:scale-90"><Lucide.X size={16}/></button>
                       </div>
                     ))}
                  </div>
               </div>
            )}
          </div>
        )}

        {/* VIEW: DETAIL (USER BOOKING ENGINE) */}
        {view === 'detail' && activeStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest px-2"><Lucide.ArrowLeft size={16} className="mr-2"/> Back</button>
            <div className="relative mx-1">
              <img src={activeStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl shadow-emerald-900/10" alt={activeStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{activeStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><Lucide.MapPin size={12} className="mr-1"/> {activeStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4 mx-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Select Service</h3>
              <div className="space-y-2">
                {activeStore.services?.length > 0 ? activeStore.services.map((s, idx) => (
                  <div key={idx} onClick={() => setActiveCart(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${activeCart?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                )) : <p className="text-center text-[9px] text-slate-300 font-black uppercase py-4 tracking-widest">Waiting for Merchant</p>}
              </div>
            </section>

            {activeCart && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5 mx-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Details</h3>
                  
                  <input placeholder="Your Full Name" value={bookForm.custName} onChange={e => setBookForm({...bookForm, custName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[11px] border border-slate-100 uppercase tracking-widest shadow-inner" />

                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Available {activeStore.category === 'salon' ? 'Staff' : 'Slots'}</label>
                    <div className="space-y-2">
                      {activeStore.resources?.map(r => {
                        const { count, left } = getCapacity(activeStore.id, r.id, r.capacity);
                        const isFull = activeStore.category === 'travel' && left <= 0;
                        return (
                          <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed' : ''}`}>
                            <div className="text-left">
                               <p className="font-black text-[10px] uppercase italic leading-none">{r.name}</p>
                               {r.time && <p className="text-[8px] font-bold text-blue-500 mt-1 uppercase tracking-widest leading-none">Timing: {r.time}</p>}
                            </div>
                            <span className={`text-[8px] font-black uppercase tracking-tighter ${isFull ? 'text-rose-500' : 'text-emerald-600'} leading-none`}>
                              {activeStore.category === 'salon' ? `Queue: ${count}` : isFull ? 'Full' : `${left} Seats Left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {activeStore.category === 'travel' && bookForm.resId && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Seats Needed</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                    {activeStore.category === 'salon' && (
                       <input type="time" onChange={e => setBookForm({...bookForm, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                    )}
                  </div>
                  <input placeholder="WhatsApp Number" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner" />
                  <button disabled={!bookForm.date || (!bookForm.time && activeStore.category === 'salon') || !bookForm.phone || !bookForm.resId || !bookForm.custName} onClick={() => setShowPayment(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Review Payment</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: ADMIN (Manual Provisioning) */}
        {view === 'admin' && (
           <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">System Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <input type="password" placeholder="Admin PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else notify("Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Verify Admin Access</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1">
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Live ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm animate-in slide-in-from-bottom-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight leading-none">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                          <button onClick={async () => {
                             const mId = prompt("Manual Merchant ID:");
                             const key = prompt("Security Key:");
                             if (mId && key) {
                               setIsProcessing(true);
                               const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
                               await setDoc(sRef, { name: r.bizName, category: r.category, address: r.address, isLive: false, merchantId: mId.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
                               await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mId.toUpperCase()), { storeId: sRef.id, businessName: r.bizName, password: key });
                               await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id));
                               setIsProcessing(false); notify("Approved");
                             }
                          }} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95 tracking-widest">Manual Approve</button>
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

      </main>

      {/* PAYMENT & CONFIRM MODALS */}
      {showPayment && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter leading-none italic">Select Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("Online Payments Disabled in Trial", "error")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50">
                    <span className="font-black text-[10px] uppercase">Online Payment</span>
                    <span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black uppercase">SOON</span>
                 </button>
                 <button onClick={() => setShowFinalConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all">
                    <span className="font-black text-sm uppercase">Pay with Cash</span>
                    <Lucide.Banknote size={20} />
                 </button>
              </div>
              <button onClick={() => setShowPayment(false)} className="text-[10px] font-black uppercase text-slate-400">Back</button>
           </div>
        </div>
      )}

      {showFinalConfirm && (
        <div className="fixed inset-0 bg-emerald-600 z-[1001] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200 text-white">
           <div className="text-center space-y-8">
              <Lucide.AlertCircle size={80} className="mx-auto animate-bounce" />
              <div className="space-y-2">
                 <h3 className="text-4xl font-black uppercase italic tracking-tighter leading-none">Are you sure?</h3>
                 <p className="text-sm font-bold uppercase opacity-70 tracking-widest leading-none">Confirming will lock your spot</p>
              </div>
              <div className="space-y-3 pt-6">
                 <button onClick={handleBookingSubmit} className="w-64 py-6 bg-white text-emerald-600 rounded-full font-black uppercase shadow-2xl active:scale-90 transition-all text-lg tracking-widest italic">YES, CONFIRM</button>
                 <button onClick={() => setShowFinalConfirm(false)} className="block w-full py-4 text-white/50 font-black uppercase text-xs tracking-widest">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Compass size={24} /></button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Ticket size={24} /></button>
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

