import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- CONFIG & INIT ---
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
const appId = "chiplun-v50-supreme-logistics"; 
const ADMIN_PIN = "112607";

// --- LOGISTICS DATA ---
const STOPS = [
  { n: "Chiplun", km: 0 },
  { n: "Khed", km: 45 },
  { n: "Mangaon", km: 105 },
  { n: "Panvel", km: 210 },
  { n: "Mumbai", km: 250 }
];

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500' }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [bizSubView, setBizSubView] = useState('login');
  const [mTab, setMTab] = useState('ledger'); 

  // Forms
  const [bookMeta, setBookMeta] = useState({ date: '', time: '', phone: '', resId: '', seats: 1, pickup: 'Chiplun', drop: 'Mumbai' });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [tracked, setTracked] = useState(null);

  // --- FIREBASE SYNC ---
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
      onSnapshot(paths.bookings, (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    setTimeout(() => setLoading(false), 800);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- LOGIC CALCULATIONS ---
  const filtered = useMemo(() => stores.filter(s => 
    s.isLive && (s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [stores, searchQuery]);

  const mData = useMemo(() => {
    if (!profile.businessId) return null;
    const s = stores.find(x => x.id === profile.businessId);
    const b = allBookings.filter(x => x.storeId === profile.businessId);
    return {
      store: s,
      rev: b.filter(x => x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0),
      queue: b.filter(x => x.status === 'pending')
    };
  }, [allBookings, profile.businessId, stores]);

  const calculateFare = (baseRate, pickup, drop, seats) => {
    const pKM = STOPS.find(s => s.n === pickup)?.km || 0;
    const dKM = STOPS.find(s => s.n === drop)?.km || 0;
    const distance = Math.abs(dKM - pKM);
    // Formula: Rate per km * distance * seats
    return baseRate * distance * (seats || 1);
  };

  const getRemainingSeats = (storeId, resId, totalCapacity) => {
    const booked = allBookings
      .filter(b => b.storeId === storeId && b.resId === resId && b.status === 'pending')
      .reduce((sum, b) => sum + (Number(b.seats) || 0), 0);
    return totalCapacity - booked;
  };

  // --- ACTIONS ---
  const handleBooking = async () => {
    setIsProcessing(true);
    const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
    const service = cart[0];
    
    let finalPrice = Number(service.price);
    if (selectedStore.category === 'travel') {
      finalPrice = calculateFare(service.price, bookMeta.pickup, bookMeta.drop, bookMeta.seats);
    }

    const payload = { 
      ...bookMeta, 
      displayId: id, 
      storeId: selectedStore.id, 
      storeName: selectedStore.name, 
      serviceName: service.name, 
      totalPrice: finalPrice, 
      status: 'pending', 
      timestamp: Date.now() 
    };

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
    setTracked(payload);
    setView('track');
    setIsProcessing(false);
  };

  const handleAdminApprove = async (req) => {
    const mid = prompt("Assign Merchant ID (e.g. CHI-TRAV-01):");
    const pass = prompt("Set Security Key:");
    if (!mid || !pass) return;
    setIsProcessing(true);
    const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
    await setDoc(sRef, { name: req.bizName, category: req.category, address: req.address, isLive: false, merchantId: mid.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mid.toUpperCase()), { storeId: sRef.id, businessName: req.bizName, password: pass });
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
    setIsProcessing(false);
    alert("Authorization Granted. Merchant dashboard is ready.");
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse">CHIPLUNCONNECT SUPREME</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Logistics Engine • V50</p>
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
            <input type="text" placeholder="Search agencies or salons..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3 animate-in fade-in duration-500">
               {CATEGORIES.map(c => (
                 <button key={c.id} onClick={() => setSearchQuery(c.id)} className="flex flex-col items-center gap-2">
                   <div className={`p-4 rounded-2xl border shadow-sm ${searchQuery === c.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100'}`}>{c.i}</div>
                   <span className="text-[9px] font-black uppercase text-slate-500">{c.n}</span>
                 </button>
               ))}
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live in Chiplun</h2>
              <div className="space-y-4">
                {filtered.map(store => (
                  <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 group">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase mt-1 leading-tight">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
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
            <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2></div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 ${bizSubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${bizSubView === 'register' ? 'text-white' : 'text-slate-500'}`}>Apply</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${bizSubView === 'login' ? 'text-white' : 'text-slate-500'}`}>Login</button>
            </div>
            {bizSubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none" placeholder="Business Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none" placeholder="WhatsApp" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none">
                  <option value="salon">Salon</option><option value="travel">Travel Agency</option>
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none" placeholder="Full Location" />
                <button onClick={() => { addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() }).then(() => { alert("Application Sent!"); setView('home'); }) }} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest">Apply for Listing</button>
                <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-widest pt-4">Admin Suite</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 text-center">
                <ShieldCheck size={36} className="mx-auto text-emerald-600 mb-4" />
                <input value={vLogin.id} onChange={e => setVLogin({...vLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none text-center" placeholder="Merchant ID" />
                <input type="password" value={vLogin.pass} onChange={e => setVLogin({...vLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none" placeholder="••••••••" />
                <button onClick={handleVLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl">Unlock Dashboard</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: MERCHANT CONSOLE (MULTI-TAB LOGISTICS) */}
        {view === 'merchant' && mData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl"><Lucide.LogOut size={20}/></button>
            </div>

            {/* LIVE TOGGLE */}
            <div className={`p-6 rounded-[2.5rem] flex items-center justify-between shadow-lg ${mData.store.isLive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div><p className="text-[9px] font-black uppercase opacity-70">Visibility</p><p className="text-xl font-black uppercase italic">{mData.store.isLive ? 'Live & Open' : 'Closed (Hidden)'}</p></div>
              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !mData.store.isLive })} className={`w-14 h-8 rounded-full p-1 ${mData.store.isLive ? 'bg-white' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all ${mData.store.isLive ? 'bg-emerald-600 ml-6' : 'bg-white'}`} /></button>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
                {['ledger', 'inventory', 'pricing'].map(t => (
                    <button key={t} onClick={() => setMTab(t)} className={`flex-1 py-3 px-2 rounded-xl text-[8px] font-black uppercase ${mTab === t ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>{t}</button>
                ))}
            </div>

            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">REVENUE</p><p className="text-2xl font-black text-emerald-600">₹{mData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center"><p className="text-[8px] font-black text-slate-400 mb-1">WAITLIST</p><p className="text-2xl font-black text-blue-600">{mData.queue.length}</p></div>
                  </div>
                  {mData.queue.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm">
                      <div className="flex-1">
                        <p className="font-black text-sm uppercase italic">{b.custName || 'Guest'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{b.serviceName} @ {b.time}</p>
                        {b.pickup && <p className="text-[8px] text-blue-600 font-black uppercase mt-1">{b.pickup} ➔ {b.drop} ({b.seats} Seats)</p>}
                      </div>
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Lucide.CheckCircle size={18}/></button>
                    </div>
                  ))}
               </section>
            )}

            {mTab === 'inventory' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6">
                <button onClick={() => {
                   const n = prompt(mData.store.category === 'salon' ? "Barber Name:" : "Trip Name (e.g. Mumbai 9 AM):");
                   const c = mData.store.category === 'travel' ? prompt("Car Seat Capacity (e.g. 4):") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, capacity: Number(c) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-emerald-500">+ Add Resource</button>
                {mData.store.resources?.map((r, i) => (
                   <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                      <div><p className="font-black text-xs uppercase italic">{r.name}</p>{mData.store.category === 'travel' && <p className="text-[8px] font-black text-slate-400 uppercase">Capacity: {r.capacity} Seats</p>}</div>
                      <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500"><Lucide.Trash2 size={16}/></button>
                   </div>
                ))}
              </div>
            )}

            {mTab === 'pricing' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic">{mData.store.category === 'travel' ? 'Base Rate per KM' : 'Service Pricing'}</h3>
                  <button onClick={() => {
                     const n = prompt("Service Name (e.g. Premium SUV):");
                     const p = prompt(mData.store.category === 'travel' ? "Rate per KM (₹):" : "Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-emerald-500">+ Set Pricing</button>
                  {mData.store.services?.map((s, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                       <p className="font-black text-xs uppercase">{s.name} • ₹{s.price}{mData.store.category === 'travel' ? '/KM' : ''}</p>
                       <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="text-rose-500"><Lucide.X size={16}/></button>
                    </div>
                  ))}
               </div>
            )}
          </div>
        )}

        {/* VIEW: ADMIN Terminal */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter text-center">Master Console</h2>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4">
                 <input type="password" placeholder="System PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else alert("Access Denied"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Enter Terminal</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20">
                 <div className="flex bg-slate-200 p-1 rounded-2xl">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Pending ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600' : 'text-slate-50'}`}>Active ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase">Reject</button>
                          <button onClick={() => handleAdminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg">Manual Approve</button>
                        </div>
                    </div>
                 )) : stores.map(s => (
                    <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center">
                       <div><h4 className="font-black text-xs uppercase italic">{s.name}</h4><p className="text-[8px] font-black text-rose-600 mt-1">ID: {s.merchantId}</p></div>
                       <div className="flex gap-1">
                          <button onClick={async () => { const nid = prompt("New Merchant ID:"); if (nid) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id), { merchantId: nid.toUpperCase() }); }} className="p-2 bg-slate-50 text-slate-400 rounded-lg"><Lucide.Edit2 size={16}/></button>
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id))} className="p-2 bg-slate-50 rounded-lg text-rose-600"><Lucide.Trash2 size={16}/></button>
                       </div>
                    </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL (FARE CALCULATION ENGINE) */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest"><Lucide.ArrowLeft size={16} className="mr-2"/> Back</button>
            <div className="relative">
              <img src={selectedStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>

            {/* SERVICE SELECTION */}
            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2">1. Choose Service</h3>
              <div className="space-y-2">
                {selectedStore.services?.map((s, idx) => (
                  <div key={idx} onClick={() => setCart([s])} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic">{s.name}</p>
                    <span className="font-black text-emerald-600 italic">₹{s.price}{selectedStore.category === 'travel' ? '/KM' : ''}</span>
                  </div>
                ))}
              </div>
            </section>

            {cart.length > 0 && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic">2. Configure {selectedStore.category === 'travel' ? 'Route' : 'Expert'}</h3>
                  
                  {/* TRAVEL LOGISTICS ENGINE */}
                  {selectedStore.category === 'travel' && (
                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Pickup</label>
                             <select value={bookMeta.pickup} onChange={e => setBookMeta({...bookMeta, pickup: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] outline-none border">
                               {STOPS.map(s => <option key={s.n} value={s.n}>{s.n}</option>)}
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Drop-off</label>
                             <select value={bookMeta.drop} onChange={e => setBookMeta({...bookMeta, drop: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] outline-none border">
                               {STOPS.map(s => <option key={s.n} value={s.n}>{s.n}</option>)}
                             </select>
                          </div>
                       </div>
                    </div>
                  )}

                  {/* RESOURCE SELECTION (BARBERS / CAR SLOTS) */}
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Available {selectedStore.category === 'salon' ? 'Barbers' : 'Trip Timings'}</label>
                    {selectedStore.resources?.map(r => {
                      const avail = getRemainingSeats(selectedStore.id, r.id, r.capacity);
                      const wait = selectedStore.category === 'salon' ? (avail * 20) : null;
                      return (
                        <div key={r.id} onClick={() => (selectedStore.category === 'salon' || avail > 0) && setBookMeta({...bookMeta, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookMeta.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'}`}>
                          <span className="font-black text-[10px] uppercase italic">{r.name}</span>
                          <span className={`text-[8px] font-black uppercase ${avail > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {selectedStore.category === 'salon' ? `Queue: ${avail} (~${wait}m)` : avail > 0 ? `${avail} Seats Left` : 'Full'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {selectedStore.category === 'travel' && (
                    <div className="space-y-1">
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2">Number of Seats</label>
                       <input type="number" min="1" max="10" value={bookMeta.seats} onChange={e => setBookMeta({...bookMeta, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookMeta({...bookMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border" />
                    <input type="time" onChange={e => setBookMeta({...bookMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border" />
                  </div>
                  
                  <input placeholder="WhatsApp Number" value={bookMeta.phone} onChange={e => setBookMeta({...bookMeta, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border" />
                  
                  {/* FARE PREVIEW */}
                  {selectedStore.category === 'travel' && bookMeta.resId && (
                     <div className="bg-blue-50 p-4 rounded-2xl flex justify-between items-center border border-blue-100 animate-pulse">
                        <p className="text-[8px] font-black text-blue-400 uppercase">Estimated Segment Fare</p>
                        <p className="text-lg font-black text-blue-600">₹{calculateFare(cart[0].price, bookMeta.pickup, bookMeta.drop, bookMeta.seats)}</p>
                     </div>
                  )}

                  <button disabled={!bookMeta.date || !bookMeta.time || !bookMeta.phone || !bookMeta.resId} onClick={handleBooking} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-100 disabled:opacity-40">Confirm & Generate Token</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACKING */}
        {view === 'track' && tracked && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Confirmed Ticket</h2>
            <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6">
                <Lucide.Ticket size={40} className="text-emerald-600 mx-auto" />
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase italic">{tracked.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[9px] font-black uppercase text-left space-y-2 border border-slate-100">
                  <div className="flex justify-between"><span>Shop:</span><span className="text-emerald-700 font-black">{tracked.storeName}</span></div>
                  <div className="flex justify-between"><span>Service:</span><span>{tracked.serviceName}</span></div>
                  {tracked.pickup && <div className="flex justify-between text-blue-600 font-bold border-t border-slate-200 mt-1 pt-1"><span>Route:</span><span>{tracked.pickup} ➔ {tracked.drop}</span></div>}
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs font-black"><span>Total Due:</span><span className="text-emerald-600 text-base">₹{tracked.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all">Back Home</button>
            </div>
          </div>
        )}
      </main>

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

function ShieldCheck({size, className}) {
  return <Lucide.ShieldCheck size={size} className={className} />;
}

