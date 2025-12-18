import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- YOUR LIVE FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyALH-taOmzYitK1XnOFuKMrqgFWJqVALSo",
  authDomain: "chiplun-connect.firebaseapp.com",
  projectId: "chiplun-connect",
  storageBucket: "chiplun-connect.firebasestorage.app",
  messagingSenderId: "861830187280",
  appId: "1:861830187280:web:504064454581cdeb84bd95"
};

// Initialize Safely
let auth, db;
try {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) { console.error("Init Error", e); }

const appId = "chiplun-pro-v5"; 
const ADMIN_PIN = "112607"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home'); 
  const [portalTab, setPortalTab] = useState('login'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]); 
  const [requests, setRequests] = useState([]);
  const [myBookings, setMyBookings] = useState([]);

  // Search State
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Customer State
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [lastBookingId, setLastBookingId] = useState('');
  const [bookingMeta, setBookingMeta] = useState({ 
    date: '', time: '', staffName: '', custName: '', custPhone: '', paymentMethod: 'upi' 
  });
  
  // Admin/Vendor States
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '' });
  const [newStaff, setNewStaff] = useState('');
  const [editStoreForm, setEditStoreForm] = useState({ name: '', address: '', image: '' });

  // --- 1. Auth Sync ---
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch (e) { console.error("Auth Fail"); }
      }
      setUser(u);
    });
    return () => unsub();
  }, []);

  // --- 2. Live Data Sync ---
  useEffect(() => {
    if (!user || !db) return;

    onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), (snap) => {
      if (snap.exists()) setProfile(snap.data());
      else setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'customer', status: 'none', uid: user.uid });
      setLoading(false);
    });

    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (snap) => {
      setAllBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), (snap) => {
      setMyBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (view === 'dashboard' && profile.businessId) {
      const s = stores.find(st => st.ownerId === profile.businessId);
      if (s) setEditStoreForm({ name: s.name, address: s.address, image: s.image || '' });
    }
  }, [view, stores, profile.businessId]);

  // --- 3. Logic ---
  const handleBookingSearch = () => {
    setSearchError('');
    setSearchedBooking(null);
    if (!bookingSearchQuery) return;

    const found = allBookings.find(b => b.displayId?.toLowerCase() === bookingSearchQuery.toLowerCase() || b.id === bookingSearchQuery);
    if (found) setSearchedBooking(found);
    else setSearchError("Booking not found. Check the ID.");
  };

  const isSlotFull = (date, time, staffName = null) => {
    if (!selectedStore || !date || !time) return false;
    const existing = allBookings.filter(b => b.storeId === selectedStore.id && b.date === date && b.time === time);
    const capacity = selectedStore.staff?.length || 1;
    if (staffName && staffName !== "") return existing.some(b => b.staffName === staffName);
    return existing.length >= capacity;
  };

  const handleVendorAuth = async () => {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id));
    if (snap.exists() && snap.data().password === vendorLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        role: 'vendor', status: 'approved', businessId: snap.data().uid, businessName: snap.data().businessName
      });
      setView('dashboard');
    } else alert("Invalid ID/Pass");
  };

  const finalizeBooking = async () => {
    setIsProcessing(true);
    // Generate a short user-friendly ID
    const shortId = "CH-" + Math.random().toString(36).substring(2, 5).toUpperCase();
    
    setTimeout(async () => {
      const total = cart.reduce((a, b) => a + Number(b.price), 0);
      const payload = { 
        ...bookingMeta, 
        displayId: shortId,
        services: cart, 
        totalPrice: total, 
        storeId: selectedStore.id, 
        storeName: selectedStore.name, 
        timestamp: serverTimestamp() 
      };
      
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), { ...payload, id: docRef.id });
      
      setLastBookingId(shortId);
      setIsProcessing(false);
      setView('confirmation');
    }, 2000);
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-emerald-50"><Lucide.Loader2 className="animate-spin text-emerald-600 mb-4" size={40}/><p className="text-emerald-900 font-black tracking-widest uppercase">ChiplunConnect V5</p></div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {isProcessing && (
        <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col items-center justify-center">
           <Lucide.Loader2 className="animate-spin text-emerald-600 mb-6" size={56} />
           <h2 className="text-2xl font-black text-emerald-900 uppercase">Generating ID...</h2>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-20">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter">ChiplunConnect</h1>
            <div className="flex items-center text-emerald-100 text-[9px] font-black uppercase mt-1">
              <Lucide.MapPin size={10} className="mr-1" /> Smart Search Pro
            </div>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
            <Lucide.ShieldCheck size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search Chiplun stores..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 overflow-y-auto z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2 animate-in slide-in-from-bottom-4">
             <div className="grid grid-cols-4 gap-4">
               {[{id:'salon', n:'Salon', i:<Lucide.Scissors/>, c:'bg-rose-50 text-rose-500'},{id:'travel', n:'Travel', i:<Lucide.Bus/>, c:'bg-blue-50 text-blue-500'},{id:'health', n:'Clinic', i:<Lucide.User/>, c:'bg-emerald-50 text-emerald-500'},{id:'repair', n:'Repair', i:<Lucide.Info/>, c:'bg-amber-50 text-amber-500'}].map(cat => (
                 <button key={cat.id} className="flex flex-col items-center gap-2 group">
                   <div className={`${cat.c} p-4 rounded-2xl shadow-sm`}>{cat.i}</div>
                   <span className="text-[8px] font-black text-gray-400 uppercase">{cat.n}</span>
                 </button>
               ))}
             </div>

             <section>
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Live Businesses</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 active:scale-98 transition-all cursor-pointer">
                     <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover" />
                     <div className="flex-1">
                       <h3 className="font-bold text-gray-800 text-sm">{store.name}</h3>
                       <p className="text-[10px] text-gray-400 font-medium italic mt-0.5">{store.address}</p>
                       <div className="flex items-center gap-2 mt-2">
                         <Lucide.Star size={12} className="text-yellow-400 fill-yellow-400" />
                         <span className="text-xs font-black text-gray-600">{store.rating || '5.0'}</span>
                         <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-black uppercase">Live</span>
                       </div>
                     </div>
                     <Lucide.ChevronRight size={18} className="text-gray-200 mr-2" />
                   </div>
                 ))}
               </div>
             </section>
          </div>
        )}

        {/* VIEW: BOOKINGS & SEARCH */}
        {view === 'bookings' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black text-emerald-900 tracking-tighter uppercase">Track Booking</h2>
              
              {/* Search Bar */}
              <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-gray-100 flex gap-2">
                 <input 
                    placeholder="Enter Booking ID (e.g. CH-9X2)" 
                    value={bookingSearchQuery}
                    onChange={e => setBookingSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent px-4 py-3 outline-none font-bold text-sm uppercase"
                 />
                 <button 
                    onClick={handleBookingSearch}
                    className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all"
                 >
                    <Lucide.Search size={20}/>
                 </button>
              </div>

              {searchError && <p className="text-center text-rose-500 text-[10px] font-black uppercase">{searchError}</p>}

              {searchedBooking ? (
                <div className="bg-emerald-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-in zoom-in-95">
                   <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[10px] font-black uppercase opacity-60">Search Result</p>
                        <h3 className="text-xl font-black">{searchedBooking.storeName}</h3>
                      </div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black uppercase">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-3">
                      <div className="flex justify-between text-sm"><span>Date:</span><span className="font-bold">{searchedBooking.date}</span></div>
                      <div className="flex justify-between text-sm"><span>Time:</span><span className="font-bold">{searchedBooking.time}</span></div>
                      <div className="flex justify-between text-sm"><span>Expert:</span><span className="font-bold">{searchedBooking.staffName || 'Any'}</span></div>
                      <div className="flex justify-between text-sm pt-3 border-t border-white/10"><span>Status:</span><span className="font-bold uppercase tracking-widest text-emerald-200 flex items-center gap-1"><Lucide.CheckCircle size={14}/> Confirmed</span></div>
                   </div>
                   <button onClick={() => setSearchedBooking(null)} className="w-full mt-6 py-2 text-[10px] font-black uppercase bg-white/10 rounded-xl">Clear Search</button>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Recent Bookings</h3>
                  {myBookings.map((b, i) => (
                    <div key={i} className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm">
                       <div className="flex justify-between items-start">
                          <h4 className="font-bold text-gray-800">{b.storeName}</h4>
                          <span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">{b.displayId}</span>
                       </div>
                       <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">{b.date} at {b.time}</p>
                    </div>
                  ))}
                  {myBookings.length === 0 && <p className="text-center py-10 text-gray-300 font-bold uppercase text-[9px]">No recent history found</p>}
                </div>
              )}
           </div>
        )}

        {/* VIEW: CONFIRMATION */}
        {view === 'confirmation' && (
           <div className="text-center pt-24 animate-in zoom-in-90 duration-700">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner animate-bounce"><Lucide.CheckCircle2 size={48}/></div>
             <h2 className="text-3xl font-black text-emerald-900 mb-1 uppercase tracking-tighter">Confirmed</h2>
             <p className="text-gray-400 mb-8 italic px-12 leading-relaxed font-bold uppercase text-[9px]">"Appointment Secured MH-08"</p>
             
             <div className="bg-white p-8 rounded-[3rem] shadow-xl border-2 border-emerald-50 mx-4 mb-12">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Unique Booking ID</p>
                <h3 className="text-5xl font-black text-emerald-600 tracking-widest">{lastBookingId}</h3>
                <p className="text-[8px] font-bold text-emerald-900 mt-4 uppercase bg-emerald-50 inline-block px-4 py-1 rounded-full">Screenshot this ID now</p>
             </div>

             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl uppercase tracking-widest">Back to Explore</button>
           </div>
        )}

        {/* ... Rest of the Essential Views (Store Detail, Admin, Dashboard) ... */}
        {view === 'store_detail' && selectedStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 pb-10">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4 active:scale-95 transition-transform"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             <img src={selectedStore.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-full h-56 rounded-[3rem] object-cover shadow-2xl" />
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-50">
               <h2 className="text-2xl font-black">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4">Services</h3>
               <div className="space-y-3">
                 {selectedStore.services?.map((s, i) => (
                   <div key={i} onClick={() => { if(cart.find(c => c.name === s.name)) setCart(cart.filter(c => c.name !== s.name)); else setCart([...cart, s]); }} className={`p-4 rounded-3xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50 shadow-md' : 'border-gray-50 bg-gray-50'}`}>
                     <span className="font-bold text-sm">{s.name}</span>
                     <span className="font-black text-emerald-600">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>
             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 text-center">Timing</h3>
                 <div className="space-y-4 mb-8">
                   <select onChange={e => setBookingMeta({...bookingMeta, staffName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm"><option value="">Any Staff</option>{selectedStore.staff?.map((st, i) => <option key={i} value={st}>{st}</option>)}</select>
                   <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none" />
                   <div className="grid grid-cols-3 gap-2 pt-2">{['10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '04:00 PM', '06:00 PM'].map(t => {
                     const full = isSlotFull(bookingMeta.date, t, bookingMeta.staffName);
                     return (<button key={t} disabled={full} onClick={() => setBookingMeta({...bookingMeta, time: t})} className={`py-3.5 rounded-xl text-[10px] font-black uppercase ${bookingMeta.time === t ? 'bg-emerald-600 text-white shadow-xl' : full ? 'bg-gray-100 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>{t}</button>);
                   })}</div>
                 </div>
                 <input placeholder="Your Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none mb-4" />
                 <input placeholder="Phone Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none mb-4" />
                 <button onClick={() => setView('checkout')} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl">Confirm ₹{cart.reduce((a, b) => a + Number(b.price), 0)}</button>
               </div>
             )}
           </div>
        )}

        {view === 'checkout' && (
           <div className="pt-4 space-y-6 animate-in zoom-in-95">
             <h2 className="text-2xl font-black text-emerald-900 uppercase">Confirm Booking</h2>
             <div className="bg-white p-6 rounded-[3rem] border border-gray-100 shadow-sm space-y-4">
                <h3 className="font-bold text-lg">{selectedStore?.name}</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{bookingMeta.date} • {bookingMeta.time}</p>
                <div className="flex justify-between text-xl font-black pt-4 border-t border-gray-100">
                   <span className="text-emerald-900">Total</span><span className="text-emerald-600">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</span>
                </div>
             </div>
             <button onClick={finalizeBooking} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-2xl active:scale-95 transition-all uppercase tracking-widest">Pay & Book Now</button>
          </div>
        )}

        {/* MERCHANT HUB */}
        {(view === 'vendor_portal' || view === 'vendor_login') && (
           <div className="pt-4 animate-in slide-in-from-bottom-4">
              <div className="text-center mb-8"><h2 className="text-3xl font-black tracking-tight uppercase">Merchant Hub</h2></div>
              <div className="flex bg-gray-200 p-1.5 rounded-2xl mb-8">
                 <button onClick={() => { setView('vendor_login'); setPortalTab('login'); }} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase transition-all ${portalTab === 'login' ? 'bg-white shadow-md text-emerald-600' : 'text-gray-500'}`}>Log In</button>
                 <button onClick={() => { setView('vendor_portal'); setPortalTab('register'); }} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase transition-all ${portalTab === 'register' ? 'bg-white shadow-md text-emerald-600' : 'text-gray-500'}`}>Apply</button>
              </div>
              {portalTab === 'login' ? (
                <div className="bg-white p-7 rounded-[3rem] space-y-4 shadow-sm">
                   <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                   <input type="password" placeholder="Passcode" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                   <button onClick={handleVendorAuth} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase tracking-widest">Enter Hub</button>
                </div>
              ) : (
                <div className="bg-white p-7 rounded-[3rem] space-y-4">
                  <input placeholder="Business Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                  <input placeholder="Address" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                  <button onClick={async () => {
                     await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), { uid: user.uid, ...regForm, status: 'pending', cat: 'salon' });
                     alert("Request Sent!");
                  }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase">Apply Now</button>
                </div>
              )}
           </div>
        )}

        {/* ADMIN AUTH */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={40} />
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 outline-none py-4 text-emerald-600 border-gray-100 mb-12" />
              <button onClick={() => {if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("DENIED"); setAdminPinInput(''); }}} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black uppercase">Unlock</button>
           </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}>
          <Lucide.Home size={22} /><span className="text-[9px] font-black uppercase">Explore</span>
        </button>
        <button onClick={() => setView(profile.role === 'vendor' ? 'dashboard' : 'vendor_login')} className={`flex flex-col items-center gap-1.5 transition-all ${['vendor_portal', 'vendor_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}>
          <Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-black uppercase">Business</span>
        </button>
        <button onClick={() => { setView('bookings'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}>
          <Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase">Bookings</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-gray-300 active:scale-90 transition-transform">
          <Lucide.User size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Account</span>
        </button>
      </nav>

    </div>
  );
}

