import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  getDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- PRODUCTION CONFIGURATION ---
const firebaseConfig = { 
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
const appId = "chiplun-v50-supreme-production";
const MASTER_ADMIN_UID = "mno2A46Df1fKmme9JSqPE9CMFB02";

export default function App() {
  // Global States
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Data States
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // UI States
  const [search, setSearch] = useState('');
  const [selStore, setSelStore] = useState(null);
  const [selService, setSelService] = useState(null);
  const [mTab, setMTab] = useState('ledger'); 
  const [hubMode, setHubMode] = useState('login');

  // Admin Login States
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminTab, setAdminTab] = useState('requests');

  // Form States
  const [bookForm, setBookForm] = useState({ name: '', date: '', time: '', phone: '', resId: '', seats: 1 });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);

  // Modal States
  const [showPay, setShowPay] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const notify = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const isAdmin = user?.uid === MASTER_ADMIN_UID;

  // --- AUTH OBSERVER ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // --- DATA HYDRATION (STRICT GUARDS) ---
  useEffect(() => {
    const root = ['artifacts', appId];
    
    // Public Snapshots
    const unsubPublic = [
      onSnapshot(collection(db, ...root, 'public', 'data', 'stores'), (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, ...root, 'public', 'data', 'bookings'), (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];

    // Authenticated Snapshots
    let unsubPrivate = [];
    if (user) {
      unsubPrivate.push(
        onSnapshot(doc(db, ...root, 'users', user.uid, 'profile', 'data'), (s) => {
          if (s.exists()) setProfile(s.data());
          else setDoc(doc(db, ...root, 'users', user.uid, 'profile', 'data'), { role: 'customer', uid: user.uid });
        })
      );

      if (isAdmin) {
        unsubPrivate.push(
          onSnapshot(collection(db, ...root, 'public', 'data', 'requests'), (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
        );
      }
    }

    const timer = setTimeout(() => setLoading(false), 1200);
    return () => { 
      unsubPublic.forEach(f => f()); 
      unsubPrivate.forEach(f => f());
      clearTimeout(timer); 
    };
  }, [user, isAdmin]);

  // --- LOGIC CALCULATIONS ---
  const marketplace = useMemo(() => (stores || []).filter(s => 
    s?.isLive && (s?.name?.toLowerCase().includes(search.toLowerCase()) || s?.category?.toLowerCase().includes(search.toLowerCase()))
  ), [stores, search]);

  const merchantData = useMemo(() => {
    if (!profile?.businessId || !stores.length) return null;
    const s = stores.find(x => x.id === profile.businessId);
    if (!s) return null;
    const bPending = bookings.filter(x => x.storeId === profile.businessId && x.status === 'pending').sort((a,b) => a.timestamp - b.timestamp);
    const revTotal = bookings.filter(x => x.storeId === profile.businessId && x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0);
    return { store: s, queue: bPending, rev: revTotal };
  }, [bookings, profile, stores]);

  const checkCap = (sId, rId, total) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const taken = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(total) || 0) - taken };
  };

  const isCheatDetected = useMemo(() => {
    if (!bookForm.date || !bookForm.time || selStore?.category !== 'salon') return false;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (bookForm.date !== todayStr) return false;
    const clock = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    return bookForm.time < clock;
  }, [bookForm, selStore]);

  const liveTracker = useMemo(() => {
    if (!activeReceipt) return null;
    const live = bookings.find(b => b.displayId === activeReceipt.displayId);
    if (!live || live.status !== 'pending') return { error: true };
    const ahead = bookings.filter(b => b.storeId === live.storeId && b.resId === live.resId && b.status === 'pending' && b.timestamp < live.timestamp);
    return { ...live, pos: ahead.length + 1, wait: ahead.length * 20 };
  }, [bookings, activeReceipt]);

  // --- HANDLERS ---
  const handleAdminLogin = async () => {
    if (!adminEmail || !adminPass) return notify("Enter email and password", "error");
    setIsProcessing(true);
    try {
      const res = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      if (res.user.uid !== MASTER_ADMIN_UID) {
        await signOut(auth);
        notify("Not authorized", "error");
      } else {
        notify("Access Granted");
      }
    } catch (e) { notify("Authentication Failed", "error"); }
    setIsProcessing(false);
  };

  const handleBookingConfirm = async () => {
    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const unit = Number(selService.price);
      const total = selStore.category === 'travel' ? (unit * (bookForm.seats || 1)) : unit;
      
      let finalTime = bookForm.time;
      if (selStore.category === 'travel') {
         const trip = selStore.resources?.find(r => r.id === bookForm.resId);
         finalTime = trip?.time || "N/A";
      }

      const payload = { ...bookForm, time: finalTime, displayId: id, storeId: selStore.id, storeName: selStore.name, serviceName: selService.name, totalPrice: total, status: 'pending', timestamp: Date.now(), payment: 'Cash' };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setActiveReceipt(payload);
      setShowConfirm(false);
      setShowPay(false);
      setView('track');
    } catch (e) { notify("Sync Error", "error"); }
    setIsProcessing(false);
  };

  const handleImage = async (e) => {
    const file = e.target.files[0];
    if (!file || file.size > 1000000) return notify("Image too large (Max 1MB)", "error");
    const reader = new FileReader();
    reader.onloadend = async () => {
       const img = new Image(); img.src = reader.result;
       img.onload = async () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_W = 800; const scale = MAX_W / img.width;
          canvas.width = MAX_W; canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { image: canvas.toDataURL('image/jpeg', 0.6) });
          notify("Image Updated!");
       };
    };
    reader.readAsDataURL(file);
  };

  const handleVLogin = async () => {
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase()));
    if (snap.exists() && snap.data().password === vLogin.pass) {
      await setProfile({ role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
      setView('merchant');
      notify("Welcome back");
    } else notify("Access Denied", "error");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse tracking-[0.5em]">CHIPLUNCONNECT</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1 italic">V50 Final Master</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('admin')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'admin' ? 'bg-white text-emerald-600' : 'bg-white/10 text-white border-white/10'}`}><Lucide.Shield size={18} /></button>
            <button onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'merchant' || view === 'business' ? 'bg-white text-emerald-600' : 'bg-white/10 text-white'}`}><Lucide.Briefcase size={20} /></button>
          </div>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Search agencies or salons..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[500] animate-in slide-in-from-top-4">
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
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live Chiplun Partners</h2>
              <div className="space-y-4">
                {(marketplace || []).map(store => (
                  <div key={store.id} onClick={() => { setSelStore(store); setView('detail'); setSelService(null); setBookForm({ name: '', date:'', time:'', phone:'', resId:'', seats:1 }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 group active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-tighter">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight uppercase mt-1 italic">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: TRACKER */}
        {view === 'track' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Live Token Tracker</h2>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                 <input placeholder="CH-XXXX Token ID" value={trackInput} onChange={e => setTrackInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black text-center outline-none tracking-widest focus:border-emerald-500" />
                 <button onClick={() => { const b = bookings.find(x => x.displayId === trackInput); if(b) setActiveReceipt(b); else notify("Token not found", "error"); }} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95">Locate Position</button>
              </div>

              {liveTracker && !liveTracker.error ? (
                <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black italic shadow-inner">{liveTracker.pos}</div>
                   <div>
                      <h3 className="text-3xl font-black tracking-tighter uppercase italic">{liveTracker.displayId}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Passenger: {liveTracker.name}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Wait Rank</p>
                         <p className="text-xl font-black text-emerald-600">{liveTracker.pos === 1 ? "NEXT" : (liveTracker.pos - 1) + " People"}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Est. Wait</p>
                         <p className="text-xl font-black text-blue-600">~{liveTracker.wait}m</p>
                      </div>
                   </div>
                   <button onClick={() => setView('home')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] active:scale-95 transition-all">Back to explorer</button>
                </div>
              ) : activeReceipt && <p className="text-center text-rose-500 font-black uppercase text-[10px] py-10 italic">This booking is no longer active.</p>}
           </div>
        )}

        {/* VIEW: MERCHANT */}
        {view === 'merchant' && merchantData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><Lucide.LogOut size={20}/></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex flex-col justify-between shadow-lg h-44">
                 <div><p className="text-[8px] font-black uppercase opacity-50 mb-1 tracking-widest">STATUS</p><p className="text-lg font-black uppercase italic tracking-tighter leading-none">{merchantData.store.isLive ? 'Online' : 'Offline'}</p></div>
                 <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !merchantData.store.isLive })} className={`w-14 h-8 rounded-full p-1 transition-all ${merchantData.store.isLive ? 'bg-emerald-600' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all bg-white ${merchantData.store.isLive ? 'ml-6' : 'ml-0'}`} /></button>
              </div>
              <div className="bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-lg relative overflow-hidden h-44 group">
                 <img src={merchantData.store.image} className="w-full h-full object-cover rounded-[2rem] opacity-50 transition-all" alt="Store" />
                 <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                    <Lucide.Camera size={24} className="text-slate-800" />
                    <span className="text-[8px] font-black uppercase mt-1 text-slate-800">Update photo</span>
                    <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                 </label>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                {['ledger', 'assets', 'prices'].map(t => (
                    <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>
                      {t === 'assets' ? (merchantData.store.category === 'salon' ? 'Staff' : 'Fleets') : t}
                    </button>
                ))}
            </div>

            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20 px-1 animate-in fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 uppercase">Total Sales</p><p className="text-2xl font-black text-emerald-600 italic leading-none">₹{merchantData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 uppercase">Pending</p><p className="text-2xl font-black text-blue-600 italic leading-none">{merchantData.queue.length}</p></div>
                  </div>
                  {merchantData.queue.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm space-y-4 animate-in slide-in-from-left-4">
                      <div className="flex justify-between items-start">
                        <div>
                           <p className="font-black text-sm uppercase italic leading-none">{b.name || 'User'}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-tight">{b.serviceName} • {b.time}</p>
                           <p className="text-[8px] text-blue-600 font-black uppercase mt-1 tracking-widest italic">{b.seats || 1} Seats • {b.payment}</p>
                        </div>
                        <span className="bg-slate-50 px-2 py-1 rounded text-[10px] font-black italic tracking-widest">#{b.displayId}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`tel:${b.phone}`)} className="flex-1 p-3 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><Lucide.Phone size={16}/><span className="text-[9px] font-black uppercase">Call</span></button>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="flex-1 p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><Lucide.CheckCircle2 size={16}/><span className="text-[9px] font-black uppercase tracking-widest">Done</span></button>
                        <button onClick={async () => { if(window.confirm("Cancel Booking? Seats restore instantly.")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id)); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><Lucide.X size={18}/></button>
                      </div>
                    </div>
                  ))}
               </section>
            )}

            {mTab === 'assets' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                <button onClick={() => {
                   const n = prompt(merchantData.store.category === 'salon' ? "Staff Name:" : "Trip Description:");
                   const t = merchantData.store.category === 'travel' ? prompt("Trip Time (e.g. 09:00 AM):") : "";
                   const c = merchantData.store.category === 'travel' ? prompt("Total Capacity:") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, time: t, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Resource</button>
                <div className="space-y-3">
                   {(merchantData.store.resources || []).map((r, i) => (
                     <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                        <div><p className="font-black text-xs uppercase italic leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Starts: {r.time} • Capacity: {r.capacity}</p>}</div>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90"><Lucide.Trash2 size={16}/></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {mTab === 'prices' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                  <button onClick={() => {
                     const n = prompt("Item Label:");
                     const p = prompt("Fixed Rate (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add New Entry</button>
                  <div className="space-y-3">
                     {(merchantData.store.services || []).map((s, i) => (
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

        {/* VIEW: ADMIN Master Terminal (FIXED POST-LOGIN WHITE SCREEN) */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">Admin terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Lucide.Home size={18}/></button>
             </div>
             {!isAdmin ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <Lucide.Lock size={32} className="mx-auto text-rose-600 opacity-20 mb-2" />
                 <input type="email" placeholder="Admin Email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full bg-slate-50 border p-5 rounded-2xl text-sm outline-none tracking-widest" />
                 <input type="password" placeholder="Password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} className="w-full bg-slate-50 border p-5 rounded-2xl text-sm outline-none tracking-widest" />
                 <button onClick={handleAdminLogin} disabled={isProcessing} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-[0.2em]">Verify Identity</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1 animate-in slide-in-from-bottom-8">
                 <div className="flex justify-between items-center bg-rose-50 p-4 rounded-2xl border border-rose-100">
                    <span className="text-[8px] font-black uppercase text-rose-600">Logged in as Master</span>
                    <button onClick={() => signOut(auth)} className="text-[8px] font-black uppercase bg-white border border-rose-200 px-4 py-2 rounded-xl text-rose-600">Sign Out</button>
                 </div>
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Live ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm">
                        <h4 className="font-black text-sm uppercase italic tracking-tight leading-none">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                          <button onClick={() => handleAdminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95 transition-all italic">Approve</button>
                        </div>
                    </div>
                 )) : stores.map(s => (
                    <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center animate-in fade-in">
                       <div><h4 className="font-black text-xs uppercase italic leading-none">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1 uppercase tracking-widest leading-none">ID: {s.merchantId}</p></div>
                       <button onClick={() => { if(window.confirm("Purge Store Data?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="p-2 bg-slate-50 rounded-lg text-rose-600 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                    </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL */}
        {view === 'detail' && selStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 px-1 pb-32">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest px-2 active:scale-95 leading-none"><Lucide.ArrowLeft size={16} className="mr-2"/> Back Discovery</button>
            <div className="relative mx-1">
              <img src={selStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl shadow-emerald-900/10" alt={selStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><Lucide.MapPin size={12} className="mr-1"/> {selStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Select Service Type</h3>
              <div className="space-y-2">
                {(selStore.services || []).map((s, idx) => (
                  <div key={idx} onClick={() => setSelService(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${selService?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>

            {selService && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Details</h3>
                  <input placeholder="Your Full Name" value={bookForm.name} onChange={e => setBookForm({...bookForm, name: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[11px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none focus:border-emerald-500" />

                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Select {selStore.category === 'salon' ? 'Professional' : 'Trip timing'}</label>
                    <div className="space-y-2">
                      {(selStore.resources || []).map(r => {
                        const { count, left } = getCap(selStore.id, r.id, r.capacity);
                        const isFull = selStore.category === 'travel' && left <= 0;
                        return (
                          <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}>
                            <div className="text-left"><p className="font-black text-[10px] uppercase italic tracking-tight leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-blue-500 mt-1 uppercase tracking-widest leading-none">Leaves at {r.time}</p>}</div>
                            <span className={`text-[8px] font-black uppercase tracking-tighter ${isFull ? 'text-rose-500' : 'text-emerald-600'} leading-none`}>
                              {selStore.category === 'salon' ? `Wait Rank: ${count + 1}` : isFull ? 'FULL' : `${left} S Left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selStore.category === 'travel' && bookForm.resId && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Passenger Count</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" value={bookForm.date} onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    {selStore.category === 'salon' && (
                       <input type="time" value={bookForm.time} onChange={e => setBookForm({...bookForm, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    )}
                  </div>
                  <input placeholder="WhatsApp Number" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none" />
                  
                  {isCheatDetected ? (
                     <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-500 animate-in fade-in">
                        <Lucide.AlertCircle size={20} />
                        <span className="text-[10px] font-black uppercase tracking-tighter italic">Cannot select past time for today!</span>
                     </div>
                  ) : (
                    <button disabled={!bookForm.date || (!bookForm.time && selStore.category === 'salon') || !bookForm.phone || !bookForm.resId || !bookForm.name} onClick={() => setShowPay(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Proceed to Payment</button>
                  )}
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODALS */}
      {showPay && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter leading-none italic">Select Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("Digital Gateway Coming Soon", "error")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50">
                    <span className="font-black text-[10px] uppercase">Online Payment</span>
                    <span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black uppercase tracking-widest">SOON</span>
                 </button>
                 <button onClick={() => setShowConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all">
                    <span className="font-black text-sm uppercase tracking-widest">Pay with Cash</span>
                    <Lucide.Banknote size={20} />
                 </button>
              </div>
              <button onClick={() => setShowPay(false)} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cancel</button>
           </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-emerald-600 z-[1001] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200 text-white text-center">
           <div className="space-y-8">
              <Lucide.AlertCircle size={80} className="mx-auto animate-bounce" />
              <div className="space-y-2">
                 <h3 className="text-4xl font-black uppercase italic tracking-tighter">Are you sure?</h3>
                 <p className="text-sm font-bold uppercase opacity-70 tracking-widest leading-none">Confirm to generate Token ID</p>
              </div>
              <div className="space-y-3 pt-6">
                 <button onClick={handleBookingExecution} className="w-64 py-6 bg-white text-emerald-600 rounded-full font-black uppercase shadow-2xl active:scale-90 transition-all text-lg tracking-widest italic">YES, CONFIRM</button>
                 <button onClick={() => setShowConfirm(false)} className="block w-full py-4 text-white/50 font-black uppercase text-xs tracking-widest italic">Wait, go back</button>
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

