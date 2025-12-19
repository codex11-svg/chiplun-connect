import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'chiplun-supreme-final-v50';
const ADMIN_PIN = "112607";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  const [search, setSearch] = useState('');
  const [selStore, setSelStore] = useState(null);
  const [selService, setSelService] = useState(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [mTab, setMTab] = useState('ledger'); 
  const [hubView, setHubView] = useState('login');

  const [bookForm, setBookForm] = useState({ name: '', date: '', time: '', phone: '', resId: '', seats: 1 });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);

  const [showPay, setShowPay] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const notify = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- FIREBASE CORE ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    onAuthStateChanged(auth, (u) => setUser(u));
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
    setTimeout(() => setLoading(false), 1000);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- CALCULATIONS ---
  const marketplace = useMemo(() => stores.filter(s => s.isLive && (s.name?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase()))), [stores, search]);
  
  const mData = useMemo(() => {
    if (!profile?.businessId || stores.length === 0) return null;
    const s = stores.find(x => x.id === profile.businessId);
    if (!s) return null;
    const bPending = bookings.filter(x => x.storeId === profile.businessId && x.status === 'pending').sort((a,b) => a.timestamp - b.timestamp);
    const bCompleted = bookings.filter(x => x.storeId === profile.businessId && x.status === 'completed');
    return { store: s, queue: bPending, rev: bCompleted.reduce((a,c) => a + (Number(c.totalPrice) || 0), 0) };
  }, [bookings, profile, stores]);

  const getCap = (sId, rId, total) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const taken = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(total) || 0) - taken };
  };

  const isTimeInPast = useMemo(() => {
    if (!bookForm.date || !bookForm.time || selStore?.category !== 'salon') return false;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (bookForm.date !== today) return false;
    const clock = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    return bookForm.time < clock;
  }, [bookForm.date, bookForm.time, selStore]);

  const liveTracker = useMemo(() => {
    if (!activeReceipt) return null;
    const live = bookings.find(b => b.displayId === activeReceipt.displayId);
    if (!live || live.status !== 'pending') return { error: 'Not Active' };
    const ahead = bookings.filter(b => b.storeId === live.storeId && b.resId === live.resId && b.status === 'pending' && b.timestamp < live.timestamp);
    return { ...live, pos: ahead.length + 1, wait: ahead.length * 20 };
  }, [bookings, activeReceipt]);

  // --- HANDLERS ---
  const handleBookingExecution = async () => {
    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const unit = Number(selService.price);
      const total = selStore.category === 'travel' ? (unit * (bookForm.seats || 1)) : unit;
      
      let finalTime = bookForm.time;
      if (selStore.category === 'travel') {
         const trip = selStore.resources?.find(r => r.id === bookForm.resId);
         finalTime = trip?.time || "9:00 AM";
      }

      const payload = { ...bookForm, time: finalTime, displayId: id, storeId: selStore.id, storeName: selStore.name, serviceName: selService.name, totalPrice: total, status: 'pending', timestamp: Date.now(), payment: 'Cash' };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setActiveReceipt(payload);
      setShowConfirm(false);
      setShowPay(false);
      setView('track');
    } catch (e) { notify("Error", "error"); }
    setIsProcessing(false);
  };

  const handleVLogin = async () => {
    setIsProcessing(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase()));
      if (snap.exists() && snap.data().password === vLogin.pass) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
        setView('merchant');
        notify("Logged In");
      } else notify("Access Denied", "error");
    } catch (e) { notify("Error", "error"); }
    setIsProcessing(false);
  };

  const handleAdminApprove = async (req) => {
    const mId = prompt("Assigned Merchant ID:");
    const key = prompt("Assigned Security Key:");
    if (!mId || !key) return;
    setIsProcessing(true);
    try {
      const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
      await setDoc(sRef, { name: req.bizName, category: req.category, address: req.address, isLive: false, merchantId: mId.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mId.toUpperCase()), { storeId: sRef.id, businessName: req.bizName, password: key });
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
      notify("Authorized!");
    } catch (e) { notify("Error", "error"); }
    setIsProcessing(false);
  };

  const handleImage = async (e) => {
    const file = e.target.files[0];
    if (!file || file.size > 1000000) return notify("Image too large", "error");
    const reader = new FileReader();
    reader.onloadend = async () => {
       const img = new Image(); img.src = reader.result;
       img.onload = async () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_W = 800; const scale = MAX_W / img.width;
          canvas.width = MAX_W; canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { image: canvas.toDataURL('image/jpeg', 0.7) });
          notify("Image Updated!");
       };
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-[0.5em]">CHIPLUN CONNECT</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Master V50 Final</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('admin')} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/10 text-white border border-white/10 active:bg-white active:text-emerald-600 transition-all"><Lucide.Shield size={18} /></button>
            <button 
              onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'business' || view === 'merchant' ? 'bg-white text-emerald-600 border-white shadow-inner' : 'bg-white/10 text-white'}`}
            >
              <Lucide.Briefcase size={20} />
            </button>
          </div>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Search agencies or salons..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none" />
          </div>
        )}
      </header>

      {/* TOAST */}
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
               <button onClick={() => setSearch('salon')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Scissors size={20} className="text-rose-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 leading-none">Salon</span></button>
               <button onClick={() => setSearch('travel')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Bus size={20} className="text-blue-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 leading-none">Travel</span></button>
               <button onClick={() => setView('track')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Ticket size={20} className="text-emerald-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 leading-none">Tracker</span></button>
               <button onClick={() => notify("Coming Soon", "info")} className="flex flex-col items-center gap-2 opacity-30"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Plus size={20}/></div><span className="text-[9px] font-black uppercase text-slate-400 leading-none">More</span></button>
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Verified marketplace</h2>
              <div className="space-y-4">
                {marketplace.map(store => (
                  <div key={store.id} onClick={() => { setSelStore(store); setView('detail'); setSelService(null); setBookForm({ name: '', date:'', time:'', phone:'', resId:'', seats:1 }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 group active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50 shadow-inner" alt={store.name} />
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

        {/* VIEW: LIVE TRACKER */}
        {view === 'track' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Live Position Search</h2>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                 <input placeholder="CH-XXXX Token ID" value={trackInput} onChange={e => setTrackInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black text-center outline-none tracking-widest" />
                 <button onClick={() => { const b = bookings.find(x => x.displayId === trackInput); if(b) setActiveReceipt(b); else notify("Token not found", "error"); }} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg">View My Spot</button>
              </div>

              {liveTracker && !liveTracker.error ? (
                <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black italic shadow-inner border border-emerald-100">{liveTracker.pos}</div>
                   <div>
                      <h3 className="text-3xl font-black tracking-tighter uppercase italic">{liveTracker.displayId}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Passenger: {liveTracker.name}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rank</p>
                         <p className="text-xl font-black text-emerald-600">{liveTracker.pos === 1 ? "NEXT" : (liveTracker.pos - 1) + " People"}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Arrival</p>
                         <p className="text-xl font-black text-blue-600">~{liveTracker.wait}m</p>
                      </div>
                   </div>
                   <button onClick={() => setView('home')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] active:scale-95 transition-all">Go to Home</button>
                </div>
              ) : activeReceipt && <p className="text-center text-rose-500 font-black uppercase text-[10px] py-10">Searching...</p>}
           </div>
        )}

        {/* VIEW: MERCHANT */}
        {view === 'merchant' && mData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><Lucide.LogOut size={20}/></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex flex-col justify-between shadow-lg h-44">
                 <div><p className="text-[8px] font-black uppercase opacity-50 mb-1 tracking-widest">VISIBILITY</p><p className="text-lg font-black uppercase italic tracking-tighter leading-none">{mData.store.isLive ? 'Online' : 'Offline'}</p></div>
                 <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !mData.store.isLive })} className={`w-14 h-8 rounded-full p-1 transition-all ${mData.store.isLive ? 'bg-emerald-600' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all bg-white ${mData.store.isLive ? 'ml-6' : 'ml-0'}`} /></button>
              </div>
              <div className="bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-lg relative overflow-hidden h-44 group">
                 <img src={mData.store.image} className="w-full h-full object-cover rounded-[2rem] opacity-50 transition-all" alt="Business" />
                 <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                    <Lucide.Camera size={24} className="text-slate-800" />
                    <span className="text-[8px] font-black uppercase mt-1 text-slate-800">Upload Logo</span>
                    <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
                 </label>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                {['ledger', 'assets', 'prices'].map(t => (
                    <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>
                      {t === 'assets' ? (mData.store.category === 'salon' ? 'Staff' : 'Fleets') : t}
                    </button>
                ))}
            </div>

            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20 px-1">
                  <div className="grid grid-cols-2 gap-4 px-1">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 uppercase">TOTAL EARNED</p><p className="text-2xl font-black text-emerald-600 italic">₹{mData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 uppercase">PENDING</p><p className="text-2xl font-black text-blue-600 italic">{mData.queue.length}</p></div>
                  </div>
                  {mData.queue.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm space-y-4 animate-in slide-in-from-left-4">
                      <div className="flex justify-between items-start">
                        <div>
                           <p className="font-black text-sm uppercase italic leading-none">{b.name || 'User'}</p>
                           <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 tracking-tight">{b.serviceName} • {b.time}</p>
                           <p className="text-[8px] text-blue-600 font-black uppercase mt-1 tracking-widest italic">{b.seats || 1} Seats • Cash</p>
                        </div>
                        <span className="bg-slate-50 px-2 py-1 rounded text-[10px] font-black italic tracking-widest">#{b.displayId}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`tel:${b.phone}`)} className="flex-1 p-3 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><Lucide.Phone size={16}/><span className="text-[9px] font-black uppercase">Call</span></button>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="flex-1 p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><Lucide.CheckCircle2 size={16}/><span className="text-[9px] font-black uppercase tracking-widest">Complete</span></button>
                        <button onClick={async () => { if(window.confirm("Cancel Booking? Inventory will restore instantly.")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id)); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><Lucide.Trash2 size={18}/></button>
                      </div>
                    </div>
                  ))}
               </section>
            )}

            {mTab === 'assets' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                <button onClick={() => {
                   const n = prompt(mData.store.category === 'salon' ? "Staff Name:" : "Trip Description (e.g. Mumbai 9AM):");
                   const t = mData.store.category === 'travel' ? prompt("Starting Time (e.g. 09:30 AM):") : "";
                   const c = mData.store.category === 'travel' ? prompt("Car Seat Capacity:") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, time: t, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Asset</button>
                <div className="space-y-3">
                   {mData.store.resources?.map((r, i) => (
                     <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                        <div><p className="font-black text-xs uppercase italic leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Leaves: {r.time} • Seats: {r.capacity}</p>}</div>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90"><Lucide.Trash2 size={16}/></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {mTab === 'prices' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                  <button onClick={() => {
                     const n = prompt("Item (e.g. Premium Haircut / Khed to Mumbai):");
                     const p = prompt("Fixed Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Price Entry</button>
                  <div className="space-y-3">
                     {mData.store.services?.map((s, i) => (
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

        {/* VIEW: ADMIN Master Terminal (FIXED PIN) */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">Admin Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <input type="password" placeholder="System PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none tracking-widest" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else notify("Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Authorize Session</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1">
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Live ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm animate-in slide-in-from-bottom-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                          <button onClick={() => handleAdminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95 transition-all">Approve</button>
                        </div>
                    </div>
                 )) : stores.map(s => (
                    <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center animate-in fade-in">
                       <div><h4 className="font-black text-xs uppercase italic leading-none">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1 uppercase tracking-widest">ID: {s.merchantId}</p></div>
                       <button onClick={() => { if(window.confirm("Purge Store?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="p-2 bg-slate-50 rounded-lg text-rose-600 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                    </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL */}
        {view === 'detail' && selStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 px-1 pb-32">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest active:scale-95 px-2"><Lucide.ArrowLeft size={16} className="mr-2"/> Back explorer</button>
            <div className="relative mx-1">
              <img src={selStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl shadow-emerald-900/10" alt={selStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><Lucide.MapPin size={12} className="mr-1"/> {selStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Select Service</h3>
              <div className="space-y-2">
                {selStore.services?.map((s, idx) => (
                  <div key={idx} onClick={() => setSelService(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${selService?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>

            {selService && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Selection</h3>
                  <input placeholder="Your Full Name" value={bookForm.name} onChange={e => setBookForm({...bookForm, name: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[11px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none focus:border-emerald-500" />

                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Select {selStore.category === 'salon' ? 'Professional' : 'Trip Timing'}</label>
                    {selStore.resources?.map(r => {
                      const { count, left } = getCap(selStore.id, r.id, r.capacity);
                      const isFull = selStore.category === 'travel' && left <= 0;
                      return (
                        <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}>
                          <div className="text-left"><p className="font-black text-[10px] uppercase italic tracking-tight leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-blue-500 mt-1 uppercase">Trip at {r.time}</p>}</div>
                          <span className={`text-[8px] font-black uppercase tracking-tighter ${isFull ? 'text-rose-500' : 'text-emerald-600'}`}>{selStore.category === 'salon' ? `Queue: ${count}` : isFull ? 'FULL' : `${left} S Left`}</span>
                        </div>
                      );
                    })}
                  </div>

                  {selStore.category === 'travel' && bookForm.resId && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Seats Needed</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" value={bookForm.date} onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    {selStore.category === 'salon' && (
                       <input type="time" value={bookForm.time} onChange={e => {
                          const now = new Date(); const today = now.toISOString().split('T')[0];
                          const clock = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
                          if (bookForm.date === today && e.target.value < clock) notify("Cannot book past time!", "error");
                          else setBookForm({...bookForm, time: e.target.value});
                       }} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    )}
                  </div>
                  <input placeholder="WhatsApp Phone" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none" />
                  <button disabled={!bookForm.date || (!bookForm.time && selStore.category === 'salon') || !bookForm.phone || !bookForm.resId || !bookForm.name || isTimeInPast} onClick={() => setShowPay(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Issue Booking Token</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && profile.role !== 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">Partner Center</h2></div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative mx-1">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 ${hubMode === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setHubMode('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubMode === 'register' ? 'text-white' : 'text-slate-500'}`}>New Partner</button>
               <button onClick={() => setHubMode('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubMode === 'login' ? 'text-white' : 'text-slate-50'}`}>Login</button>
            </div>
            {hubMode === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 mx-1">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Shop Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="WhatsApp Number" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none appearance-none">
                  <option value="salon">Salon</option><option value="travel">Travel Agency</option>
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Chiplun Area Location" />
                <button onClick={() => { setIsProcessing(true); addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() }).then(() => { notify("Wait for Admin Review!"); setView('home'); setIsProcessing(false); }) }} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-[0.97] transition-all shadow-xl">Apply Now</button>
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

      </main>

      {/* MODALS: PAYMENT & CONFIRM */}
      {showPay && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter leading-none italic">Select Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("Digital Gateway Coming Soon", "error")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50">
                    <span className="font-black text-[10px] uppercase tracking-widest">Online Payment</span>
                    <span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black uppercase tracking-widest">SOON</span>
                 </button>
                 <button onClick={() => setShowConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all">
                    <span className="font-black text-sm uppercase tracking-widest">Confirm with Cash</span>
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
                 <p className="text-sm font-bold uppercase opacity-70 tracking-widest leading-none">Confirm to generate Token</p>
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

