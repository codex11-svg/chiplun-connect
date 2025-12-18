import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- Configuration & Initialization ---
// Fixed: Use environment provided config to prevent API Key errors
const firebaseConfig = JSON.parse(__firebase_config);

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// Use environment App ID for strict path compliance, fallback to V50 ID if undefined
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : "chiplun-pro-v50-supreme";
const ADMIN_PIN = "112607";

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500 border-rose-100' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500 border-blue-100' },
  { id: 'clinic', n: 'Clinic', i: <Lucide.Stethoscope size={20}/>, c: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
  { id: 'repair', n: 'Repair', i: <Lucide.Wrench size={20}/>, c: 'bg-amber-50 text-amber-500 border-amber-100' }
];

// --- UI Components for System Messages (Replacing Alerts) ---
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

// --- MAIN APPLICATION ---
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
  const [toast, setToast] = useState(null); // { msg, type }
  const [activeModal, setActiveModal] = useState(null); // { type, data }

  // Form States
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    source: 'Chiplun', destination: '', numSeats: 1
  });
  const [regForm, setRegForm] = useState({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [trackedBooking, setTrackedBooking] = useState(null);
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });

  // Input Refs for Modals
  const modalInput1 = useRef('');
  const modalInput2 = useRef('');

  // --- Helpers ---
  const notify = (msg, type = 'success') => setToast({ msg, type });
  const closeToast = () => setToast(null);

  // --- Firebase Sync ---
  useEffect(() => {
    const initAuth = async () => {
      // Prioritize custom token if available (Environment provided)
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Conforming to Rule 1: Strict Paths
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
      }, (error) => console.error("Profile sync error:", error)),
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Stores sync error:", e)),
      onSnapshot(paths.bookings, (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Bookings sync error:", e)),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))), (e) => console.error("Requests sync error:", e))
    ];

    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // --- Memos (Rule 2: No Complex Queries) ---
  const filteredStores = useMemo(() => {
    return stores.filter(s => 
      s.isLive && 
      (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
       s.category?.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [stores, searchQuery]);

  const merchantStats = useMemo(() => {
    if (!profile.businessId) return { revenue: 0, queue: [] };
    const bookings = allBookings.filter(b => b.storeId === profile.businessId);
    const revenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);
    const queue = bookings.filter(b => b.status === 'pending');
    return { revenue, queue };
  }, [allBookings, profile.businessId]);

  // --- Core Actions ---
  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const displayId = "CH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const service = cart[0];
    let finalPrice = Number(service.price);
    
    // Travel Logic per V50 Spec
    if (selectedStore.category === 'travel' && bookingMeta.destination) {
      const isShort = !service.name.toLowerCase().includes(bookingMeta.destination.toLowerCase());
      if (isShort) finalPrice = Math.floor(finalPrice * 0.7);
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
      // Private User Record
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

  // --- ADMIN ACTIONS (Replacing Alerts with Modals) ---
  
  const initiateApproval = (req) => {
    setActiveModal({ type: 'approve', data: req });
  };

  const confirmApprove = async () => {
    const req = activeModal.data;
    const mid = modalInput1.current.value.toUpperCase();
    const key = modalInput2.current.value;

    if(!mid || !key) return notify("Both fields required", "error");

    setIsProcessing(true);
    try {
      // 1. Create Business Doc
      const storeRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'stores'));
      await setDoc(storeRef, {
        name: req.bizName,
        category: req.category,
        address: req.address,
        isLive: true,
        merchantId: mid,
        image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800",
        services: [{ name: 'Basic Service', price: 100, duration: 30 }],
        staff: [{ name: 'Owner' }]
      });

      // 2. Create Creds
      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'vendor_creds', mid), {
        storeId: storeRef.id,
        businessName: req.bizName,
        password: key
      });

      // 3. Cleanup Request
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'requests', req.id));

      notify(`Live: ${mid}`);
      setActiveModal(null);
    } catch (e) {
      notify("Approval Failed", "error");
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const initiateReject = (id) => setActiveModal({ type: 'reject', data: id });
  
  const confirmReject = async () => {
    await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'requests', activeModal.data));
    notify("Application Rejected");
    setActiveModal(null);
  };

  const initiatePurge = (s) => setActiveModal({ type: 'purge', data: s });

  const confirmPurge = async () => {
    const s = activeModal.data;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'stores', s.id));
      if (s.merchantId) {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'vendor_creds', s.merchantId.toUpperCase()));
      }
      notify("Business Purged");
    } catch (e) { notify("Purge Error", "error"); }
    setActiveModal(null);
  };

  const completeBooking = async (id) => {
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'bookings', id), { status: 'completed' });
    notify("Order Completed");
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-[0.3em]">
      CHIPLUNCONNECT SUPREME
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={closeToast} />}

      {/* GLOBAL HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme Nexus • V50</p>
          </div>
          <button 
            onClick={() => setView('business')} 
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all shadow-inner ${view === 'business' ? 'bg-white text-emerald-600 border-white' : 'bg-white/10 text-white border-white/10 active:bg-white/20'}`}
          >
            <Lucide.Briefcase size={20} />
          </button>
        </div>

        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Find salons, travel, clinics..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 shadow-inner transition-all" />
          </div>
        )}
      </header>

      {/* VIEWPORT */}
      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* HOME VIEW */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in zoom-in duration-700">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setSearchQuery(cat.id === searchQuery ? '' : cat.id)} className={`flex flex-col items-center gap-2 p-1 transition-all ${searchQuery === cat.id ? 'scale-110 opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                  <div className={`${cat.c} p-4 rounded-[1.5rem] shadow-sm border`}>{cat.i}</div>
                  <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">{cat.n}</span>
                </button>
              ))}
            </div>

            <section className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Live Businesses</h2>
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
              </div>
            </section>
          </div>
        )}

        {/* DUAL-PURPOSE BUSINESS HUB */}
        {view === 'business' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth Engine for Chiplun Merchants</p>
            </div>

            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 shadow-lg ${bizSubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'register' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Join Network</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Merchant Login</button>
            </div>

            {bizSubView === 'register' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-white p-5 rounded-[2rem] border border-slate-100 flex flex-col items-center text-center shadow-sm">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-2"><Lucide.TrendingUp size={20}/></div>
                      <h4 className="text-[10px] font-black uppercase tracking-tight leading-none">Massive Reach</h4>
                      <p className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter mt-1 leading-tight">Connect with 5,000+ local customers monthly.</p>
                   </div>
                   <div className="bg-white p-5 rounded-[2rem] border border-slate-100 flex flex-col items-center text-center shadow-sm">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-2"><Lucide.Zap size={20}/></div>
                      <h4 className="text-[10px] font-black uppercase tracking-tight leading-none">Smart Ledger</h4>
                      <p className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter mt-1 leading-tight">Ditch paper logs. Automate your queue.</p>
                   </div>
                </div>

                <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4">
                  <div className="text-center mb-6">
                    <h3 className="font-black text-xs uppercase tracking-widest italic">Professional Application</h3>
                    <div className="h-1 w-12 bg-emerald-500 mx-auto mt-2 rounded-full"></div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Owner Name</label>
                        <input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="E.G. RAHUL PATIL" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Mobile</label>
                        <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="+91 000..." />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Business Name</label>
                      <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="E.G. SUPREME SALON" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Business Type</label>
                      <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner appearance-none cursor-pointer">
                        {CATEGORIES.map(c => <option key={c.id} value={c.id} className="text-slate-900">{c.n} SERVICES</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Location / Area</label>
                      <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="STATION ROAD, CHIPLUN" />
                    </div>
                    <button onClick={submitRegistration} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-100 active:scale-[0.97] transition-all">Submit Professional Profile</button>
                    <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] pt-4">System Overdrive Access</button>
                  </div>
                </div>
              </div>
            )}

            {bizSubView === 'login' && (
              <div className="space-y-6 animate-in fade-in duration-500 py-10">
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl border border-slate-100 mx-auto flex items-center justify-center text-emerald-600"><Lucide.ShieldCheck size={36}/></div>
                  <div>
                    <h3 className="text-lg font-black uppercase italic tracking-tighter">Welcome Back</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enter Merchant Credentials to Sync Ledger</p>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 max-w-sm mx-auto w-full">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2 tracking-widest">Merchant ID</label>
                      <input value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 shadow-inner text-center tracking-tighter" placeholder="CH-XXXX" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 ml-2 tracking-widest">Security Key</label>
                      <input type="password" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-5 rounded-2xl text-center outline-none focus:border-emerald-500 shadow-inner" placeholder="••••••••" />
                    </div>
                    <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-[0.97] transition-all">Unlock Dashboard</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ADMIN OVERRIDE TERMINAL */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <div className="flex justify-between items-center px-2">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter">Admin Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg"><Lucide.Home size={18}/></button>
             </div>
             
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4">
                 <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">Identity Verification Required</p>
                 <input type="password" placeholder="System PIN" value={adminPin} onChange={e => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl shadow-inner border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else notify("Access Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Authenticate</button>
               </div>
             ) : (
               <div className="space-y-6">
                 {/* Admin Tabs */}
                 <div className="flex bg-slate-200 p-1 rounded-2xl">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600' : 'text-slate-500'}`}>Applications ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600' : 'text-slate-500'}`}>Live Stores ({stores.length})</button>
                 </div>

                 {/* Tab Content: Requests */}
                 {adminTab === 'requests' && (
                   <div className="space-y-4 pb-20">
                     {requests.length > 0 ? requests.map(r => (
                       <div key={r.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4 animate-in slide-in-from-bottom-4">
                           <div className="flex justify-between items-start">
                             <div>
                                <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{r.category} • {r.address}</p>
                             </div>
                             <Lucide.FileText size={20} className="text-slate-200" />
                           </div>
                           <div className="bg-slate-50 p-4 rounded-2xl text-[10px] font-bold uppercase space-y-1 shadow-inner border border-slate-100">
                             <p className="flex justify-between"><span>Applicant:</span><span className="text-rose-600">{r.name}</span></p>
                             <p className="flex justify-between"><span>Phone:</span><span className="text-rose-600">{r.phone}</span></p>
                           </div>
                           <div className="flex gap-2 pt-2">
                             <button onClick={() => initiateReject(r.id)} className="flex-1 py-4 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95 transition-all">Reject</button>
                             <button onClick={() => initiateApproval(r)} disabled={isProcessing} className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Manual Approve</button>
                           </div>
                        </div>
                     )) : (
                       <div className="text-center py-20 opacity-30 italic font-bold uppercase text-[10px] tracking-widest">No pending applications</div>
                     )}
                   </div>
                 )}

                 {/* Tab Content: Merchants */}
                 {adminTab === 'merchants' && (
                   <div className="space-y-4 pb-20">
                     {stores.map(s => (
                       <div key={s.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-4 animate-in fade-in">
                           <div className="flex justify-between items-center">
                             <div>
                                <h4 className="font-black text-xs uppercase italic">{s.name}</h4>
                                <p className="text-[8px] font-black text-rose-600 uppercase tracking-[0.2em] mt-0.5">ID: {s.merchantId || 'LEGACY'}</p>
                             </div>
                             <div className="flex gap-1">
                                <button title="Delete Business" onClick={() => initiatePurge(s)} className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600 border border-slate-100"><Lucide.Trash2 size={16}/></button>
                             </div>
                           </div>
                           <div className="grid grid-cols-2 gap-2 text-[8px] font-black uppercase text-slate-400">
                             <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-inner">
                                <p className="opacity-50 mb-1">Status</p>
                                <p className="text-emerald-600">{s.isLive ? 'Online' : 'Offline'}</p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-inner">
                               <p className="opacity-50 mb-1">Category</p>
                                <p className="text-slate-900">{s.category}</p>
                             </div>
                           </div>
                        </div>
                     ))}
                   </div>
                 )}
               </div>
             )}
          </div>
        )}

        {/* DETAIL VIEW */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest">
              <Lucide.ArrowLeft size={16} className="mr-2"/> Back to Discovery
            </button>
            <div className="relative">
              <img src={selectedStore.image || "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800"} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={selectedStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8">
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Available Services</h3>
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
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center italic">Appointment Details</h3>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                    <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                  </div>
                  <input placeholder="WhatsApp Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner" />
                  <button disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-40">Review & Confirm</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MERCHANT DASHBOARD VIEW */}
        {view === 'merchant' && profile.role === 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center px-2">
              <div>
                <h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tighter">{profile.businessName}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Merchant Console</p>
              </div>
              <button onClick={() => setView('home')} className="p-3 bg-slate-100 rounded-xl text-slate-400"><Lucide.Home size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Total Revenue</p>
                <p className="text-2xl font-black text-emerald-600 tracking-tighter">₹{merchantStats.revenue}</p>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Pending Queue</p>
                <p className="text-2xl font-black text-blue-600 tracking-tighter">{merchantStats.queue.length}</p>
              </div>
            </div>
            <section className="bg-emerald-600 text-white p-6 rounded-[3rem] shadow-xl space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80 italic text-center">Active Ledger</h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {merchantStats.queue.map((b, i) => (
                  <div key={i} className="bg-white/10 p-5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-sm uppercase italic">{b.custName || 'Guest'}</p>
                        <p className="text-[8px] font-bold text-emerald-200 uppercase mt-0.5">{b.serviceName}</p>
                      </div>
                      <span className="bg-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter">#{b.displayId}</span>
                    </div>
                    <button onClick={() => completeBooking(b.id)} className="w-full bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest p-3 rounded-xl shadow-lg mt-4 active:scale-95">Complete Order</button>
                  </div>
                ))}
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

      {/* --- MODALS (Replaces Alerts) --- */}
      
      {/* 1. Booking Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border-t-8 border-emerald-500 text-center">
              <Lucide.ShieldCheck size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase tracking-tighter italic mb-4">Finalize Booking</h3>
              <div className="bg-slate-50 p-5 rounded-2xl text-[10px] font-black uppercase text-left space-y-3 border border-slate-100 mb-6 shadow-inner">
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Merchant:</span><span className="text-emerald-600">{selectedStore?.name}</span></div>
                 <div className="flex justify-between"><span>Service:</span><span>{cart[0]?.name}</span></div>
                 <div className="flex justify-between pt-2 border-t border-slate-200 text-sm text-slate-900 font-black"><span>Payable:</span><span className="text-emerald-600 text-lg">₹{cart[0]?.price * (selectedStore?.category === 'travel' ? (bookingMeta.numSeats || 1) : 1)}</span></div>
              </div>
              <button disabled={isProcessing} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]">{isProcessing ? 'Verifying...' : 'Finalize & Book'}</button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-slate-400 font-black text-[10px] uppercase">Wait, Go Back</button>
           </div>
        </div>
      )}

      {/* 2. Admin Logic Modals */}
      {activeModal?.type === 'approve' && (
        <Modal title="Issue License" onClose={() => setActiveModal(null)}>
           <div className="space-y-4">
             <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Assign Merchant ID</label>
                <input ref={modalInput1} className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black uppercase text-center" placeholder="CH-XXXX" />
             </div>
             <div className="space-y-1">
                <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Set Security Key</label>
                <input ref={modalInput2} className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-black text-center" placeholder="Secret Key" />
             </div>
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
