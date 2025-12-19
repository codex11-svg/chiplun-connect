import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
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
  arrayUnion, 
  arrayRemove,
  query
} from 'firebase/firestore';
import { 
  Search, Shield, Briefcase, Scissors, Bus, Ticket, Plus, 
  ChevronRight, MapPin, ArrowLeft, AlertCircle, Banknote, 
  Compass, Phone, CheckCircle2, X, Camera, Loader2, Trash2,
  LogOut, ShieldCheck, Lock, Mail
} from 'lucide-react';

// --- STABLE PRODUCTION CONFIG ---
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
const appId = "chiplun-pro-v50-master-ironclad";

// --- MASTER ADMIN IDENTITY ---
const MASTER_UID = "mno2A46Df1fKmme9JSqPE9CMFB02";

export default function App() {
  // Global Session States
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Database States
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // View States
  const [search, setSearch] = useState('');
  const [activeStore, setActiveStore] = useState(null);
  const [activeCart, setActiveCart] = useState(null); 
  const [adminTab, setAdminTab] = useState('requests');
  const [mTab, setMTab] = useState('ledger'); 
  const [hubView, setHubView] = useState('login');

  // Admin Login States
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');

  // Form Data
  const [bookForm, setBookForm] = useState({ custName: '', date: '', time: '', phone: '', resId: '', seats: 1 });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [trackId, setTrackId] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Flow Modals
  const [showPayment, setShowPayment] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const notify = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- AUTH BOOTSTRAP ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch(e) { console.error("Auth fail", e); }
      }
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- DATA HYDRATION ---
  useEffect(() => {
    if (!user) return;
    
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    const storesRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
    const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'bookings');
    const requestsRef = collection(db, 'artifacts', appId, 'public', 'data', 'requests');
    
    const unsubs = [
      onSnapshot(profileRef, (s) => {
        if (s.exists()) {
          setProfile(s.data());
        } else {
          setDoc(profileRef, { role: user.uid === MASTER_UID ? 'admin' : 'customer', uid: user.uid });
        }
      }, (err) => console.error("Profile error", err)),
      
      onSnapshot(storesRef, (s) => {
        setStores(s.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("Stores error", err)),
      
      onSnapshot(bookingsRef, (s) => {
        setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("Bookings error", err)),
      
      onSnapshot(requestsRef, (s) => {
        setRequests(s.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => console.error("Requests error", err))
    ];
    
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => { 
      unsubs.forEach(f => f()); 
      clearTimeout(timer); 
    };
  }, [user]);

  // --- ADMIN HANDLERS ---
  const handleAdminLogin = async () => {
    setIsProcessing(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      notify("Root Access Authorized");
    } catch (e) {
      notify("Login Failed", "error");
    }
    setIsProcessing(false);
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
      notify("Logged Out");
      setView('home');
    } catch (e) {
      notify("Error", "error");
    }
  };

  // --- LOGIC CALCULATIONS ---
  const marketplace = useMemo(() => (stores || []).filter(s => 
    s?.isLive && (
      s?.name?.toLowerCase().includes(search.toLowerCase()) || 
      s?.category?.toLowerCase().includes(search.toLowerCase())
    )
  ), [stores, search]);

  const merchantData = useMemo(() => {
    if (!profile?.businessId || !stores.length) return null;
    const s = stores.find(x => x.id === profile.businessId);
    if (!s) return null;
    const bPending = bookings.filter(x => x.storeId === profile.businessId && x.status === 'pending').sort((a,b) => a.timestamp - b.timestamp);
    const rev = bookings.filter(x => x.storeId === profile.businessId && x.status === 'completed').reduce((a,c) => a + (Number(c.totalPrice) || 0), 0);
    return { store: s, queue: bPending, rev };
  }, [bookings, profile, stores]);

  const checkAvailability = (sId, rId, cap) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const taken = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(cap) || 0) - taken };
  };

  const getCheatStatus = () => {
    if (!bookForm.date || !bookForm.time || activeStore?.category !== 'salon') return false;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (bookForm.date !== today) return false;
    const clock = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    return bookForm.time < clock;
  };

  const mySpot = useMemo(() => {
    if (!trackId) return null;
    const live = bookings.find(b => b.displayId === trackId);
    if (!live) return { error: true, msg: "Token not found" };
    if (live.status !== 'pending') return { error: true, msg: "Token already processed" };
    
    const ahead = bookings.filter(b => 
      b.storeId === live.storeId && 
      b.resId === live.resId && 
      b.status === 'pending' && 
      b.timestamp < live.timestamp
    );
    return { ...live, pos: ahead.length + 1, wait: ahead.length * 20 };
  }, [bookings, trackId]);

  // --- HANDLERS ---
  const handleVLogin = async () => {
    setIsProcessing(true);
    try {
      const credRef = doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase());
      const snap = await getDoc(credRef);
      if (snap.exists() && snap.data().password === vLogin.pass) {
        const data = snap.data();
        const newProfile = { ...profile, role: 'vendor', businessId: data.storeId, businessName: data.businessName };
        setProfile(newProfile);
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), newProfile);
        setView('merchant');
        notify("Access Granted");
      } else {
        notify("Invalid Credentials", "error");
      }
    } catch (e) {
      notify("Login Error", "error");
    }
    setIsProcessing(false);
  };

  const handleBookingExecution = async () => {
    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const unit = Number(activeCart?.price || 0);
      const total = activeStore.category === 'travel' ? (unit * (bookForm.seats || 1)) : unit;
      
      let finalTime = bookForm.time;
      if (activeStore.category === 'travel') {
         const trip = activeStore.resources?.find(r => r.id === bookForm.resId);
         finalTime = trip?.time || "Scheduled";
      }

      const payload = { 
        ...bookForm, 
        time: finalTime, 
        displayId: id, 
        storeId: activeStore.id, 
        storeName: activeStore.name, 
        serviceName: activeCart.name, 
        totalPrice: total, 
        status: 'pending', 
        timestamp: Date.now(), 
        payment: 'Cash' 
      };

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setReceipt(payload);
      setTrackId(id);
      setShowConfirm(false);
      setShowPayment(false);
      setView('track');
      notify("Booking Confirmed!");
    } catch (e) { 
      notify("Submission Error", "error"); 
    }
    setIsProcessing(false);
  };

  const adminApprove = async (req) => {
    const mid = prompt("Assign Merchant ID (e.g. CH-101):");
    const key = prompt("Assign Access Key:");
    if (!mid || !key) return;
    setIsProcessing(true);
    try {
      const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
      await setDoc(sRef, { 
        name: req.bizName, 
        category: req.category, 
        address: req.address, 
        isLive: false, 
        merchantId: mid.toUpperCase(), 
        image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", 
        services: [], 
        resources: [] 
      });
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mid.toUpperCase()), { 
        storeId: sRef.id, 
        businessName: req.bizName, 
        password: key 
      });
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
      notify("Approved!");
    } catch(e) { notify("Database Error", "error"); }
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
          const MAX_W = 800; const scale = MAX_W / img.width;
          canvas.width = MAX_W; canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { image: canvas.toDataURL('image/jpeg', 0.6) });
          notify("Image Updated!");
       };
    };
    reader.readAsDataURL(file);
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-[0.5em]">
      SYNCHRONIZING...
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Production V50</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('admin')} className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/10 border border-white/10 active:bg-white active:text-emerald-600"><Shield size={18} /></button>
            <button 
               onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
               className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'merchant' || view === 'business' ? 'bg-white text-emerald-600' : 'bg-white/10'}`}
            >
              <Briefcase size={20} />
            </button>
          </div>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input 
              type="text" 
              placeholder="Find verified Chiplun partners..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 transition-all shadow-inner" 
            />
          </div>
        )}
      </header>

      {/* NOTIFICATIONS */}
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
               <button onClick={() => setSearch('salon')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Scissors size={20} className="text-rose-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Salon</span></button>
               <button onClick={() => setSearch('travel')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Bus size={20} className="text-blue-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Travel</span></button>
               <button onClick={() => setView('track')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Ticket size={20} className="text-emerald-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Tracker</span></button>
               <button onClick={() => notify("More categories coming soon", "info")} className="flex flex-col items-center gap-2 opacity-30"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Plus size={20}/></div><span className="text-[9px] font-black uppercase text-slate-400">More</span></button>
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live from Chiplun</h2>
              <div className="space-y-4">
                {marketplace.map(store => (
                  <div key={store.id} onClick={() => { setActiveStore(store); setView('detail'); setActiveCart(null); setBookForm({ custName:'', date:'', time:'', phone:'', resId:'', seats:1 }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 group active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50 shadow-inner" alt={store.name} />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-tighter">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight uppercase mt-1 italic">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-200 group-hover:text-emerald-500" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: TRACKER */}
        {view === 'track' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Position Tracker</h2>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                 <input placeholder="CH-XXXX Token ID" value={trackId} onChange={e => setTrackId(e.target.value.toUpperCase())} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black text-center outline-none tracking-widest focus:border-emerald-500" />
                 <button className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg">Live Status Tracking</button>
              </div>

              {mySpot && !mySpot.error ? (
                <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black italic shadow-inner">{mySpot.pos}</div>
                   <div>
                      <h3 className="text-3xl font-black tracking-tighter uppercase italic">{mySpot.displayId}</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Confirmed for {mySpot.custName}</p>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
                         <p className="text-[8px] font-black text-slate-400 uppercase">Wait Rank</p>
                         <p className="text-xl font-black text-emerald-600">{mySpot.pos === 1 ? "NEXT" : (mySpot.pos - 1) + " People"}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner">
                         <p className="text-[8px] font-black text-slate-400 uppercase">Est. Minutes</p>
                         <p className="text-xl font-black text-blue-600">~{mySpot.wait}m</p>
                      </div>
                   </div>
                   <button onClick={() => setView('home')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] active:scale-95">Back to explorer</button>
                </div>
              ) : trackId && <p className="text-center text-rose-500 font-black uppercase text-[10px] py-10 opacity-50 italic">{mySpot?.msg || "Searching live network..."}</p>}
           </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD */}
        {view === 'merchant' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            {!merchantData ? (
               <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="animate-spin text-emerald-600" size={40} />
                  <p className="font-black uppercase text-[10px] text-slate-400">Loading Dashboard...</p>
                  <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="text-rose-500 font-black uppercase text-[8px] tracking-[0.2em] pt-4">Emergency Logout</button>
               </div>
            ) : (
               <>
                  <div className="flex justify-between items-center px-1">
                    <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
                    <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><LogOut size={20}/></button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex flex-col justify-between shadow-lg h-44">
                       <div><p className="text-[8px] font-black uppercase opacity-50 mb-1 tracking-widest leading-none">STATUS</p><p className="text-lg font-black uppercase italic tracking-tighter leading-none">{merchantData.store.isLive ? 'Online' : 'Offline'}</p></div>
                       <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !merchantData.store.isLive })} className={`w-14 h-8 rounded-full p-1 transition-all ${merchantData.store.isLive ? 'bg-emerald-600' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all bg-white ${merchantData.store.isLive ? 'ml-6' : 'ml-0'}`} /></button>
                    </div>
                    <div className="bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-lg relative overflow-hidden h-44 group">
                       <img src={merchantData.store.image} className="w-full h-full object-cover rounded-[2rem] opacity-50 group-hover:opacity-100 transition-all" alt="Business" />
                       <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                          <Camera size={24} className="text-slate-800" />
                          <span className="text-[8px] font-black uppercase mt-1 text-slate-800 px-2 text-center">Change Photo</span>
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
                          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1 uppercase">Waiting</p><p className="text-2xl font-black text-blue-600 italic leading-none">{merchantData.queue.length}</p></div>
                        </div>
                        {merchantData.queue.map((b, i) => (
                          <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm space-y-4 animate-in slide-in-from-left-4">
                            <div className="flex justify-between items-start">
                              <div>
                                 <p className="font-black text-sm uppercase italic leading-none">{b.custName || 'User'}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">{b.serviceName} • {b.time}</p>
                                 <p className="text-[8px] text-blue-600 font-black uppercase mt-1 tracking-widest italic">Seats: {b.seats || 1} • Cash</p>
                              </div>
                              <span className="bg-slate-50 px-2 py-1 rounded text-[10px] font-black italic tracking-widest">#{b.displayId}</span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => window.open(`tel:${b.phone}`)} className="flex-1 p-3 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><Phone size={16}/><span className="text-[9px] font-black uppercase tracking-widest">Call</span></button>
                              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="flex-1 p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center gap-2 active:scale-95"><CheckCircle2 size={16}/><span className="text-[9px] font-black uppercase tracking-widest">Done</span></button>
                              <button onClick={async () => { if(window.confirm("Cancel Booking?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id)); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><X size={18}/></button>
                            </div>
                          </div>
                        ))}
                     </section>
                  )}

                  {mTab === 'assets' && (
                    <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1 animate-in fade-in">
                      <button onClick={() => {
                         const n = prompt(merchantData.store.category === 'salon' ? "Staff Name:" : "Trip Description:");
                         const t = merchantData.store.category === 'travel' ? prompt("Starting Time (e.g. 09:30 AM):") : "";
                         const c = merchantData.store.category === 'travel' ? prompt("Total Capacity (Seats):") : 1;
                         if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, time: t, capacity: Number(c || 1) }) });
                      }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Asset</button>
                      <div className="space-y-3">
                         {(merchantData.store.resources || []).map((r, i) => (
                           <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                              <div><p className="font-black text-xs uppercase italic leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-slate-400 uppercase mt-1 leading-none tracking-widest">Starts: {r.time} • Cap: {r.capacity}</p>}</div>
                              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90"><Trash2 size={16}/></button>
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
                        }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300 transition-all">+ Add Rate Entry</button>
                        <div className="space-y-3">
                           {(merchantData.store.services || []).map((s, i) => (
                             <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                                <p className="font-black text-xs uppercase italic leading-none">{s.name} • ₹{s.price}</p>
                                <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="p-2 text-rose-500 active:scale-90"><X size={16}/></button>
                             </div>
                           ))}
                        </div>
                     </div>
                  )}
               </>
            )}
          </div>
        )}

        {/* VIEW: ADMIN Master (IDENTITY-DRIVEN) */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">Admin Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Compass size={18}/></button>
             </div>
             
             {user?.uid !== MASTER_UID ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <div className="relative w-20 h-20 mx-auto">
                    <Shield className="w-full h-full text-rose-100" />
                    <Lock className="absolute inset-0 m-auto text-rose-600" size={24} />
                 </div>
                 <div className="space-y-4">
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        <input type="email" placeholder="Admin Email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="w-full bg-slate-50 p-5 pl-12 rounded-2xl border font-black text-xs outline-none focus:border-rose-500" />
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        <input type="password" placeholder="System Password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} className="w-full bg-slate-50 p-5 pl-12 rounded-2xl border font-black text-xs outline-none focus:border-rose-500" />
                    </div>
                    <button onClick={handleAdminLogin} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-[0.2em]">Verify Identity</button>
                 </div>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1 animate-in slide-in-from-bottom-8">
                 <div className="flex justify-between items-center px-1">
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none flex items-center gap-1"><ShieldCheck size={12}/> Root Session</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">UID: ...{user.uid.slice(-6)}</p>
                    </div>
                    <button onClick={handleAdminLogout} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl font-black text-[9px] uppercase tracking-tighter active:scale-90"><LogOut size={14}/> Sign Out</button>
                 </div>
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Live ({stores.length})</button>
                 </div>
                 
                 {adminTab === 'requests' ? (
                   <div className="space-y-4">
                     {requests.length === 0 ? <p className="text-center py-20 text-[10px] uppercase font-black text-slate-300 italic tracking-[0.2em]">No pending approvals</p> : 
                     requests.map(r => (
                        <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm">
                            <h4 className="font-black text-sm uppercase italic tracking-tight leading-none">{r.bizName}</h4>
                            <div className="flex gap-2">
                              <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                              <button onClick={() => adminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95 tracking-widest italic">Approve</button>
                            </div>
                        </div>
                     ))}
                   </div>
                 ) : (
                    <div className="space-y-3">
                      {stores.map(s => (
                        <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center">
                           <div><h4 className="font-black text-xs uppercase italic leading-none">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1 uppercase tracking-widest leading-none">ID: {s.merchantId}</p></div>
                           <button onClick={() => { if(window.confirm("Purge Store?")) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="p-2 bg-slate-50 rounded-lg text-rose-600 active:scale-90 transition-all"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </div>
                 )}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL */}
        {view === 'detail' && activeStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 px-1 pb-32">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest px-2 active:scale-95 leading-none"><ArrowLeft size={16} className="mr-2"/> Return</button>
            <div className="relative mx-1">
              <img src={activeStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={activeStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{activeStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><MapPin size={12} className="mr-1"/> {activeStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4 mx-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Select Service Type</h3>
              <div className="space-y-2">
                {(activeStore.services || []).map((s, idx) => (
                  <div key={idx} onClick={() => setActiveCart(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${activeCart?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>

            {activeCart && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5 mx-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Details</h3>
                  <input placeholder="Your Full Name" value={bookForm.custName} onChange={e => setBookForm({...bookForm, custName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[11px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none focus:border-emerald-500" />

                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Assign {activeStore.category === 'salon' ? 'Professional' : 'Trip timing'}</label>
                    <div className="space-y-2">
                      {(activeStore.resources || []).map(r => {
                        const { count, left } = checkAvailability(activeStore.id, r.id, r.capacity);
                        const isFull = activeStore.category === 'travel' && left <= 0;
                        return (
                          <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed grayscale' : ''}`}>
                            <div className="text-left"><p className="font-black text-[10px] uppercase italic tracking-tight leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-blue-500 mt-1 uppercase tracking-widest leading-none">Leaves at {r.time}</p>}</div>
                            <span className={`text-[8px] font-black uppercase tracking-tighter ${isFull ? 'text-rose-500' : 'text-emerald-600'} leading-none`}>
                              {activeStore.category === 'salon' ? `Wait Rank: ${count + 1}` : isFull ? 'FULL' : `${left} Seats Left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {activeStore.category === 'travel' && bookForm.resId && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Passenger Count</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" value={bookForm.date} onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    {activeStore.category === 'salon' && (
                       <input type="time" value={bookForm.time} onChange={e => setBookForm({...bookForm, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner outline-none" />
                    )}
                  </div>
                  <input placeholder="WhatsApp Number" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner outline-none" />
                  
                  {getCheatStatus() ? (
                     <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-500 animate-in fade-in">
                        <AlertCircle size={20} />
                        <span className="text-[10px] font-black uppercase tracking-tighter italic">Error: Past time blocked!</span>
                     </div>
                  ) : (
                    <button disabled={!bookForm.date || (!bookForm.time && activeStore.category === 'salon') || !bookForm.phone || !bookForm.resId || !bookForm.custName} onClick={() => setShowPayment(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Get Token ID</button>
                  )}
              </div>
            )}
          </div>
        )}

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && profile.role !== 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">Business Hub</h2></div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative mx-1">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 ${hubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setHubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubView === 'register' ? 'text-white' : 'text-slate-500'}`}>Join Now</button>
               <button onClick={() => setHubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubView === 'login' ? 'text-white' : 'text-slate-500'}`}>Login</button>
            </div>
            {hubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 mx-1">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Business Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="WhatsApp Number" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none">
                  <option value="salon">Salon</option><option value="travel">Travel Agency</option>
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Chiplun Location" />
                <button onClick={() => { setIsProcessing(true); addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() }).then(() => { notify("Request Sent!"); setView('home'); setIsProcessing(false); }) }} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-[0.97] transition-all shadow-xl">Apply Now</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 text-center mx-1">
                <ShieldCheck size={36} className="mx-auto text-emerald-600 mb-4" />
                <input value={vLogin.id} onChange={e => setVLogin({...vLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 text-center tracking-tighter" placeholder="Merchant ID" />
                <input type="password" value={vLogin.pass} onChange={e => setVLogin({...vLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none focus:border-emerald-500" placeholder="••••••••" />
                <button onClick={handleVLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Unlock Dashboard</button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* MODALS */}
      {showPayment && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter leading-none italic">Select Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("Coming Soon", "info")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50">
                    <span className="font-black text-[10px] uppercase">Online Payment</span>
                    <span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black uppercase tracking-widest">SOON</span>
                 </button>
                 <button onClick={() => setShowConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all">
                    <span className="font-black text-sm uppercase tracking-widest">Pay with Cash</span>
                    <Banknote size={20} />
                 </button>
              </div>
              <button onClick={() => setShowPayment(false)} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cancel</button>
           </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-emerald-600 z-[1001] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200 text-white text-center">
           <div className="space-y-8">
              <AlertCircle size={80} className="mx-auto animate-bounce" />
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
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Compass size={24} /></button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Ticket size={24} /></button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button 
          onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
          className={`transition-all ${view === 'business' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}
        >
          <Briefcase size={24} />
        </button>
      </nav>

    </div>
  );
}
