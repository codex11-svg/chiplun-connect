import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- PRODUCTION CONFIG ---
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
const appId = "chiplun-supreme-v50-final"; 
const ADMIN_PIN = "112607";

// --- LOGISTICS DATA ---
const ROUTE_STOPS = [
  { n: "Chiplun", km: 0 },
  { n: "Khed", km: 45 },
  { n: "Mangaon", km: 105 },
  { n: "Panvel", km: 210 },
  { n: "Mumbai", km: 250 }
];

export default function App() {
  // Global Session
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data State
  const [stores, setStores] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminTab, setAdminTab] = useState('requests'); 
  const [bizView, setBizView] = useState('login');
  const [mTab, setMTab] = useState('ledger'); 
  const [tracked, setTracked] = useState(null);

  // Forms
  const [bookMeta, setBookMeta] = useState({ date: '', time: '', phone: '', resId: '', seats: 1, pickup: 'Chiplun', drop: 'Mumbai' });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });

  // --- FIREBASE SYNC (RULES 1, 2, 3) ---
  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      }
      setUser(u);
    });
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
      onSnapshot(paths.profile, (s) => s.exists() ? setProfile(s.data()) : setDoc(paths.profile, { role: 'customer' })),
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.bookings, (s) => setBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    setTimeout(() => setLoading(false), 800);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- LOGIC CALCULATIONS ---
  const liveStores = useMemo(() => stores.filter(s => 
    s.isLive && (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [stores, searchQuery]);

  const activeMerchant = useMemo(() => {
    if (!profile.businessId) return null;
    const s = stores.find(x => x.id === profile.businessId);
    const b = bookings.filter(x => x.storeId === profile.businessId);
    return {
      store: s,
      revenue: b.filter(x => x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0),
      pending: b.filter(x => x.status === 'pending')
    };
  }, [bookings, profile.businessId, stores]);

  const calculateDynamicFare = () => {
    if (!selectedStore || cart.length === 0) return 0;
    const pKM = ROUTE_STOPS.find(s => s.n === bookMeta.pickup)?.km || 0;
    const dKM = ROUTE_STOPS.find(s => s.n === bookMeta.drop)?.km || 0;
    const distance = Math.abs(dKM - pKM);
    const rate = Number(cart[0].price) || 0;
    return distance * rate * (bookMeta.seats || 1);
  };

  const getInventoryStatus = (sId, rId, capacity) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const occupied = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, remaining: (capacity || 0) - occupied };
  };

  // --- ACTIONS ---
  const handleBooking = async () => {
    setIsProcessing(true);
    try {
      const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
      const finalPrice = selectedStore.category === 'travel' ? calculateDynamicFare() : Number(cart[0].price);
      const payload = { ...bookMeta, displayId: id, storeId: selectedStore.id, storeName: selectedStore.name, serviceName: cart[0].name, totalPrice: finalPrice, status: 'pending', timestamp: Date.now() };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setTracked(payload);
      setView('track');
    } catch (e) { console.error(e); }
    setIsProcessing(false);
  };

  const handleAdminApprove = async (req) => {
    const mId = prompt("Manual Merchant ID:");
    const pass = prompt("Manual Security Key:");
    if (!mId || !pass) return;
    setIsProcessing(true);
    const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
    await setDoc(sRef, { name: req.bizName, category: req.category, address: req.address, isLive: false, merchantId: mId.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mId.toUpperCase()), { storeId: sRef.id, businessName: req.bizName, password: pass });
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
    setIsProcessing(false);
    alert("Approved. Partner can now setup their dashboard.");
  };

  const handleVLogin = async () => {
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase()));
    if (snap.exists() && snap.data().password === vLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
      setView('merchant');
    } else alert("Invalid Credentials");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-widest">CHIPLUNCONNECT SUPREME</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme V50 Master</p>
          </div>
          <button 
            onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'business')} 
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border transition-all ${view === 'business' || view === 'merchant' ? 'bg-white text-emerald-600 border-white' : 'bg-white/10'}`}
          >
            <Lucide.Briefcase size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Salons, Travels, Repairs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in">
               <button onClick={() => setSearchQuery('salon')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Scissors size={20} className="text-rose-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">Salon</span></button>
               <button onClick={() => setSearchQuery('travel')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Bus size={20} className="text-blue-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">Travel</span></button>
               <button onClick={() => setSearchQuery('clinic')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Stethoscope size={20} className="text-emerald-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">Clinic</span></button>
               <button onClick={() => setSearchQuery('repair')} className="flex flex-col items-center gap-2"><div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm"><Lucide.Wrench size={20} className="text-amber-500"/></div><span className="text-[9px] font-black uppercase text-slate-400 tracking-tighter">Repair</span></button>
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Active Partners</h2>
              <div className="space-y-4">
                {liveStores.map(store => (
                  <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); setBookMeta({ ...bookMeta, resId: '' }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 active:scale-[0.98] transition-all group">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase mt-1 leading-tight">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200 group-hover:text-emerald-500 mr-2" />
                  </div>
                ))}
                {liveStores.length === 0 && <p className="text-center py-20 text-slate-300 font-black uppercase text-[10px] tracking-widest">No matching partners live</p>}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD */}
        {view === 'merchant' && activeMerchant && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl active:scale-90"><Lucide.LogOut size={20}/></button>
            </div>

            {/* MASTER LIVE TOGGLE */}
            <div className={`p-6 rounded-[2.5rem] flex items-center justify-between shadow-lg transition-all ${activeMerchant.store.isLive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div><p className="text-[9px] font-black uppercase opacity-70">Visibility Status</p><p className="text-xl font-black uppercase italic">{activeMerchant.store.isLive ? 'Open for Bookings' : 'Currently Hidden'}</p></div>
              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !activeMerchant.store.isLive })} className={`w-14 h-8 rounded-full p-1 ${activeMerchant.store.isLive ? 'bg-white' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all ${activeMerchant.store.isLive ? 'bg-emerald-600 ml-6' : 'bg-white'}`} /></button>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                {['ledger', 'inventory', 'services'].map(t => (
                    <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-widest ${mTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>{t}</button>
                ))}
            </div>

            {/* TAB: QUEUE LEDGER */}
            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">REVENUE</p><p className="text-2xl font-black text-emerald-600">₹{activeMerchant.revenue}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">IN QUEUE</p><p className="text-2xl font-black text-blue-600">{activeMerchant.pending.length}</p></div>
                  </div>
                  {activeMerchant.pending.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm flex justify-between items-center animate-in slide-in-from-left-4">
                      <div><p className="font-black text-sm uppercase italic tracking-tight">{b.custName || 'User'}</p><p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{b.serviceName} @ {b.time}</p></div>
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Lucide.CheckCircle2 size={18}/></button>
                    </div>
                  ))}
               </section>
            )}

            {/* TAB: INVENTORY (SMART RESOURCES) */}
            {mTab === 'inventory' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6">
                <button onClick={() => {
                   const n = prompt(activeMerchant.store.category === 'salon' ? "Staff Name:" : "Trip Route & Time:");
                   const c = activeMerchant.store.category === 'travel' ? prompt("Vehicle Seat Capacity (e.g. 4):") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-emerald-500">+ Add {activeMerchant.store.category === 'salon' ? 'Expert' : 'Trip Slot'}</button>
                {activeMerchant.store.resources?.map((r, i) => (
                   <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div><p className="font-black text-xs uppercase italic">{r.name}</p>{activeMerchant.store.category === 'travel' && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Capacity: {r.capacity} Seats</p>}</div>
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500"><Lucide.Trash2 size={16}/></button>
                   </div>
                ))}
              </div>
            )}

            {/* TAB: SERVICES */}
            {mTab === 'services' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6">
                  <button onClick={() => {
                     const n = prompt("Service Description:");
                     const p = prompt(activeMerchant.store.category === 'travel' ? "Fare Rate per KM (₹):" : "Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-emerald-500">+ Add Service</button>
                  {activeMerchant.store.services?.map((s, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="font-black text-xs uppercase">{s.name} • ₹{s.price}{activeMerchant.store.category === 'travel' ? '/KM' : ''}</p>
                       <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="p-2 text-rose-500"><Lucide.X size={16}/></button>
                    </div>
                  ))}
               </div>
            )}
          </div>
        )}

        {/* VIEW: ADMIN Master Terminal */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <div className="flex justify-between items-center px-2">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter">System Master</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <Lucide.Lock size={32} className="mx-auto text-rose-600 opacity-20 mb-4" />
                 <input type="password" placeholder="Admin PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else alert("Access Denied"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Verify Access</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1">
                 <div className="flex bg-slate-200 p-1 rounded-2xl">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Stores ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight leading-none">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase">Reject</button>
                          <button onClick={() => handleAdminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg">Manual Approve</button>
                        </div>
                    </div>
                 )) : stores.map(s => (
                    <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center">
                       <div><h4 className="font-black text-xs uppercase italic">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1 uppercase tracking-widest">ID: {s.merchantId}</p></div>
                       <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id))} className="p-2 text-rose-600 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                    </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL (USER BOOKING ENGINE) */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest"><Lucide.ArrowLeft size={16} className="mr-2"/> Back</button>
            <div className="relative">
              <img src={selectedStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl shadow-emerald-900/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>

            {/* SELECTION ENGINE */}
            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2">1. Choose Service</h3>
              <div className="space-y-2">
                {selectedStore.services?.length > 0 ? selectedStore.services.map((s, idx) => (
                  <div key={idx} onClick={() => setCart([s])} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter">₹{s.price}{selectedStore.category === 'travel' ? '/KM' : ''}</span>
                  </div>
                )) : <p className="text-center text-[10px] text-slate-300 font-bold uppercase py-4">No services listed yet</p>}
              </div>
            </section>

            {cart.length > 0 && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic">2. Logistics & Time</h3>
                  
                  {/* TRAVEL SEGMENTATION ENGINE */}
                  {selectedStore.category === 'travel' && (
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Pickup</label>
                          <select value={bookMeta.pickup} onChange={e => setBookMeta({...bookMeta, pickup: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] outline-none border">
                            {ROUTE_STOPS.map(s => <option key={s.n} value={s.n}>{s.n}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Drop</label>
                          <select value={bookMeta.drop} onChange={e => setBookMeta({...bookMeta, drop: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] outline-none border">
                            {ROUTE_STOPS.map(s => <option key={s.n} value={s.n}>{s.n}</option>)}
                          </select>
                        </div>
                    </div>
                  )}

                  {/* RESOURCE SELECTOR */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Available {selectedStore.category === 'salon' ? 'Experts' : 'Trip Slots'}</label>
                    {selectedStore.resources?.length > 0 ? selectedStore.resources.map(r => {
                      const { count, remaining } = getResourceStats(selectedStore.id, r.id, r.capacity);
                      const isFull = selectedStore.category === 'travel' && remaining <= 0;
                      return (
                        <div key={r.id} onClick={() => !isFull && setBookMeta({...bookMeta, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookMeta.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed' : ''}`}>
                          <span className="font-black text-[10px] uppercase italic">{r.name}</span>
                          <span className={`text-[8px] font-black uppercase ${isFull ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {selectedStore.category === 'salon' ? `Waitlist: ${count} (~${count * 20}m)` : isFull ? 'Sold Out' : `${remaining} Seats Left`}
                          </span>
                        </div>
                      );
                    }) : <p className="text-center text-[10px] text-slate-300 font-bold uppercase py-2 tracking-tighter">No active staff or slots</p>}
                  </div>

                  {selectedStore.category === 'travel' && bookMeta.resId && (
                    <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-4 rounded-2xl border border-blue-100 items-center">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-blue-400 uppercase">Seats</label>
                          <input type="number" min="1" max="10" value={bookMeta.seats} onChange={e => setBookMeta({...bookMeta, seats: Number(e.target.value)})} className="w-full bg-white p-3 rounded-lg font-black text-xs outline-none border border-blue-200 shadow-inner" />
                       </div>
                       <div className="text-right">
                          <label className="text-[8px] font-black text-blue-400 uppercase block">Est. Fare</label>
                          <p className="text-xl font-black text-blue-600 tracking-tighter italic">₹{fareCalc}</p>
                       </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookMeta({...bookMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border" />
                    <input type="time" onChange={e => setBookMeta({...bookMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border" />
                  </div>
                  <input placeholder="WhatsApp Number" value={bookMeta.phone} onChange={e => setBookMeta({...bookMeta, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] outline-none border" />
                  <button disabled={!bookMeta.date || !bookMeta.time || !bookMeta.phone || !bookMeta.resId} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Generate Official Ticket</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACKING */}
        {view === 'track' && tracked && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Your Ticket</h2>
            <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6">
                <Lucide.Ticket size={40} className="text-emerald-600 mx-auto" />
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase italic">{tracked.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[9px] font-black uppercase text-left space-y-2 border border-slate-100">
                  <div className="flex justify-between"><span>Shop:</span><span className="text-emerald-700 font-black tracking-tighter">{tracked.storeName}</span></div>
                  <div className="flex justify-between"><span>Service:</span><span>{tracked.serviceName}</span></div>
                  {tracked.pickup && <div className="flex justify-between text-blue-600 font-bold border-t border-slate-200 mt-1 pt-1 tracking-tighter"><span>Route:</span><span>{tracked.pickup} ➔ {tracked.drop}</span></div>}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs font-black"><span>Total Payable:</span><span className="text-emerald-600 text-base tracking-tighter">₹{tracked.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-xl">Back to Discovery</button>
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

