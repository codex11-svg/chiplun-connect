import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- Configuration ---
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
const appId = "chiplun-pro-v40-operational"; 
const ADMIN_PIN = "112607";

const CATEGORIES = [
  { id: 'salon', n: 'Salon', i: <Lucide.Scissors size={20}/>, c: 'bg-rose-50 text-rose-500 border-rose-100' },
  { id: 'travel', n: 'Travel', i: <Lucide.Bus size={20}/>, c: 'bg-blue-50 text-blue-500 border-blue-100' },
  { id: 'clinic', n: 'Clinic', i: <Lucide.Stethoscope size={20}/>, c: 'bg-emerald-50 text-emerald-500 border-emerald-100' },
  { id: 'repair', n: 'Repair', i: <Lucide.Wrench size={20}/>, c: 'bg-amber-50 text-amber-500 border-amber-100' }
];

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
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [bizSubView, setBizSubView] = useState('register');

  // Form States
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    source: 'Chiplun', destination: '', numSeats: 1
  });
  const [regForm, setRegForm] = useState({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
  const [trackInput, setTrackInput] = useState('');
  const [trackedBooking, setTrackedBooking] = useState(null);
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });

  // --- Firebase Sync ---
  useEffect(() => {
    const init = async () => {
      onAuthStateChanged(auth, async (u) => {
        if (!u) await signInAnonymously(auth);
        setUser(u);
      });
    };
    init();
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

  // --- Memos ---
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

  // --- V40 Standard Actions ---
  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    const displayId = "CH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const service = cart[0];
    let finalPrice = Number(service.price);
    
    if (selectedStore.category === 'travel' && bookingMeta.destination) {
      finalPrice = finalPrice * (bookingMeta.numSeats || 1);
    }

    const payload = { ...bookingMeta, displayId, storeId: selectedStore.id, storeName: selectedStore.name, serviceName: service.name, totalPrice: finalPrice, status: 'pending', timestamp: Date.now() };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setTrackedBooking(payload);
      setShowConfirmModal(false);
      setView('track');
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const submitRegistration = async () => {
    if (!regForm.bizName || !regForm.phone) return alert("Fill essential details");
    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { ...regForm, status: 'pending', timestamp: Date.now() });
      alert("Registration Request Sent to Admin.");
      setRegForm({ name: '', phone: '', bizName: '', category: 'salon', address: '' });
      setView('home');
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleVendorLogin = async () => {
    setIsProcessing(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id.toUpperCase()));
      if (snap.exists() && snap.data().password === vendorLogin.pass) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'vendor', businessId: snap.data().storeId, businessName: snap.data().businessName });
        setView('merchant');
      } else { alert("Invalid Credentials"); }
    } catch (e) { alert("Login Error"); } finally { setIsProcessing(false); }
  };

  const completeBooking = async (id) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id), { status: 'completed' });
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-[0.3em]">
      CHIPLUNCONNECT V40
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Operational Control • V40</p>
          </div>
          <button onClick={() => setView('business')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 active:bg-white/20 transition-all shadow-inner">
            <Lucide.Briefcase size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input type="text" placeholder="Find local services..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 shadow-inner transition-all" />
          </div>
        )}
      </header>

      {/* VIEWPORT */}
      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            <div className="grid grid-cols-4 gap-3">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setSearchQuery(cat.id === searchQuery ? '' : cat.id)} className={`flex flex-col items-center gap-2 p-1 transition-all ${searchQuery === cat.id ? 'scale-110 opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                  <div className={`${cat.c} p-4 rounded-[1.5rem] shadow-sm border`}>{cat.i}</div>
                  <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">{cat.n}</span>
                </button>
              ))}
            </div>
            <section className="space-y-4">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 italic">Explore Chiplun</h2>
              <div className="space-y-4">
                {filteredStores.map(store => (
                  <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); }} className="bg-white p-3 rounded-[2rem] flex gap-4 items-center shadow-sm border border-slate-100 hover:border-emerald-300 active:scale-[0.98] transition-all group">
                    <img src={store.image || "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=400"} className="w-20 h-20 rounded-[1.5rem] object-cover" alt={store.name} />
                    <div className="flex-1">
                      <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{store.category}</span>
                      <h3 className="font-bold text-slate-800 text-sm uppercase mt-1 leading-tight">{store.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium italic">{store.address}</p>
                    </div>
                    <Lucide.ChevronRight size={18} className="text-slate-200 mr-2" />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: BUSINESS HUB */}
        {view === 'business' && (
          <div className="pt-6 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-black text-emerald-900 uppercase italic tracking-tighter">Business Hub</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth engine for local partners</p>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-[1.5rem] shadow-inner">
               <button onClick={() => setBizSubView('register')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bizSubView === 'register' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Apply</button>
               <button onClick={() => setBizSubView('login')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bizSubView === 'login' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Login</button>
            </div>
            {bizSubView === 'register' ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 animate-in fade-in">
                <input value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" placeholder="Business Name" />
                <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none focus:border-emerald-500" placeholder="Mobile" />
                <select value={regForm.category} onChange={e => setRegForm({...regForm, category: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-xl text-[10px] font-black uppercase outline-none">
                   {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.n} Services</option>)}
                </select>
                <button onClick={submitRegistration} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest">Submit Application</button>
                <button onClick={() => setView('admin')} className="w-full text-[8px] font-black text-slate-300 uppercase tracking-[0.4em] pt-4">Admin terminal</button>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 space-y-4 animate-in fade-in">
                <input value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-lg font-black uppercase outline-none text-center" placeholder="Merchant ID" />
                <input type="password" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-slate-50 border p-5 rounded-2xl text-center outline-none" placeholder="••••••••" />
                <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl">Unlock Ledger</button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD */}
        {view === 'merchant' && profile.role === 'vendor' && (
          <div className="pt-6 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tighter">{profile.businessName}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Operational Ledger</p>
              </div>
              <button onClick={() => setView('home')} className="p-3 bg-slate-100 rounded-xl text-slate-400"><Lucide.Home size={20}/></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Total Revenue</p>
                <p className="text-2xl font-black text-emerald-600">₹{merchantStats.revenue}</p>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Pending</p>
                <p className="text-2xl font-black text-blue-600">{merchantStats.queue.length}</p>
              </div>
            </div>
            <section className="bg-emerald-600 text-white p-6 rounded-[3rem] shadow-xl space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80 italic text-center">Active Queue</h3>
              <div className="space-y-3">
                {merchantStats.queue.map((b, i) => (
                  <div key={i} className="bg-white/10 p-5 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-sm uppercase italic">{b.custName || 'Guest'}</p>
                        <p className="text-[8px] font-bold text-emerald-200 uppercase mt-0.5">{b.serviceName}</p>
                      </div>
                      <span className="bg-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter">#{b.displayId}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                       <button onClick={() => window.open(`https://wa.me/${b.custPhone}`)} className="flex-1 bg-white/20 p-3 rounded-xl"><Lucide.MessageCircle size={16} className="mx-auto" /></button>
                       <button onClick={() => completeBooking(b.id)} className="flex-[3] bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest p-3 rounded-xl shadow-lg active:scale-95 transition-all">Mark Complete</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VIEW: ADMIN TERMINAL (V40 BASE) */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter text-center">Admin Master</h2>
             {!adminAuth ? (
               <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-rose-100 space-y-4">
                 <input type="password" placeholder="System PIN" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} className="w-full bg-slate-50 p-5 rounded-2xl shadow-inner border font-black text-center text-lg outline-none" />
                 <button onClick={() => { if (adminPin === ADMIN_PIN) setAdminAuth(true); else alert("Access Denied"); }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Verify Identity</button>
               </div>
             ) : (
               <div className="space-y-6">
                  <section className="bg-white p-6 rounded-[2.5rem] border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Pending Applications</h3>
                    {requests.map(r => (
                      <div key={r.id} className="p-4 border-b border-slate-50 last:border-0 flex justify-between items-center">
                        <div>
                          <p className="font-black text-xs uppercase">{r.bizName}</p>
                          <p className="text-[8px] text-slate-400">{r.name} • {r.phone}</p>
                        </div>
                        <Lucide.ChevronRight size={16} className="text-slate-200" />
                      </div>
                    ))}
                  </section>
                  <section className="bg-white p-6 rounded-[2.5rem] border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Live Registry</h3>
                    {stores.map(s => (
                      <div key={s.id} className="p-4 flex justify-between items-center">
                        <p className="font-black text-xs uppercase">{s.name}</p>
                        <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-black uppercase tracking-tighter">ID: {s.merchantId || 'NONE'}</span>
                      </div>
                    ))}
                  </section>
               </div>
             )}
          </div>
        )}

        {/* VIEW: DETAIL (V40 BOOKING FLOW) */}
        {view === 'detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase tracking-widest">
              <Lucide.ArrowLeft size={16} className="mr-2"/> Back to Discovery
            </button>
            <div className="relative">
              <img src={selectedStore.image} className="w-full h-56 rounded-[2.5rem] object-cover shadow-xl" alt={selectedStore.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[2.5rem]"></div>
              <div className="absolute bottom-6 left-8 right-8 text-white">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">{selectedStore.name}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
              </div>
            </div>
            <section className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Services</h3>
              <div className="space-y-3">
                {selectedStore.services?.map((s, idx) => (
                  <div key={idx} onClick={() => setCart([s])} className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}>
                    <div>
                      <p className="font-bold text-sm uppercase">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1 opacity-70">{selectedStore.category === 'travel' ? 'Per Seat' : `${s.duration} MINS`}</p>
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
                  {selectedStore.category === 'travel' && (
                    <div className="grid grid-cols-2 gap-2">
                       <input placeholder="To Area" value={bookingMeta.destination} onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner" />
                       <input type="number" placeholder="Seats" min="1" max="10" value={bookingMeta.numSeats} onChange={e => setBookingMeta({...bookingMeta, numSeats: Number(e.target.value)})} className="bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner" />
                    <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner" />
                  </div>
                  <input placeholder="Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner uppercase" />
                  <input placeholder="WhatsApp Number" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border shadow-inner uppercase" />
                  <button disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 tracking-widest disabled:opacity-40">Review & Confirm</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: TRACKING */}
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
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm text-slate-900 font-black"><span>Payable:</span><span>₹{trackedBooking.totalPrice}</span></div>
                </div>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs active:scale-95">Back Home</button>
              </div>
            ) : (
              <div className="space-y-4">
                <input placeholder="Enter Token (CH-XXXX)" value={trackInput} onChange={e => setTrackInput(e.target.value)} className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 font-black text-center text-lg uppercase outline-none focus:border-emerald-500" />
                <button onClick={() => { const found = allBookings.find(b => b.displayId === trackInput.toUpperCase()); if (found) setTrackedBooking(found); else alert("Token not found"); }} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Track Now</button>
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

