import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'chiplun-supreme-v50-master';
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
  const [activeStore, setActiveStore] = useState(null);
  const [activeCart, setActiveCart] = useState(null); 
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminTab, setAdminTab] = useState('requests'); 
  const [hubView, setHubView] = useState('login');
  const [mTab, setMTab] = useState('ledger'); 

  // Forms & Modals
  const [bookForm, setBookForm] = useState({ date: '', time: '', phone: '', resId: '', seats: 1 });
  const [regForm, setRegForm] = useState({ bizName: '', phone: '', category: 'salon', address: '' });
  const [vLogin, setVLogin] = useState({ id: '', pass: '' });
  const [receipt, setReceipt] = useState(null);
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
    setTimeout(() => setLoading(false), 1000);
    return () => unsubs.forEach(f => f());
  }, [user]);

  // --- COMPUTATIONS ---
  const marketplace = useMemo(() => stores.filter(s => s.isLive && (s.name?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase()))), [stores, search]);
  
  const mData = useMemo(() => {
    if (!profile.businessId) return null;
    const s = stores.find(x => x.id === profile.businessId);
    const b = bookings.filter(x => x.storeId === profile.businessId);
    return {
      store: s || { resources: [], services: [] },
      rev: b.filter(x => x.status === 'completed').reduce((a, c) => a + (Number(c.totalPrice) || 0), 0),
      queue: b.filter(x => x.status === 'pending')
    };
  }, [bookings, profile, stores]);

  const getCapacity = (sId, rId, total) => {
    const active = bookings.filter(b => b.storeId === sId && b.resId === rId && b.status === 'pending');
    const taken = active.reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
    return { count: active.length, left: (Number(total) || 0) - taken };
  };

  // --- HANDLERS ---
  const processBooking = async () => {
    setIsProcessing(true);
    const id = "CH-" + Math.random().toString(36).substr(2, 5).toUpperCase();
    const total = Number(activeCart.price) * (activeStore.category === 'travel' ? (bookForm.seats || 1) : 1);
    const payload = { ...bookForm, displayId: id, storeId: activeStore.id, storeName: activeStore.name, serviceName: activeCart.name, totalPrice: total, status: 'pending', timestamp: Date.now(), paymentMode: 'Cash' };
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
    setReceipt(payload);
    setShowFinalConfirm(false);
    setShowPayment(false);
    setView('track');
    setIsProcessing(false);
  };

  const adminApprove = async (req) => {
    const mid = prompt("Assign Merchant ID:");
    const key = prompt("Assign Key:");
    if (!mid || !key) return;
    setIsProcessing(true);
    const sRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'stores'));
    await setDoc(sRef, { name: req.bizName, category: req.category, address: req.address, isLive: false, merchantId: mid.toUpperCase(), image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800", services: [], resources: [] });
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', mid.toUpperCase()), { storeId: sRef.id, businessName: req.bizName, password: key });
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
    notify("Authorized!");
    setIsProcessing(false);
  };

  const handleVLogin = async () => {
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'v_creds', vLogin.id.toUpperCase()));
    if (snap.exists() && snap.data().password === vLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
      setView('merchant');
    } else notify("Denied", "error");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse">CHIPLUN CONNECT</div>;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Production V50 Supreme</p>
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
            <input type="text" placeholder="Search Chiplun marketplace..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      {/* TOAST SYSTEM */}
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
            <div className="grid grid-cols-4 gap-3">
               {CATEGORIES.map(c => (
                 <button key={c.id} onClick={() => setSearch(c.id === search ? '' : c.id)} className={`flex flex-col items-center gap-2 p-1 transition-all ${search === c.id ? 'scale-110 opacity-100' : 'opacity-60'}`}>
                   <div className={`p-4 rounded-2xl border shadow-sm ${search === c.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}>{c.i}</div>
                   <span className="text-[9px] font-black uppercase text-slate-500">{c.n}</span>
                 </button>
               ))}
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-1">Live Marketplace</h2>
              <div className="space-y-4">
                {marketplace.map(store => (
                  <div key={store.id} onClick={() => { setActiveStore(store); setView('detail'); setActiveCart(null); setBookForm({ date:'', time:'', phone:'', resId:'', seats:1 }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-slate-100 active:scale-[0.98] transition-all">
                    <img src={store.image} className="w-20 h-20 rounded-[1.8rem] object-cover bg-slate-50" />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase mt-1">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: MERCHANT (SEPARATED LOGIC) */}
        {view === 'merchant' && merchantData && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter leading-none">{profile.businessName}</h2>
              <button onClick={() => { setView('home'); setProfile({role:'customer'}); }} className="p-3 bg-rose-50 text-rose-500 rounded-xl"><Lucide.LogOut size={20}/></button>
            </div>

            <div className={`p-6 rounded-[2.5rem] flex items-center justify-between shadow-lg transition-all ${merchantData.store.isLive ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              <div><p className="text-[9px] font-black uppercase opacity-70">Visibility</p><p className="text-xl font-black uppercase italic tracking-tighter">{merchantData.store.isLive ? 'Publicly Live' : 'Hidden (Offline)'}</p></div>
              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !merchantData.store.isLive })} className={`w-14 h-8 rounded-full p-1 transition-all ${merchantData.store.isLive ? 'bg-white' : 'bg-slate-700'}`}><div className={`w-6 h-6 rounded-full transition-all ${merchantData.store.isLive ? 'bg-emerald-600 ml-6' : 'bg-white'}`} /></button>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <button onClick={() => setMTab('ledger')} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${mTab === 'ledger' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>Queue</button>
                <button onClick={() => setMTab('assets')} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${mTab === 'assets' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>{merchantData.store.category === 'salon' ? 'Staff' : 'Fleet'}</button>
                <button onClick={() => setMTab('prices')} className={`flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${mTab === 'prices' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>Prices</button>
            </div>

            {mTab === 'ledger' && (
               <section className="space-y-4 pb-20 px-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1">REVENUE</p><p className="text-2xl font-black text-emerald-600">₹{merchantData.rev}</p></div>
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[8px] font-black text-slate-400 mb-1">WAITING</p><p className="text-2xl font-black text-blue-600">{merchantData.queue.length}</p></div>
                  </div>
                  {merchantData.queue.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border-l-8 border-emerald-500 shadow-sm flex justify-between items-center mx-1">
                      <div className="flex-1 pr-4">
                        <p className="font-black text-sm uppercase italic leading-none">{b.custName || 'User'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">{b.serviceName} • {b.time}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`tel:${b.phone}`)} className="p-3 bg-slate-50 text-slate-400 rounded-xl"><Lucide.Phone size={18}/></button>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' })} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Lucide.CheckCircle2 size={18}/></button>
                      </div>
                    </div>
                  ))}
               </section>
            )}

            {mTab === 'assets' && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1">
                <button onClick={() => {
                   const n = prompt(merchantData.store.category === 'salon' ? "Staff Name:" : "Trip (e.g. Mumbai 9AM):");
                   const c = merchantData.store.category === 'travel' ? prompt("Car Seat Capacity:") : 1;
                   if (n) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayUnion({ id: Math.random().toString(36).substr(2, 4).toUpperCase(), name: n, capacity: Number(c || 1) }) });
                }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-emerald-500">+ Add {merchantData.store.category === 'salon' ? 'Expert' : 'Route'}</button>
                <div className="space-y-3">
                   {merchantData.store.resources?.map((r, i) => (
                     <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                        <div><p className="font-black text-xs uppercase italic">{r.name}</p>{merchantData.store.category === 'travel' && <p className="text-[8px] font-black text-slate-400 uppercase mt-1">Seats: {r.capacity}</p>}</div>
                        <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { resources: arrayRemove(r) })} className="p-2 text-rose-500 active:scale-90 transition-all"><Lucide.Trash2 size={16}/></button>
                     </div>
                   ))}
                </div>
              </div>
            )}

            {mTab === 'prices' && (
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 space-y-6 mx-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic opacity-60">Fixed Rate Catalog</h3>
                  <button onClick={() => {
                     const n = prompt("Item Name (e.g. Haircut / Route):");
                     const p = prompt("Fixed Price (₹):");
                     if (n && p) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayUnion({ name: n, price: Number(p) }) });
                  }} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:border-emerald-300">+ Add New Price</button>
                  <div className="space-y-3">
                     {merchantData.store.services?.map((s, i) => (
                       <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                          <p className="font-black text-xs uppercase italic">{s.name} • ₹{s.price}</p>
                          <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: arrayRemove(s) })} className="p-2 text-rose-500 active:scale-90 transition-all"><Lucide.X size={16}/></button>
                       </div>
                     ))}
                  </div>
               </div>
            )}
          </div>
        )}

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && profile.role !== 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8 px-1">
            <div className="text-center"><h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2></div>
            <div className="flex bg-slate-200 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-300 relative mx-1">
               <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-emerald-600 rounded-[1.4rem] transition-all duration-300 ${hubView === 'login' ? 'translate-x-full' : 'translate-x-0'}`} />
               <button onClick={() => setHubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubView === 'register' ? 'text-white' : 'text-slate-500'}`}>Apply</button>
               <button onClick={() => setHubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest relative z-10 transition-colors ${hubView === 'login' ? 'text-white' : 'text-slate-500'}`}>Login</button>
            </div>
            {hubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 mx-1">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" placeholder="Business Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" placeholder="WhatsApp Number" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none">
                  <option value="salon">Salon</option><option value="travel">Travel</option>
                </select>
                <input value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" placeholder="Chiplun Location" />
                <button onClick={() => { setIsProcessing(true); addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() }).then(() => { notify("Sent!"); setView('home'); setIsProcessing(false); }) }} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-[0.97] transition-all shadow-xl">Apply for Verification</button>
                <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-widest pt-4">Administrator Console</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 text-center mx-1">
                <Lucide.ShieldCheck size={36} className="mx-auto text-emerald-600 mb-4" />
                <input value={vLogin.id} onChange={e => setVLogin({...vLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none focus:border-emerald-500 text-center tracking-tighter" placeholder="Merchant ID" />
                <input type="password" value={vLogin.pass} onChange={e => setVLogin({...vLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none focus:border-emerald-500" placeholder="••••••••" />
                <button onClick={handleVLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Unlock Console</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: ADMINMaster */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in px-2">
             <div className="flex justify-between items-center px-1">
                <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter leading-none">System Terminal</h2>
                <button onClick={() => setView('home')} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Lucide.Home size={18}/></button>
             </div>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4 text-center">
                 <input type="password" placeholder="Admin PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else notify("Denied", "error"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Authorize Session</button>
               </div>
             ) : (
               <div className="space-y-6 pb-20 px-1">
                 <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => setAdminTab('requests')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'requests' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>Requests ({requests.length})</button>
                    <button onClick={() => setAdminTab('merchants')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${adminTab === 'merchants' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-50'}`}>Stores ({stores.length})</button>
                 </div>
                 {adminTab === 'requests' ? requests.map(r => (
                    <div key={r.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 space-y-4 shadow-sm animate-in slide-in-from-bottom-4">
                        <h4 className="font-black text-sm uppercase italic tracking-tight">{r.bizName}</h4>
                        <div className="flex gap-2">
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id))} className="flex-1 py-3 border border-rose-100 text-rose-500 rounded-2xl font-black text-[9px] uppercase active:scale-95">Reject</button>
                          <button onClick={() => handleAdminApprove(r)} className="flex-[2] py-3 bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase shadow-lg active:scale-95">Approve</button>
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

        {/* VIEW: DETAIL (USER BOOKING ENGINE) */}
        {view === 'detail' && activeStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest active:scale-95 px-2"><Lucide.ArrowLeft size={16} className="mr-2"/> Discovery Mode</button>
            <div className="relative mx-1">
              <img src={activeStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={activeStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{activeStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1 leading-none"><Lucide.MapPin size={12} className="mr-1"/> {activeStore.address}</p>
              </div>
            </div>

            <section className="bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm space-y-4 mx-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic px-2 leading-none">1. Choose Service Entry</h3>
              <div className="space-y-2">
                {activeStore.services?.length > 0 ? activeStore.services.map((s, idx) => (
                  <div key={idx} onClick={() => setActiveCart(s)} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${activeCart?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <p className="font-black text-xs uppercase italic tracking-tight leading-none">{s.name}</p>
                    <span className="font-black text-emerald-600 italic tracking-tighter leading-none">₹{s.price}</span>
                  </div>
                )) : <p className="text-center text-[9px] text-slate-300 font-black uppercase py-4">Waiting for partner pricing</p>}
              </div>
            </section>

            {activeCart && (
              <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6 space-y-5 mx-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center italic leading-none">2. Booking Selection</h3>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      {activeStore.resources?.map(r => {
                        const { count, left } = getCapacity(activeStore.id, r.id, r.capacity);
                        const isFull = activeStore.category === 'travel' && left <= 0;
                        return (
                          <div key={r.id} onClick={() => !isFull && setBookForm({...bookForm, resId: r.id})} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${bookForm.resId === r.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-50 opacity-60'} ${isFull ? 'opacity-30 cursor-not-allowed' : ''}`}>
                            <span className="font-black text-[10px] uppercase italic tracking-tight leading-none">{r.name}</span>
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
                       <label className="text-[8px] font-black text-slate-400 uppercase ml-2 tracking-widest">Seats Required</label>
                       <input type="number" min="1" max="10" value={bookForm.seats} onChange={e => setBookForm({...bookForm, seats: Number(e.target.value)})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xs outline-none border border-slate-100 shadow-inner" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookForm({...bookForm, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                    <input type="time" onChange={e => setBookForm({...bookForm, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 shadow-inner" />
                  </div>
                  <input placeholder="WhatsApp Number" value={bookForm.phone} onChange={e => setBookForm({...bookForm, phone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-[10px] border border-slate-100 uppercase tracking-widest shadow-inner" />
                  <button disabled={!bookForm.date || !bookForm.time || !bookForm.phone || !bookForm.resId} onClick={() => setShowPayment(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] active:scale-[0.97] transition-all shadow-xl shadow-emerald-200 disabled:opacity-40">Proceed to Payment</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACKING */}
        {view === 'track' && receipt && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center leading-none">Token Generated</h2>
            <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6 mx-1">
                <Lucide.Ticket size={40} className="text-emerald-600 mx-auto" />
                <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase italic leading-none">{receipt.displayId}</h3>
                <div className="bg-slate-50 p-5 rounded-3xl text-[9px] font-black uppercase text-left space-y-2 border border-slate-100 shadow-inner">
                  <div className="flex justify-between leading-none italic tracking-widest"><span>Merchant:</span><span className="text-emerald-700 font-black">{receipt.storeName}</span></div>
                  <div className="flex justify-between leading-none italic tracking-widest"><span>Service:</span><span>{receipt.serviceName}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs font-black leading-none italic tracking-widest"><span>Total:</span><span className="text-emerald-600 text-lg tracking-tighter">₹{receipt.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95 transition-all shadow-lg tracking-[0.2em]">Home Explorer</button>
            </div>
          </div>
        )}
      </main>

      {/* PAYMENT MODAL */}
      {showPayment && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-tighter">Select Payment</h3>
              <div className="space-y-3">
                 <button onClick={() => notify("Digital Payments are Locked", "error")} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between opacity-50">
                    <span className="font-black text-[10px] uppercase">UPI / Cards</span>
                    <span className="text-[8px] bg-rose-100 text-rose-600 px-2 py-1 rounded font-black uppercase">SOON</span>
                 </button>
                 <button onClick={() => setShowFinalConfirm(true)} className="w-full p-6 bg-emerald-600 text-white rounded-[1.8rem] shadow-xl flex items-center justify-between active:scale-95 transition-all">
                    <span className="font-black text-sm uppercase">Confirm with Cash</span>
                    <Lucide.Banknote size={20} />
                 </button>
              </div>
              <button onClick={() => setShowPayment(false)} className="text-[10px] font-black uppercase text-slate-400">Cancel Booking</button>
           </div>
        </div>
      )}

      {/* FINAL CONFIRM MODAL */}
      {showFinalConfirm && (
        <div className="fixed inset-0 bg-emerald-600 z-[1001] flex items-center justify-center p-6 animate-in zoom-in-95 duration-200 text-white">
           <div className="text-center space-y-8">
              <Lucide.AlertCircle size={80} className="mx-auto animate-bounce" />
              <div className="space-y-2">
                 <h3 className="text-4xl font-black uppercase italic tracking-tighter">Are you sure?</h3>
                 <p className="text-sm font-bold uppercase opacity-70 tracking-widest">Confirming will issue your Token ID</p>
              </div>
              <div className="space-y-3 pt-6">
                 <button onClick={processBooking} className="w-64 py-6 bg-white text-emerald-600 rounded-full font-black uppercase shadow-2xl active:scale-90 transition-all text-lg">YES, CONFIRM</button>
                 <button onClick={() => setShowFinalConfirm(false)} className="block w-full py-4 text-white/50 font-black uppercase text-xs tracking-widest">No, go back</button>
              </div>
           </div>
        </div>
      )}

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

