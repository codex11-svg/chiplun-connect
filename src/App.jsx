import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- System Configuration ---
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
const appId = "chiplun-pro-v50-supreme-final"; 
const ADMIN_PIN = "112607";

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500 border-rose-100' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500 border-blue-100' },
  { id: 'clinic', n: 'Clinic', i: <Lucide.Stethoscope size={20}/>, c: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
  { id: 'repair', n: 'Repair', i: <Lucide.Wrench size={20}/>, c: 'bg-amber-50 text-amber-500 border-amber-100' }
];

export default function App() {
  // --- Global State ---
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- Data State ---
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // --- UI State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminTab, setAdminTab] = useState('requests'); 
  const [bizSubView, setBizSubView] = useState('register');

  // --- Form States ---
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    source: 'Chiplun', destination: '', numSeats: 1
  });
  const [regForm, setRegForm] = useState({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [trackedBooking, setTrackedBooking] = useState(null);
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });

  // --- FIREBASE RULE 3: AUTH FIRST ---
  useEffect(() => {
    const init = async () => {
      onAuthStateChanged(auth, async (u) => {
        if (!u) {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        }
        setUser(u);
      });
    };
    init();
  }, []);

  // --- FIREBASE RULES 1 & 2: SYNC ---
  useEffect(() => {
    if (!user) return;

    const paths = {
      profile: doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'),
      stores: collection(db, 'artifacts', appId, 'public', 'data', 'stores'),
      bookings: collection(db, 'artifacts', appId, 'public', 'data', 'bookings'),
      requests: collection(db, 'artifacts', appId, 'public', 'data', 'requests')
    };

    const unsubs = [
      onSnapshot(paths.profile, (snap) => {
        if (snap.exists()) setProfile(snap.data());
        else setDoc(paths.profile, { role: 'customer', uid: user.uid });
        setLoading(false);
      }),
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.bookings, (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];

    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // --- MEMOS ---
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

  // --- ACTIONS ---
  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const displayId = "CH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const service = cart[0];
    let finalPrice = Number(service.price);
    
    // Dynamic Pricing for Travel
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
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setTrackedBooking(payload);
      setShowConfirmModal(false);
      setView('track');
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleVendorLogin = async () => {
    setIsProcessing(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id.toUpperCase()));
      if (snap.exists() && snap.data().password === vendorLogin.pass) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { 
          role: 'vendor', 
          businessId: snap.data().storeId, 
          businessName: snap.data().businessName 
        });
        setView('merchant');
      } else { alert("Invalid Credentials"); }
    } catch (e) { alert("Login Error"); } finally { setIsProcessing(false); }
  };

  // --- MASTER ADMIN MANUAL OVERRIDES ---
  const manualApprove = async (req) => {
    const merchantId = prompt("Enter Custom Merchant ID (CH-XXXX):");
    if (!merchantId) return;
    const securityKey = prompt("Set Custom Security Key:");
    if (!securityKey) return;

    setIsProcessing(true);
    try {
      const storeRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
      await setDoc(storeRef, {
        name: req.bizName,
        category: req.category,
        address: req.address,
        isLive: true,
        merchantId: merchantId.toUpperCase(),
        image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800",
        services: [{ name: 'Standard Service', price: 100, duration: 30 }],
        staff: [{ name: 'Expert 1' }]
      });

      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', merchantId.toUpperCase()), {
        storeId: storeRef.id,
        businessName: req.bizName,
        password: securityKey
      });

      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
      alert("Business Live with custom credentials.");
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const modifyMerchantCredentials = async (s) => {
    const mode = prompt("Type 'ID' to change Merchant ID or 'KEY' to change Security Key:");
    if (mode?.toUpperCase() === 'ID') {
      const newId = prompt("Enter New Merchant ID:", s.merchantId);
      if (newId && newId.toUpperCase() !== s.merchantId) {
        const oldRef = doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', s.merchantId);
        const snap = await getDoc(oldRef);
        if (snap.exists()) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', newId.toUpperCase()), snap.data());
          await deleteDoc(oldRef);
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id), { merchantId: newId.toUpperCase() });
        alert("Merchant ID updated.");
      }
    } else if (mode?.toUpperCase() === 'KEY') {
      const newKey = prompt("Enter New Security Key:");
      if (newKey) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', s.merchantId), { password: newKey });
        alert("Security Key updated.");
      }
    }
  };

  const purgeBusiness = async (s) => {
    if (window.confirm("Purge Business Permanently?")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id));
      if (s.merchantId) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', s.merchantId));
      alert("Purged.");
    }
  };

  const completeBooking = async (id) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id), { status: 'completed' });
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-[0.3em]">
      CHIPLUNCONNECT SUPREME FINAL
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* GLOBAL HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme V50 • Final</p>
          </div>
          <button 
            onClick={() => setView('business')} 
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'business' ? 'bg-white text-emerald-600 border-white shadow-inner' : 'bg-white/10 text-white border-white/10 active:bg-white/20'}`}
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
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in duration-700">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setSearchQuery(cat.id === searchQuery ? '' : cat.id)} className={`flex flex-col items-center gap-2 p-1 transition-all ${searchQuery === cat.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
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
                    <img src={store.image} className="w-20 h-20 rounded-[1.5rem] object-cover bg-slate-50" alt={store.name} />
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

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connect • Grow • Prosper</p>
            </div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 shadow-lg ${bizSubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'register' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Join Network</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors duration-300 ${bizSubView === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-700'}`}>Merchant Login</button>
            </div>
            {bizSubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Shop Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Mobile Number" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500">
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.n} Services</option>)}
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500 shadow-inner" placeholder="Full Location" />
                <button onClick={submitRegistration} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-[0.97] transition-all shadow-xl">Apply for Listing</button>
                <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] pt-4">Admin Suite</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-inner"><Lucide.ShieldCheck size={36}/></div>
                <input value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 text-center tracking-tighter" placeholder="CH-XXXX" />
                <input type="password" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none focus:border-emerald-500" placeholder="••••••••" />
                <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl active:scale-[0.97] transition-all">Unlock Terminal</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: MERCHANT CONSOLE */}
        {view === 'merchant' && profile.role === 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tighter">{profile.businessName}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Ledger Console</p>
              </div>
              <button onClick={() => setView('home')} className="p-3 bg-slate-100 rounded-xl text-slate-400"><Lucide.Home size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Revenue</p>
                <p className="text-2xl font-black text-emerald-600 tracking-tighter">₹{merchantStats.revenue}</p>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Queue</p>
                <p className="text-2xl font-black text-blue-600 tracking-tighter">{merchantStats.queue.length}</p>
              </div>
            </div>
            <section className="bg-emerald-600 text-white p-6 rounded-[3.5rem] shadow-xl space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80 italic text-center">Active Ledger</h3>
              <div className="space-y-3">
                {merchantStats.queue.map((b, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10 animate-in slide-in-from-left-4" style={{animationDelay: `${i*100}ms`}}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-sm uppercase italic tracking-tight">{b.custName || 'Guest'}</p>
                        <p className="text-[8px] font-bold text-emerald-200 uppercase mt-0.5">{b.serviceName}</p>
                      </div>
                      <span className="bg-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter italic border border-white/5">#{b.displayId}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                       <button onClick={() => window.open(`https://wa.me/${b.custPhone}`)} className="flex-1 bg-white/20 p-3 rounded-xl border border-white/5 hover:bg-white/30 transition-all"><Lucide.MessageCircle size={16} className="mx-auto" /></button>
                       <button onClick={() => completeBooking(b.id)} className="flex-[3] bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest p-3 rounded-xl shadow-lg active:scale-95 transition-all">Mark as Completed</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: ADMIN MASTER TERMINAL */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter text-center">Admin Overdrive</h2>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4">
                 <input type="password" placeholder="Master PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl shadow-inner border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else alert("Access Denied"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Authenticate System</button>
               </div>
             ) : (
               <div className="space-y-6">
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Requests ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Merchants ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? (
                    <div className="space-y-4 pb-20">
                      {requests.map(r => (
                        <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm">
                           <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                           <div className="bg-slate-50 p-3 rounded-xl text-[9px] font-black uppercase space-y-1 shadow-inner border border-slate-100 text-slate-500">
                             <p className="flex justify-between"><span>Applicant:</span><span>{r.name}</span></p>
                             <p className="flex justify-between"><span>Location:</span><span>{r.address}</span></p>
                           </div>
                           <div className="flex gap-2 pt-2">
                             <button onClick={async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95 transition-all">Reject</button>
                             <button onClick={() => manualApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Manual Approve</button>
                           </div>
                        </div>
                      ))}
                    </div>
                 ) : (
                    <div className="space-y-4 pb-20">
                      {stores.map(s => (
                        <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm">
                           <div className="flex justify-between items-center">
                             <div>
                               <h4 className="font-black text-xs uppercase italic leading-none">{s.name}</h4>
                               <p className="text-[8px] font-black text-rose-600 uppercase tracking-widest mt-1">ID: {s.merchantId}</p>
                             </div>
                             <div className="flex gap-1">
                               <button onClick={() => modifyMerchantCredentials(s)} className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-blue-500 border border-slate-100"><Lucide.Settings2 size={16}/></button>
                               <button onClick={() => purgeBusiness(s)} className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-rose-600 border border-slate-100"><Lucide.Trash2 size={16}/></button>
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

        {/* VIEW: DETAIL (BOOKING ENGINE) */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest">
              <Lucide.ArrowLeft size={16} className="mr-2"/> Back to Discovery
            </button>
            <div className="relative">
              <img src={selectedStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={selectedStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>
            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2">Services</h3>
              <div className="space-y-3">
                {selectedStore.services?.map((s, idx) => (
                  <div key={idx} onClick={() => setCart([s])} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <div>
                      <p className="font-bold text-sm uppercase italic">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1 opacity-70 uppercase">{selectedStore.category === 'travel' ? 'Per Seat' : `${s.duration} MINS`}</p>
                    </div>
                    <span className="font-black text-emerald-600 text-lg tracking-tighter italic">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>
            {cart.length > 0 && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6">
                <div className="space-y-4">
                  {selectedStore.category === 'travel' && (
                    <div className="grid grid-cols-2 gap-2">
                       <input placeholder="To Area" value={bookingMeta.destination} onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner border-slate-100" />
                       <input type="number" placeholder="Seats" min="1" max="10" value={bookingMeta.numSeats} onChange={e => setBookingMeta({...bookingMeta, numSeats: Number(e.target.value)})} className="bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner border-slate-100" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner border-slate-100" />
                    <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner border-slate-100" />
                  </div>
                  <input placeholder="WhatsApp Mobile" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner uppercase border-slate-100" />
                  <button disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-[0.97] transition-all tracking-widest disabled:opacity-40 shadow-emerald-100">Finalize & Generate Ticket</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACK */}
        {view === 'track' && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Ticket Status</h2>
            {trackedBooking ? (
              <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6">
                <Lucide.CheckCircle2 size={40} className="text-emerald-600 mx-auto" />
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase italic leading-none">{trackedBooking.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[10px] font-black uppercase text-left space-y-2 border border-slate-100 shadow-inner">
                  <div className="flex justify-between"><span>Shop:</span><span className="text-emerald-700">{trackedBooking.storeName}</span></div>
                  <div className="flex justify-between"><span>Service:</span><span>{trackedBooking.serviceName}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs text-slate-900 font-black"><span>Total Payable:</span><span className="text-emerald-600">₹{trackedBooking.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all">Back to Discovery</button>
              </div>
            ) : (
              <div className="space-y-4">
                <input placeholder="Enter Token ID (CH-XXXX)" value={trackInput} onChange={e => setTrackInput(e.target.value)} className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 font-black text-center text-lg uppercase outline-none focus:border-emerald-500" />
                <button onClick={() => { const found = allBookings.find(b => b.displayId === trackInput.toUpperCase()); if (found) setTrackedBooking(found); else alert("Invalid Token"); }} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Find Ticket</button>
              </div>
            )}
          </div>
        )}

      </main>

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border-t-8 border-emerald-500 text-center">
              <Lucide.ShieldCheck size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase tracking-tighter italic mb-4 leading-none">Confirm Appointment</h3>
              <div className="bg-slate-50 p-5 rounded-2xl text-[10px] font-black uppercase text-left space-y-3 border border-slate-100 mb-6 shadow-inner">
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Merchant:</span><span className="text-emerald-600">{selectedStore?.name}</span></div>
                 <div className="flex justify-between"><span>Service:</span><span>{cart[0]?.name}</span></div>
                 <div className="flex justify-between pt-2 border-t border-slate-200 text-sm text-slate-900 font-black"><span>Estimate:</span><span className="text-emerald-600 text-lg">₹{cart[0]?.price * (selectedStore?.category === 'travel' ? (bookingMeta.numSeats || 1) : 1)}</span></div>
              </div>
              <button disabled={isProcessing} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]">{isProcessing ? 'Verifying...' : 'Finalize Ticket'}</button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest">Wait, Go Back</button>
           </div>
        </div>
      )}

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Compass size={24} /></button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Ticket size={24} /></button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button onClick={() => setView('business')} className={`transition-all ${view === 'business' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300'}`}><Lucide.Briefcase size={24} /></button>
      </nav>

    </div>
  );
}

