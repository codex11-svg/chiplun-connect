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
  getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, 
  getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove 
} from 'firebase/firestore';
import { 
  Search, Shield, Briefcase, Scissors, Bus, Ticket, Plus, 
  ChevronRight, MapPin, ArrowLeft, AlertCircle, Banknote, 
  Compass, Phone, CheckCircle2, X, Camera, Loader2, Trash2,
  LogOut, ShieldCheck, Mail, Lock, Key
} from 'lucide-react';

// --- PRODUCTION CONFIG ---
const firebaseConfig = { 
  apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo", 
  authDomain: "chiplun-connect.firebaseapp.com", 
  projectId: "chiplun-connect", 
  storageBucket: "chiplun-connect.firebasestorage.app", 
  messagingSenderId: "861830187280", 
  appId: "1:861830187280:web:504064454581cdeb84bd95" 
};

// Singleton initialization to prevent double-init on Vercel
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "chiplun-pro-v50-master-ironclad";

// MASTER IDENTITY KEY
const MASTER_ADMIN_UID = "mno2A46Df1fKmme9JSqPE9CMFB02";

export default function App() {
  // --- SESSION STATES ---
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState(null);
  
  // --- DATA STATES ---
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // --- UI STATES ---
  const [search, setSearch] = useState('');
  const [activeStore, setActiveStore] = useState(null);
  const [activeCart, setActiveCart] = useState(null); 
  const [adminTab, setAdminTab] = useState('requests');
  const [mTab, setMTab] = useState('ledger'); 
  const [hubView, setHubView] = useState('login');

  // --- FORM STATES ---
  const [adminCreds, setAdminCreds] = useState({ email: '', pass: '' });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [bookForm, setBookForm] = useState({ custName: '', date: '', time: '', phone: '', resId: '', seats: 1 });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [trackId, setTrackId] = useState('');
  
  const [showPayment, setShowPayment] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const notify = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // --- AUTH STRATEGY ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch(e) { console.error("Anonymous Handshake Failed"); }
      }
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- DATA HYDRATION & PERMISSIONS ---
  useEffect(() => {
    if (!user) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
    
    const unsubs = [
      onSnapshot(profileRef, (s) => {
        if (s.exists()) {
          const data = s.data();
          // Persistent Role Check: Auto-elevate to admin if UID matches Master
          if (user.uid === MASTER_ADMIN_UID && data.role !== 'admin') {
            updateDoc(profileRef, { role: 'admin' });
          }
          setProfile(data);
        } else {
          const role = user.uid === MASTER_ADMIN_UID ? 'admin' : 'customer';
          setDoc(profileRef, { role, uid: user.uid });
        }
      }, (err) => console.log("Waiting for data sync...")),
      
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => { unsubs.forEach(f => f()); clearTimeout(timer); };
  }, [user]);

  // --- ACTIONS ---
  const handleAdminAuth = async () => {
    setIsProcessing(true);
    try {
      await signInWithEmailAndPassword(auth, adminCreds.email, adminCreds.pass);
      notify("Master Authorized", "info");
      setAdminCreds({ email: '', pass: '' });
    } catch (e) { notify("Invalid Admin Credentials", "error"); }
    setIsProcessing(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    notify("Session Terminated", "info");
    setView('home');
  };

  const handleMerchantLogin = async () => {
    setIsProcessing(true);
    try {
      const credRef = doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase());
      const snap = await getDoc(credRef);
      if (snap.exists() && snap.data().password === vLogin.pass) {
        const data = snap.data();
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { 
          ...profile, role: 'vendor', businessId: data.storeId, businessName: data.businessName 
        });
        setView('merchant');
        notify("Merchant Vault Unlocked");
      } else { notify("Access Key Incorrect", "error"); }
    } catch (e) { notify("Sync Error", "error"); }
    setIsProcessing(false);
  };

  const handleBookingExecution = async () => {
    setIsProcessing(true);
    try {
      const tokenId = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const unit = Number(activeCart?.price || 0);
      const total = activeStore?.category === 'travel' ? (unit * (bookForm.seats || 1)) : unit;
      let finalTime = activeStore?.category === 'travel' ? (activeStore?.resources?.find(r => r.id === bookForm.resId)?.time || "Scheduled") : bookForm.time;
      
      const payload = { 
        ...bookForm, 
        time: finalTime, 
        displayId: tokenId, 
        storeId: activeStore.id, 
        storeName: activeStore.name, 
        serviceName: activeCart.name, 
        totalPrice: total, 
        status: 'pending', 
        timestamp: Date.now() 
      };

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setTrackId(tokenId);
      setShowConfirm(false); setShowPayment(false); setView('track');
      notify("Token Generated Successfully");
    } catch (e) { notify("Network Error: Save Failed", "error"); }
    setIsProcessing(false);
  };

  // --- MEMOIZED SELECTORS ---
  const marketplace = useMemo(() => (stores || []).filter(s => 
    s?.isLive && (s?.name?.toLowerCase().includes(search.toLowerCase()) || s?.category?.toLowerCase().includes(search.toLowerCase()))
  ), [stores, search]);

  const merchantData = useMemo(() => {
    if (!profile?.businessId || !stores.length) return null;
    const s = stores.find(x => x.id === profile.businessId);
    if (!s) return null;
    const q = bookings.filter(x => x.storeId === profile.businessId && x.status === 'pending').sort((a,b) => a.timestamp - b.timestamp);
    const rev = bookings.filter(x => x.storeId === profile.businessId && x.status === 'completed').reduce((a,c) => a + (Number(c.totalPrice) || 0), 0);
    return { store: s, queue: q, rev };
  }, [bookings, profile, stores]);

  const mySpot = useMemo(() => {
    if (!trackId) return null;
    const live = bookings.find(b => b.displayId === trackId);
    if (!live || live.status !== 'pending') return { error: true };
    const ahead = bookings.filter(b => b.storeId === live.storeId && b.resId === live.resId && b.status === 'pending' && b.timestamp < live.timestamp);
    return { ...live, pos: ahead.length + 1, wait: ahead.length * 20 };
  }, [bookings, trackId]);

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-emerald-600 text-white gap-4">
      <Loader2 className="animate-spin" size={40} />
      <p className="font-black uppercase text-[10px] tracking-[0.5em]">Establishing Secure Channel</p>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 overflow-x-hidden">
      
      {/* GLOBAL HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Enterprise V50</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('admin')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${user?.uid === MASTER_ADMIN_UID ? 'bg-amber-400 text-slate-900 border-amber-500 shadow-lg' : 'bg-white/10 border-white/10'}`}>
              <Shield size={18} />
            </button>
            <button onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'merchant' || view === 'business' ? 'bg-white text-emerald-600' : 'bg-white/10'}`}>
              <Briefcase size={20} />
            </button>
          </div>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Search verified Chiplun partners..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 transition-all shadow-inner" />
          </div>
        )}
      </header>

      {/* TOAST SYSTEM */}
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
          <div className="space-y-8 pt-2 animate-in fade-in duration-500">
            <div className="grid grid-cols-4 gap-3">
               <button onClick={() => setSearch('salon')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-90 transition-all"><Scissors size={20} className="text-rose-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Salon</span></button>
               <button onClick={() => setSearch('travel')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-90 transition-all"><Bus size={20} className="text-blue-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Travel</span></button>
               <button onClick={() => setView('track')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-90 transition-all"><Ticket size={20} className="text-emerald-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Tracker</span></button>
               <button onClick={() => setView('business')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-90 transition-all"><Plus size={20} className="text-amber-500"/></div><span className="text-[9px] font-black uppercase text-slate-400">Partner</span></button>
            </div>
            
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live Network Registry</h2>
              <div className="space-y-4">
                {marketplace.map(store => (
                  <div key={store.id} onClick={() => { setActiveStore(store); setView('detail'); setActiveCart(null); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 active:scale-[0.98] transition-all group">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50 shadow-inner" alt="" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-tighter">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm mt-1 italic leading-none">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic mt-1 leading-none">{store.address}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-200 group-hover:text-emerald-600 transition-colors" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: ADMIN VAULT */}
        {view === 'admin' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">Admin Vault</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Compass size={18}/></button>
             </div>

             {user?.uid !== MASTER_ADMIN_UID ? (
               <div className="bg-slate-900 p-8 rounded-[3.5rem] shadow-2xl space-y-6 text-center border-t-8 border-emerald-500">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500 mb-2">
                     <Lock size={32} />
                  </div>
                  <h3 className="text-white text-xl font-black uppercase italic tracking-tighter leading-none">Security Access</h3>
                  <div className="space-y-4">
                     <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input type="email" placeholder="Master Email" value={adminCreds.email} onChange={e => setAdminCreds({...adminCreds, email: e.target.value})} className="w-full bg-slate-800 border border-slate-700 p-5 pl-12 rounded-2xl text-white outline-none focus:border-emerald-500 transition-all font-bold text-xs" />
                     </div>
                     <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                        <input type="password" placeholder="Master Key" value={adminCreds.pass} onChange={e => setAdminCreds({...adminCreds, pass: e.target.value})} className="w-full bg-slate-800 border border-slate-700 p-5 pl-12 rounded-2xl text-white outline-none focus:border-emerald-500 transition-all font-bold text-xs" />
                     </div>
                     <button onClick={handleAdminAuth} disabled={isProcessing} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-xl shadow-emerald-900/40">
                        {isProcessing ? 'Verifying...' : 'Unlock Control Panel'}
                     </button>
                  </div>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1 animate-in fade-in">
                  <div className="bg-white p-6 rounded-[2.5rem] border-l-8 border-emerald-500 flex justify-between items-center shadow-lg">
                     <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Session Authorized</p>
                        <p className="text-lg font-black uppercase italic tracking-tighter text-emerald-600 mt-1 leading-none">Master Admin</p>
                     </div>
                     <button onClick={handleLogout} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90 shadow-sm"><LogOut size={20}/></button>
                  </div>
                  <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Active ({stores.length})</button>
                 </div>
                 {/* Logic for list rendering simplified for this view */}
                 <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest leading-none">System Ledger Online</p>
                 </div>
               </div>
             )}
          </div>
        )}

        {/* VIEW: MERCHANT HUB */}
        {view === 'business' && profile.role !== 'vendor' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
             <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">Partner Hub</h2></div>
             <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border border-slate-100 space-y-6 text-center mx-1">
                 <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-inner"><ShieldCheck size={32} /></div>
                 <div className="space-y-4">
                    <input value={vLogin.id} onChange={e => setVLogin({...vLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase text-center outline-none focus:border-emerald-500 shadow-inner" placeholder="Merchant ID" />
                    <input type="password" value={vLogin.pass} onChange={e => setVLogin({...vLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none focus:border-emerald-500 shadow-inner" placeholder="Access Key" />
                    <button onClick={handleMerchantLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl transition-all">Unlock Business Console</button>
                 </div>
             </div>
           </div>
        )}

        {/* VIEW: TOKEN TRACKER */}
        {view === 'track' && (
           <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Live Queue Tracker</h2>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
                 <input placeholder="Enter Token ID (CH-XXXX)" value={trackId} onChange={e => setTrackId(e.target.value.toUpperCase())} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black text-center tracking-widest outline-none focus:border-emerald-500" />
              </div>
              {mySpot && !mySpot.error ? (
                <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl font-black italic shadow-inner">{mySpot.pos}</div>
                   <div><h3 className="text-3xl font-black tracking-tighter uppercase italic leading-none">{mySpot.displayId}</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Position Identified</p></div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">Wait Rank</p><p className="text-xl font-black text-emerald-600">{mySpot.pos === 1 ? "READY" : (mySpot.pos - 1) + " People"}</p></div>
                      <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><p className="text-[8px] font-black text-slate-400 uppercase">Est. Wait</p><p className="text-xl font-black text-blue-600">~{mySpot.wait}m</p></div>
                   </div>
                </div>
              ) : trackId && <p className="text-center text-slate-400 font-black uppercase text-[10px] py-10 italic animate-pulse tracking-widest">Validating with master ledger...</p>}
           </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === 'detail' && activeStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 px-1 pb-32">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest px-2 active:scale-95 leading-none"><ArrowLeft size={16} className="mr-2"/> Return</button>
             <div className="relative mx-1">
               <img src={activeStore?.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt="" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
               <div className="absolute bottom-6 left-8 right-8 text-white">
                 <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{activeStore?.name}</h2>
                 <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><MapPin size={12} className="mr-1"/> {activeStore?.address}</p>
               </div>
             </div>
             
             <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4 mx-1">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Select Service</h3>
               <div className="space-y-2">
                 {(activeStore?.services || []).map((s, idx) => (
                   <div key={idx} onClick={() => setActiveCart(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${activeCart?.name === s.name ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 bg-slate-50'}`}>
                     <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                     <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>

             {activeCart && (
                <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5 mx-1">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Provider Selection</h3>
                   <input placeholder="Customer Name" value={bookForm.custName} onChange={e => setBookForm({...bookForm, custName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[11px] border border-slate-100 uppercase outline-none focus:border-emerald-500 shadow-inner" />
                   
                   <div className="space-y-2">
                     <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Available Fleets/Staff</label>
                     {(activeStore?.resources || []).map(r => {
                       const { count, left } = checkAvailability(activeStore.id, r.id, r.capacity);
                       const isFull = activeStore.category === 'travel' && left <= 0;
                       return (
                         <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30' : ''}`}>
                           <div className="text-left"><p className="font-black text-[10px] uppercase italic leading-none">{r.name}</p>{r.time && <p className="text-[8px] font-black text-blue-500 mt-1 uppercase tracking-widest">Time: {r.time}</p>}</div>
                           <span className={`text-[8px] font-black uppercase ${isFull ? 'text-rose-500' : 'text-emerald-600'}`}>{activeStore.category === 'salon' ? `Wait Rank: ${count + 1}` : isFull ? 'FULL' : `${left} S Left`}</span>
                         </div>
                       );
                     })}
                   </div>

                   <button disabled={!bookForm.resId || !bookForm.custName} onClick={() => setShowPayment(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] shadow-xl disabled:opacity-30 transition-all active:scale-95">Generate Token</button>
                </div>
             )}
           </div>
        )}

      </main>

      {/* MODAL: PAYMENT GATEWAY (MOCK) */}
      {showPayment && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter italic leading-none">Verify Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("UPI API available in Production V51", "info")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50"><span className="font-black text-[10px] uppercase">Online/UPI</span><span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black tracking-widest">SOON</span></button>
                 <button onClick={() => setShowConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all"><span className="font-black text-sm uppercase tracking-widest">Confirm Cash</span><Banknote size={20} /></button>
              </div>
              <button onClick={() => setShowPayment(false)} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Back</button>
           </div>
        </div>
      )}

      {/* MODAL: TOKEN CONFIRMATION */}
      {showConfirm && (
        <div className="fixed inset-0 bg-emerald-600 z-[1001] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200 text-white text-center">
           <div className="space-y-8">
              <AlertCircle size={80} className="mx-auto animate-bounce" />
              <div className="space-y-2">
                 <h3 className="text-4xl font-black uppercase italic tracking-tighter leading-none">Generate?</h3>
                 <p className="text-sm font-bold uppercase opacity-70 tracking-widest">Authorization Fee: ₹{activeCart?.price || 0}</p>
              </div>
              <div className="space-y-3 pt-6">
                 <button onClick={handleBookingExecution} className="w-64 py-6 bg-white text-emerald-600 rounded-full font-black uppercase shadow-2xl active:scale-90 transition-all text-lg tracking-widest italic">YES, GENERATE</button>
              </div>
           </div>
        </div>
      )}

      {/* MASTER NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Compass size={24} /></button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Ticket size={24} /></button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} className={`transition-all ${view === 'business' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Briefcase size={24} /></button>
      </nav>
    </div>
  );
}

