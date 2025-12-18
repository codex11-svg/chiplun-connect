import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- Configuration & Initialization ---
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
const appId = "chiplun-pro-v50-supreme"; 
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
  const [myBookings, setMyBookings] = useState([]); 
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  // Booking Form State
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    source: 'Chiplun', destination: '', numSeats: 1
  });

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
      requests: collection(db, 'artifacts', appId, 'public', 'data', 'requests'),
      myBookings: collection(db, 'artifacts', appId, 'users', user.uid, 'bookings')
    };

    const unsubs = [
      onSnapshot(paths.profile, (snap) => {
        if (snap.exists()) setProfile(snap.data());
        else setDoc(paths.profile, { role: 'customer', uid: user.uid });
        setLoading(false);
      }),
      onSnapshot(paths.stores, (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.bookings, (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.requests, (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(paths.myBookings, (s) => setMyBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))))
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

  // --- Actions ---
  const handleBooking = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const displayId = "CH-" + Math.random().toString(36).substring(2, 7).toUpperCase();
    const service = cart[0];
    let finalPrice = Number(service.price);
    
    // Dynamic Travel Pricing
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
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setTrackedBooking(payload);
      setShowConfirmModal(false);
      setView('track');
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
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
      } else {
        alert("Invalid Credentials");
      }
    } catch (e) {
      alert("Login Error");
    } finally {
      setIsProcessing(false);
    }
  };

  const completeBooking = async (id) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id), { status: 'completed' });
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-[0.3em]">
      CHIPLUNCONNECT SUPREME
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      
      {/* GLOBAL HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">Supreme Nexus • V50</p>
          </div>
          <button 
            onClick={() => setView(profile.role === 'vendor' ? 'merchant' : 'login')} 
            className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 active:bg-white/20 transition-all shadow-inner"
          >
            <Lucide.User size={20} />
          </button>
        </div>

        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-4 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-200" size={18} />
            <input 
              type="text" 
              placeholder="Find salons, travel, clinics..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20 shadow-inner transition-all"
            />
          </div>
        )}
      </header>

      {/* VIEWPORT */}
      <main className="flex-1 -mt-6 px-4 pb-32 z-10">
        
        {/* HOME VIEW */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
            {/* Categories */}
            <div className="grid grid-cols-4 gap-3 animate-in fade-in zoom-in duration-700">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => setSearchQuery(cat.id === searchQuery ? '' : cat.id)}
                  className={`flex flex-col items-center gap-2 p-1 transition-all ${searchQuery === cat.id ? 'scale-110 opacity-100' : 'opacity-60 hover:opacity-100'}`}
                >
                  <div className={`${cat.c} p-4 rounded-[1.5rem] shadow-sm border`}>{cat.i}</div>
                  <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">{cat.n}</span>
                </button>
              ))}
            </div>

            {/* Store List */}
            <section className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Live Businesses</h2>
                <div className="h-px bg-slate-200 flex-1 ml-4"></div>
              </div>
              
              <div className="space-y-4">
                {filteredStores.map(store => (
                  <div 
                    key={store.id} 
                    onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); }}
                    className="bg-white p-3 rounded-[2rem] flex gap-4 items-center shadow-sm border border-slate-100 hover:border-emerald-300 active:scale-[0.98] transition-all group"
                  >
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
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest flex items-center mt-1">
                  <Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}
                </p>
              </div>
            </div>

            {/* Travel-Specific Routing */}
            {selectedStore.category === 'travel' && (
              <div className="bg-blue-600 text-white p-6 rounded-[2rem] shadow-lg shadow-blue-200 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 text-center">Route & Passenger Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase opacity-70 ml-2">Pickup</label>
                    <select className="w-full bg-white/20 border border-white/20 p-3 rounded-xl text-xs font-bold outline-none" value={bookingMeta.source} onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})}>
                      <option className="text-slate-900">Chiplun</option>
                      <option className="text-slate-900">Khed</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase opacity-70 ml-2">Destination</label>
                    <select className="w-full bg-white/20 border border-white/20 p-3 rounded-xl text-xs font-bold outline-none" value={bookingMeta.destination} onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})}>
                      <option className="text-slate-900" value="">Select Area</option>
                      {selectedStore.services?.map(s => <option key={s.name} className="text-slate-900">{s.name.split('-').pop().trim()}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase opacity-70 ml-2">Total Passengers</label>
                    <input type="number" min="1" max="10" className="w-full bg-white/20 border border-white/20 p-3 rounded-xl text-xs font-bold outline-none" value={bookingMeta.numSeats} onChange={e => setBookingMeta({...bookingMeta, numSeats: Number(e.target.value)})} />
                </div>
              </div>
            )}

            {/* Service Selection */}
            <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic">Available Services</h3>
              <div className="space-y-3">
                {selectedStore.services?.map((s, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setCart([s])}
                    className={`p-4 rounded-2xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 scale-[1.02]' : 'border-slate-50 bg-slate-50'}`}
                  >
                    <div>
                      <p className="font-bold text-sm uppercase">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1 opacity-70">
                        {selectedStore.category === 'travel' ? `${s.km} KM` : `${s.duration} MINS`}
                      </p>
                    </div>
                    <span className="font-black text-emerald-600 text-lg tracking-tighter">₹{s.price}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Schedule Section */}
            {cart.length > 0 && (
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 animate-in slide-in-from-bottom-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 text-center italic">Appointment Details</h3>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                    <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-28 bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 shadow-inner" />
                  </div>
                  <select onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner">
                    <option value="">{selectedStore.category === 'salon' ? 'Choose Stylist' : 'Choose Vehicle/Expert'}</option>
                    {selectedStore.staff?.map(st => <option key={st.name}>{st.name}</option>)}
                  </select>
                  <input placeholder="WhatsApp Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none border border-slate-100 uppercase shadow-inner" />
                  <button 
                    disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone} 
                    onClick={() => setShowConfirmModal(true)} 
                    className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-40"
                  >
                    Review & Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOGIN VIEW */}
        {view === 'login' && (
          <div className="pt-20 space-y-8 text-center animate-in zoom-in-95">
            <Lucide.ShieldCheck size={64} className="mx-auto text-emerald-600 p-4 bg-emerald-50 rounded-[2rem]" />
            <div>
              <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Merchant Access</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Enter your business credentials</p>
            </div>
            
            <section className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 space-y-4 text-left">
              <input placeholder="Merchant ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none uppercase shadow-inner border focus:border-emerald-500" />
              <input type="password" placeholder="Key Phrase" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner border focus:border-emerald-500" />
              <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Open Dashboard</button>
            </section>
            
            <button onClick={() => setView('admin')} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">Admin Portal</button>
          </div>
        )}

        {/* TRACK VIEW */}
        {view === 'track' && (
          <div className="pt-10 space-y-8 animate-in slide-in-from-bottom-8">
            <h2 className="text-xl font-black text-emerald-900 uppercase italic tracking-tighter text-center">Ticket Status</h2>
            
            {trackedBooking ? (
              <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-t-8 border-emerald-500 text-center space-y-6">
                <div className="bg-emerald-50 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                  <Lucide.CheckCircle2 size={40} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-4xl font-black tracking-tighter text-emerald-600 uppercase">{trackedBooking.displayId}</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Official Token ID</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl text-[10px] font-black uppercase text-left space-y-2 border border-slate-100">
                  <div className="flex justify-between"><span>Merchant:</span><span className="text-emerald-700">{trackedBooking.storeName}</span></div>
                  <div className="flex justify-between"><span>Service:</span><span>{trackedBooking.serviceName}</span></div>
                  <div className="flex justify-between"><span>Schedule:</span><span>{trackedBooking.date} • {trackedBooking.time}</span></div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-xs text-slate-900"><span>Payable:</span><span className="font-black">₹{trackedBooking.totalPrice} (CASH)</span></div>
                </div>
                <p className="text-[9px] text-slate-400 font-bold uppercase px-4 italic leading-relaxed">Please present this token at the business location to claim your service.</p>
                <button onClick={() => setView('home')} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95">Back Home</button>
              </div>
            ) : (
              <div className="space-y-4">
                <input 
                  placeholder="Enter Token (CH-XXXX)" 
                  value={trackInput}
                  onChange={e => setTrackInput(e.target.value)}
                  className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 font-black text-center text-lg uppercase outline-none focus:border-emerald-500"
                />
                <button onClick={() => {
                  const found = allBookings.find(b => b.displayId === trackInput.toUpperCase());
                  if (found) setTrackedBooking(found);
                  else alert("Token not found");
                }} className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Track Now</button>
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

            {/* Merchant Metrics */}
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

            {/* Active Ledger */}
            <section className="bg-emerald-600 text-white p-6 rounded-[3rem] shadow-xl space-y-4 border border-black/5">
              <div className="flex items-center gap-2 px-2">
                <Lucide.ListOrdered size={16} className="text-emerald-200" />
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80 italic">Active Ledger</h3>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {merchantStats.queue.length > 0 ? merchantStats.queue.map((b, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/5 animate-in slide-in-from-left-4" style={{animationDelay: `${i * 100}ms`}}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-sm uppercase italic tracking-tight">{b.custName || 'Guest User'}</p>
                        <p className="text-[8px] font-bold text-emerald-200 uppercase tracking-widest mt-0.5">{b.serviceName}</p>
                      </div>
                      <span className="bg-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-black tracking-tighter italic border border-white/10">#{b.displayId}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[8px] font-black uppercase tracking-widest text-emerald-100/70 mb-4">
                      <span className="flex items-center gap-1"><Lucide.Calendar size={10}/> {b.date}</span>
                      <span className="flex items-center gap-1"><Lucide.Clock size={10}/> {b.time}</span>
                      <span className="flex items-center gap-1"><Lucide.CheckCircle size={10}/> {b.resourceName || 'Auto'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => { window.open(`https://wa.me/${b.custPhone}?text=Hi ${b.custName}, confirming your booking ${b.displayId} for ${b.time}.`); }}
                        className="flex-1 bg-white/10 hover:bg-white/20 text-white p-3 rounded-xl border border-white/5 transition-all"
                      >
                        <Lucide.MessageCircle size={16} className="mx-auto" />
                      </button>
                      <button 
                        onClick={() => completeBooking(b.id)}
                        className="flex-[3] bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest p-3 rounded-xl shadow-lg active:scale-95 transition-all"
                      >
                        Complete Order
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 opacity-40">
                    <Lucide.Sparkles size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest italic">All caught up!</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ADMIN VIEW */}
        {view === 'admin' && (
          <div className="pt-10 space-y-6 animate-in fade-in">
             <h2 className="text-2xl font-black text-rose-600 uppercase italic tracking-tighter text-center">System Override</h2>
             
             {!adminAuth ? (
               <div className="space-y-4">
                 <input 
                  type="password" 
                  placeholder="Admin PIN" 
                  value={adminPin}
                  onChange={e => setAdminPin(e.target.value)}
                  className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 font-black text-center text-lg outline-none"
                 />
                 <button onClick={() => {
                   if (adminPin === ADMIN_PIN) setAdminAuth(true);
                   else alert("Denied");
                 }} className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black shadow-xl uppercase active:scale-95">Authenticate</button>
               </div>
             ) : (
               <div className="space-y-6">
                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Businesses</p>
                      <p className="text-xl font-black">{stores.length}</p>
                    </div>
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
                      <p className="text-[8px] font-black text-slate-400 uppercase">Pending Requests</p>
                      <p className="text-xl font-black">{requests.length}</p>
                    </div>
                 </div>
                 
                 <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 italic">Active Business Registry</h3>
                    {stores.map(s => (
                      <div key={s.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-100">
                        <div>
                          <p className="font-black text-xs uppercase">{s.name}</p>
                          <p className="text-[8px] text-slate-400 uppercase tracking-widest mt-1">ID: {s.merchantId || 'N/A'}</p>
                        </div>
                        <button 
                          onClick={async () => {
                            if (window.confirm("Purge Business?")) {
                              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id));
                            }
                          }}
                          className="bg-rose-50 p-2 rounded-lg text-rose-500"
                        >
                          <Lucide.Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                 </section>
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
              <h3 className="text-xl font-black uppercase tracking-tighter italic mb-4">Confirm Appointment</h3>
              
              <div className="bg-slate-50 p-5 rounded-2xl text-[10px] font-black uppercase text-left space-y-3 border border-slate-100 mb-6 shadow-inner">
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Merchant:</span><span className="text-emerald-600">{selectedStore?.name}</span></div>
                 <div className="flex justify-between"><span>Service:</span><span>{cart[0]?.name}</span></div>
                 <div className="flex justify-between"><span>Schedule:</span><span>{bookingMeta.date} @ {bookingMeta.time}</span></div>
                 <div className="flex justify-between"><span>Resource:</span><span>{bookingMeta.resourceName || 'General'}</span></div>
                 {selectedStore.category === 'travel' && (
                    <div className="flex justify-between text-blue-600"><span>Destination:</span><span>{bookingMeta.destination}</span></div>
                 )}
                 <div className="flex justify-between pt-2 border-t border-slate-200 text-sm text-slate-900">
                    <span>Payable:</span>
                    <span className="font-black text-emerald-600 text-lg">₹{cart[0]?.price * (selectedStore?.category === 'travel' ? (bookingMeta.numSeats || 1) : 1)}</span>
                 </div>
              </div>

              <div className="space-y-3">
                 <button 
                    disabled={isProcessing} 
                    onClick={handleBooking} 
                    className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all tracking-[0.2em]"
                 >
                   {isProcessing ? 'Verifying...' : 'Finalize & Book'}
                 </button>
                 <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-slate-400 font-black text-[10px] uppercase">Wait, Go Back</button>
              </div>
           </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-slate-100 px-8 py-5 flex justify-between items-center z-[100]">
        <button onClick={() => setView('home')} className={`transition-all ${view === 'home' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}>
          <Lucide.Compass size={24} />
        </button>
        <button onClick={() => setView('track')} className={`transition-all ${view === 'track' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}>
          <Lucide.Ticket size={24} />
        </button>
        <div className="w-px h-6 bg-slate-100"></div>
        <button onClick={() => setView('login')} className={`transition-all ${view === 'login' || view === 'merchant' ? 'text-emerald-600 scale-125' : 'text-slate-300 hover:text-slate-500'}`}>
          <Lucide.LayoutGrid size={24} />
        </button>
      </nav>

    </div>
  );
}
