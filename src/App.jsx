import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- Configuration & Initialization ---
const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined') {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.warn("Environment config missing, using fallback.");
  }
  return {
    apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo",
    authDomain: "chiplun-connect.firebaseapp.com",
    projectId: "chiplun-connect",
    storageBucket: "chiplun-connect.firebasestorage.app",
    messagingSenderId: "861830187280",
    appId: "1:861830187280:web:504064454581cdeb84bd95"
  };
};

const app = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : "chiplun-pro-v50-supreme";
const ADMIN_PIN = "112607";

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500 border-rose-100' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500 border-blue-100' },
  { id: 'clinic', n: 'Clinic', i: <Lucide.Stethoscope size={20}/>, c: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
  { id: 'repair', n: 'Repair', i: <Lucide.Wrench size={20}/>, c: 'bg-amber-50 text-amber-500 border-amber-100' }
];

// --- UI Components ---
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-rose-500' : 'bg-slate-900';
  
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[2000] ${bg} text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300`}>
      {type === 'error' ? <Lucide.AlertCircle size={16} /> : <Lucide.CheckCircle2 size={16} />}
      <span className="text-xs font-black uppercase tracking-widest">{msg}</span>
    </div>
  );
};

const Modal = ({ children, title, onClose }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1500] flex items-center justify-center p-6 animate-in fade-in duration-200">
    <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-6 shadow-2xl border-t-8 border-slate-900 animate-in zoom-in-95 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-black uppercase tracking-widest italic text-slate-400">{title}</h3>
        <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Lucide.X size={16}/></button>
      </div>
      {children}
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data State
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // UI State
  const [activeCategory, setActiveCategory] = useState(null); // New strict filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // Admin & Auth State
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminTab, setAdminTab] = useState('requests'); 
  const [bizSubView, setBizSubView] = useState('register');
  
  // Notification System
  const [toast, setToast] = useState(null); 
  const [activeModal, setActiveModal] = useState(null); 

  // Form States
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    source: '', destination: '', numSeats: 1
  });
  const [regForm, setRegForm] = useState({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [trackedBooking, setTrackedBooking] = useState(null);
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });

  const modalInput1 = useRef('');
  const modalInput2 = useRef('');

  const notify = (msg, type = 'success') => setToast({ msg, type });
  const closeToast = () => setToast(null);

  // --- Firebase Sync ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth failed:", e);
        setLoading(false);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const paths = {
      profile: doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'),
      stores: collection(db, 'artifacts', APP_ID, 'public', 'data', 'stores'),
      bookings: collection(db, 'artifacts', APP_ID, 'public', 'data', 'bookings'),
      requests: collection(db, 'artifacts', APP_ID, 'public', 'data', 'requests')
    };

    const unsubs = [
      onSnapshot(paths.profile, (snap) => {
        if (snap.exists()) setProfile(snap.data());
        else setDoc(paths.profile, { role: 'customer', uid: user.uid });
        setLoading(false);
      }, (error) => { console.error("Profile sync error:", error); setLoading(false); }),
      
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Stores sync error:", e)),
      onSnapshot(paths.bookings, (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Bookings sync error:", e)),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Requests sync error:", e))
    ];

    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // --- Logic Improvements ---
  
  // 1. Strict Category Filtering + Fuzzy Search
  const filteredStores = useMemo(() => {
    return stores.filter(s => {
      const matchesCategory = activeCategory ? s.category === activeCategory : true;
      const matchesSearch = s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            s.category?.toLowerCase().includes(searchQuery.toLowerCase());
      return s.isLive && matchesCategory && matchesSearch;
    });
  }, [stores, searchQuery, activeCategory]);

  // 2. Context-Aware Merchant Stats
  const merchantData = useMemo(() => {
    if (!profile.businessId) return { revenue: 0, queue: [], store: null };
    
    const myStore = stores.find(s => s.id === profile.businessId);
    const bookings = allBookings.filter(b => b.storeId === profile.businessId);
    
    const revenue = bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);
      
    const queue = bookings.filter(b => b.status === 'pending');
    
    return { revenue, queue, store: myStore };
  }, [allBookings, profile.businessId, stores]);

  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const displayId = "CH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const service = cart[0];
    let finalPrice = Number(service.price);
    
    // Travel Logic: Seat multiplier & Destination check
    if (selectedStore.category === 'travel') {
      finalPrice = finalPrice * (bookingMeta.numSeats || 1);
    }

    const payload = { 
      ...bookingMeta, 
      displayId, 
      storeId: selectedStore.id, 
      storeName: selectedStore.name, 
      serviceName: service.name, 
      totalPrice: finalPrice, 
      status: 'pending', 
      timestamp: Date.now() 
    };

    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'bookings'), payload);
      
      setTrackedBooking(payload);
      setShowConfirmModal(false);
      setView('track');
      notify("Booking Confirmed!");
    } catch (e) { 
      console.error(e); 
      notify("Booking Failed", "error");
    } finally { 
      setIsProcessing(false); 
    }
  };

  const submitRegistration = async () => {
    if (!regForm.bizName || !regForm.phone || !regForm.address) return notify("Fill all details", "error");
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now(), uid: user.uid });
      notify("Application Sent!");
      setRegForm({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
      setView('home');
    } catch (e) { notify("Error submitting", "error"); } finally { setIsProcessing(false); }
  };

  const handleVendorLogin = async () => {
    setIsProcessing(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'vendor_creds', vendorLogin.id.toUpperCase()));
      if (snap.exists() && snap.data().password === vendorLogin.pass) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
        setView('merchant');
        notify("Welcome Back");
      } else { notify("Invalid Credentials", "error"); }
    } catch (e) { notify("Login Error", "error"); } finally { setIsProcessing(false); }
  };

  // --- Admin Logic ---
  const initiateApproval = (req) => setActiveModal({ type: 'approve', data: req });
  const confirmApprove = async () => {
    const req = activeModal.data;
    const mid = modalInput1.current.value.toUpperCase();
    const key = modalInput2.current.value;
    if(!mid || !key) return notify("Both fields required", "error");
    setIsProcessing(true);
    try {
      const storeRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'stores'));
      await setDoc(storeRef, {
        name: req.bizName, category: req.category, address: req.address, isLive: true, merchantId: mid,
        image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800",
        services: [{ name: 'Standard Service', price: 100, duration: 30 }], staff: [{ name: 'Owner' }]
      });
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'vendor_creds', mid), { storeId: storeRef.id, businessName: req.bizName, password: key });
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'requests', req.id));
      notify(`Live: ${mid}`); setActiveModal(null);
    } catch (e) { notify("Approval Failed", "error"); } finally { setIsProcessing(false); }
  };
  const initiateReject = (id) => setActiveModal({ type: 'reject', data: id });
  const confirmReject = async () => { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'requests', activeModal.data)); notify("Rejected"); setActiveModal(null); };
  const initiatePurge = (s) => setActiveModal({ type: 'purge', data: s });
  const confirmPurge = async () => { const s = activeModal.data; try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'stores', s.id)); if (s.merchantId) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'vendor_creds', s.merchantId.toUpperCase())); notify("Purged"); } catch (e) { notify("Error", "error"); } setActiveModal(null); };
  const completeBooking = async (id) => { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bookings', id), { status: 'completed' }); notify("Done"); };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-[0.3em]">CHIPLUNCONNECT SUPREME</div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}

      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme Nexus • V50</p>
          </div>
          <button onClick={() => setView('business')} className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all shadow-inner ${view === 'business' ? 'bg-white text-emerald-600 border-white' : 'bg-white/10 text-white border-white/10 active:bg-white/20'}`}>
            <Lucide.Briefcase size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Search stores..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 shadow-inner transition-all" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        {/* HOME VIEW: Category Filtering Logic Improved */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in zoom-in duration-700">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => { setActiveCategory(activeCategory === cat.id ? null : cat.id); setSearchQuery(''); }} 
                  className={`flex flex-col items-center gap-2 p-1 transition-all ${activeCategory === cat.id ? 'scale-110 opacity-100' : 'opacity-60 hover:opacity-100'}`}
                >
                  <div className={`${cat.c} p-4 rounded-[1.5rem] shadow-sm border ${activeCategory === cat.id ? 'ring-2 ring-offset-2 ring-emerald-400' : ''}`}>{cat.i}</div>
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${activeCategory === cat.id ? 'text-slate-900' : 'text-slate-500'}`}>{cat.n}</span>
                </button>
              ))}
            </div>

            <section className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
                  {activeCategory ? `${activeCategory} Listings` : 'All Businesses'}
                </h2>
                <div className="h-px bg-slate-200 flex-1 ml-4"></div>
              </div>
              <div className="space-y-4">
                {filteredStores.map(store => (
                  <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); }} className="bg-white p-3 rounded-[2rem] flex gap-4 items-center shadow-sm border border-slate-100 hover:border-emerald-300 active:scale-[0.98] transition-all group">
                    <img src={store.image || "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400"} className="w-20 h-20 rounded-[1.5rem] object-cover bg-slate-50" alt={store.name} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                        {store.isLive && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>}
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight uppercase">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic mt-0.5">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200 group-hover:text-emerald-500 mr-2" />
                  </div>
                ))}
                {filteredStores.length === 0 && <div className="text-center py-10 opacity-40 font-black uppercase text-[10px] tracking-widest">No listings found in this category</div>}
              </div>
            </section>
          </div>
        )}

        {/* BUSINESS HUB */}
        {view === 'business' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth Engine for Chiplun Merchants</p>
            </div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 shadow-lg ${bizSubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'register' ? 'text-white' : 'text-slate-500'}`}>Join Network</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'login' ? 'text-white' : 'text-slate-500'}`}>Merchant Login</button>
            </div>
            {bizSubView === 'register' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4">
                  <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Owner Name</label><input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="E.G. RAHUL PATIL" /></div>
                  <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Mobile</label><input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="+91 000..." /></div>
                  <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Business Name</label><input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="E.G. SUPREME SALON" /></div>
                  <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Category</label><select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner"><option value="salon">SALON</option><option value="travel">TRAVEL</option><option value="clinic">CLINIC</option><option value="repair">REPAIR</option></select></div>
                  <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Address</label><input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="STATION ROAD, CHIPLUN" /></div>
                  <button onClick={submitRegistration} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-[0.97] transition-all">Submit Profile</button>
                  <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] pt-4">Admin Access</button>
                </div>
              </div>
            )}
            {bizSubView === 'login' && (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 max-w-sm mx-auto w-full mt-10">
                <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Merchant ID</label><input value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 shadow-inner text-center" placeholder="CH-XXXX" /></div>
                <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Key</label><input type="password" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-5 rounded-2xl text-center outline-none focus:border-emerald-500 shadow-inner" placeholder="••••••••" /></div>
                <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-[0.97] transition-all">Access Dashboard</button>
              </div>
            )}
          </div>
        )}

        {/* ADMIN */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <div className="flex justify-between items-center px-2">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter">Admin Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4">
                 <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">Auth Required</p>
                 <input type="password" placeholder="System PIN" value={adminPin} onChange={e => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl shadow-inner border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else notify("Access Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Verify</button>
               </div>
             ) : (
               <div className="space-y-6">
                 <div className="flex bg-slate-200 p-1 rounded-2xl">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600' : 'text-slate-500'}`}>Requests ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600' : 'text-slate-500'}`}>Merchants ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' && requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4">
                       <h4 className="font-black text-sm uppercase italic">{r.bizName} <span className="text-slate-400 text-[10px] not-italic">({r.category})</span></h4>
                       <div className="flex gap-2 pt-2"><button onClick={() => initiateReject(r.id)} className="flex-1 py-4 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase">Reject</button><button onClick={() => initiateApproval(r)} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest">Approve</button></div>
                    </div>
                 ))}
                 {adminTab === 'merchants' && stores.map(s => (
                   <div key={s.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 flex justify-between items-center">
                       <div><h4 className="font-black text-xs uppercase italic">{s.name}</h4><p className="text-[8px] font-black text-rose-600 uppercase tracking-[0.2em] mt-0.5">{s.merchantId}</p></div>
                       <button onClick={() => initiatePurge(s)} className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600"><Lucide.Trash2 size={16}/></button>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* DETAIL VIEW: SMART CATEGORY LOGIC */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest">
              <Lucide.ArrowLeft size={16} className="mr-2"/> Back
            </button>
            <div className="relative">
              <img src={selectedStore.image || "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800"} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={selectedStore.name} />
              <div className="absolute bottom-6 left-8 right-8">
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Select {selectedStore.category === 'travel' ? 'Route' : 'Service'}</h3>
              <div className="space-y-3">
                {selectedStore.services?.map((s, idx) => (
                  <div key={idx} onClick={() => setCart([s])} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <div>
                      <p className="font-bold text-sm uppercase">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1 opacity-70">{selectedStore.category === 'travel' ? `${s.km} KM` : `${s.duration} MINS`}</p>
                    </div>
                    <span className="font-black text-emerald-600 text-lg tracking-tighter">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>

            {cart.length > 0 && (
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center italic">
                  {selectedStore.category === 'travel' ? 'Trip Details' : 'Appointment Details'}
                </h3>
                <div className="space-y-4">
                  {/* CATEGORY SPECIFIC INPUT LOGIC */}
                  {selectedStore.category === 'travel' ? (
                    <>
                      <div className="flex gap-2">
                        <div className="space-y-1 flex-1">
                          <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Date</label>
                          <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                        </div>
                        <div className="space-y-1 w-24">
                          <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Seats</label>
                          <input type="number" min="1" value={bookingMeta.numSeats} onChange={e => setBookingMeta({...bookingMeta, numSeats: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner text-center" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                         <input placeholder="From (Source)" value={bookingMeta.source} onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner" />
                         <input placeholder="To (Dest)" value={bookingMeta.destination} onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner" />
                      </div>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                      <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Your Details</label>
                    <input placeholder="Your Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner mb-2" />
                    <input placeholder="Phone Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner" />
                  </div>

                  <button disabled={!bookingMeta.date || !bookingMeta.custPhone} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-40">Review & Confirm</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MERCHANT DASHBOARD VIEW: SMART LEDGER LOGIC */}
        {view === 'merchant' && profile.role === 'vendor' && merchantData.store && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center px-2">
              <div>
                <h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tighter">{profile.businessName}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{merchantData.store.category} Console</p>
              </div>
              <button onClick={() => setView('home')} className="p-3 bg-slate-100 rounded-xl text-slate-400"><Lucide.Home size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Total Revenue</p>
                <p className="text-2xl font-black text-emerald-600 tracking-tighter">₹{merchantData.revenue}</p>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Pending Queue</p>
                <p className="text-2xl font-black text-blue-600 tracking-tighter">{merchantData.queue.length}</p>
              </div>
            </div>
            <section className="bg-emerald-600 text-white p-6 rounded-[3rem] shadow-xl space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80 italic text-center">
                {merchantData.store.category === 'travel' ? 'Passenger Manifest' : 'Appointment Ledger'}
              </h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {merchantData.queue.map((b, i) => (
                  <div key={i} className="bg-white/10 p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <div>
                        {/* CATEGORY SPECIFIC DISPLAY LOGIC */}
                        {merchantData.store.category === 'travel' ? (
                           <>
                             <div className="flex items-center gap-2 mb-1">
                                <span className="bg-white text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">{b.numSeats || 1} Seats</span>
                                <span className="text-[9px] font-bold text-emerald-200">{b.date}</span>
                             </div>
                             <p className="font-black text-sm uppercase italic">{b.source || 'Chiplun'} <Lucide.ArrowRight size={10} className="inline mx-1"/> {b.destination || 'Dest'}</p>
                             <p className="text-[8px] font-bold text-emerald-200 uppercase mt-0.5">{b.custName} • {b.custPhone}</p>
                           </>
                        ) : (
                           <>
                             <p className="font-black text-sm uppercase italic">{b.custName || 'Guest'}</p>
                             <p className="text-[8px] font-bold text-emerald-200 uppercase mt-0.5">{b.serviceName}</p>
                             <div className="flex items-center gap-2 mt-1 opacity-80">
                               <Lucide.Clock size={10}/> <span className="text-[9px]">{b.time}</span> <span className="text-[9px]">({b.date})</span>
                             </div>
                           </>
                        )}
                      </div>
                      <span className="bg-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter">#{b.displayId}</span>
                    </div>
                    <button onClick={() => completeBooking(b.id)} className="w-full bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest p-3 rounded-xl shadow-lg mt-4 active:scale-95 relative z-10">Complete Order</button>
                  </div>
                ))}
                {merchantData.queue.length === 0 && <div className="text-center py-10 opacity-50 text-[10px] uppercase tracking-widest">All caught up!</div>}
              </div>
            </section>
          </div>
        )}

        {/* TRACK VIEW */}
        {view === 'track' && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Ticket Status</h2>
            {trackedBooking ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6">
                <div className="bg-emerald-50 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center"><Lucide.CheckCircle2 size={40} className="text-emerald-600" /></div>
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase">{trackedBooking.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[10px] font-black uppercase text-left space-y-2 border border-slate-100 shadow-inner">
                  <div className="flex justify-between"><span>Merchant:</span><span className="text-emerald-700">{trackedBooking.storeName}</span></div>
                  <div className="flex justify-between"><span>Service:</span><span>{trackedBooking.serviceName}</span></div>
                  {trackedBooking.numSeats && <div className="flex justify-between"><span>Seats:</span><span>{trackedBooking.numSeats}</span></div>}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs text-slate-900 font-black"><span>Payable:</span><span>₹{trackedBooking.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95">Back Home</button>
              </div>
            ) : (
              <div className="space-y-4">
                <input placeholder="Enter Token (CH-XXXX)" value={trackInput} onChange={e => setTrackInput(e.target.value)} className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 font-black text-center text-lg uppercase outline-none focus:border-emerald-500" />
                <button onClick={() => { const found = allBookings.find(b => b.displayId === trackInput.toUpperCase()); if (found) setTrackedBooking(found); else notify("Token Not Found", "error"); }} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Track Now</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALS */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border-t-8 border-emerald-500 text-center">
              <Lucide.ShieldCheck size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase tracking-tighter italic mb-4">Finalize Booking</h3>
              <div className="bg-slate-50 p-5 rounded-2xl text-[10px] font-black uppercase text-left space-y-3 border border-slate-100 mb-6 shadow-inner">
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Merchant:</span><span className="text-emerald-600">{selectedStore?.name}</span></div>
                 <div className="flex justify-between"><span>Service:</span><span>{cart[0]?.name}</span></div>
                 {selectedStore.category === 'travel' && <div className="flex justify-between"><span>Route:</span><span>{bookingMeta.source} &rarr; {bookingMeta.destination}</span></div>}
                 <div className="flex justify-between pt-2 border-t border-slate-200 text-sm text-slate-900 font-black"><span>Payable:</span><span className="text-emerald-600 text-lg">₹{cart[0]?.price * (selectedStore?.category === 'travel' ? (bookingMeta.numSeats || 1) : 1)}</span></div>
              </div>
              <button disabled={isProcessing} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]">{isProcessing ? 'Verifying...' : 'Finalize & Book'}</button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-slate-400 font-black text-[10px] uppercase">Wait, Go Back</button>
           </div>
        </div>
      )}
      {activeModal?.type === 'approve' && (
        <Modal title="Issue License" onClose={() => setActiveModal(null)}>
           <div className="space-y-4">
             <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Assign Merchant ID</label><input ref={modalInput1} className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black uppercase text-center" placeholder="CH-XXXX" /></div>
             <div className="space-y-1"><label className="text-[8px] font-black uppercase text-slate-400 ml-2">Set Security Key</label><input ref={modalInput2} className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black text-center" placeholder="Secret Key" /></div>
             <button onClick={confirmApprove} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Go Live</button>
           </div>
        </Modal>
      )}
      {activeModal?.type === 'reject' && (
        <Modal title="Confirm Reject" onClose={() => setActiveModal(null)}>
          <p className="text-xs font-bold text-slate-500 mb-6 text-center">Are you sure you want to reject this application?</p>
          <button onClick={confirmReject} className="w-full bg-rose-500 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Reject Application</button>
        </Modal>
      )}
      {activeModal?.type === 'purge' && (
        <Modal title="Danger Zone" onClose={() => setActiveModal(null)}>
          <p className="text-xs font-bold text-slate-500 mb-6 text-center">Permanently delete business and credentials?</p>
          <button onClick={confirmPurge} className="w-full bg-rose-500 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest">Confirm Purge</button>
        </Modal>
      )}

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}><Lucide.Compass size={24} /></button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}><Lucide.Ticket size={24} /></button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button onClick={() => setView('business')} className={`transition-all ${view === 'business' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}><Lucide.Briefcase size={24} /></button>
      </nav>
    </div>
  );
}
