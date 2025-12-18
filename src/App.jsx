import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, updateDoc, getDoc, addDoc, deleteDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import * as Lucide from 'lucide-react';

// --- PRODUCTION FIREBASE CONFIG ---
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
const appId = "chiplun-pro-v18"; 
const ADMIN_PIN = "112607";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home');
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  
  // Data
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  
  // Interaction States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 

  // Master Booking State
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    paymentMethod: 'Cash at Store',
    source: '', destination: '', tripType: 'One-Way', returnDate: '', 
    patientAge: '', consultType: 'General', 
    brandModel: '', urgency: 'Standard' 
  });

  const [queueInfo, setQueueInfo] = useState({ pos: 0, delay: 0 });
  const [lastBookingId, setLastBookingId] = useState('');
  const [trackInput, setTrackInput] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);

  // Forms
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '', cat: 'salon' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '', duration: '30', category: 'General' });
  const [newStaff, setNewStaff] = useState('');
  const [editForm, setEditForm] = useState({ name: '', address: '', image: '', category: 'salon' });

  // --- Real-time Listeners ---
  useEffect(() => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      setUser(u);
    });
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), (snap) => {
        if (snap.exists()) setProfile(snap.data());
        else setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'customer', status: 'none', uid: user.uid });
        setLoading(false);
      }),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (s) => setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (s) => setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  const myStore = useMemo(() => stores.find(s => s.ownerId === profile.businessId), [stores, profile.businessId]);

  useEffect(() => {
    if (isSessionVerified && myStore) {
      setEditForm({ name: myStore.name, address: myStore.address, image: myStore.image || '', category: myStore.category || 'salon' });
    }
  }, [isSessionVerified, myStore]);

  // --- BUG FIX: Robust Track Token Search ---
  const handleTrackToken = async () => {
    if (!trackInput) return;
    const cleanToken = trackInput.trim().toUpperCase();
    
    // 1. Try Local Search first (Fastest)
    let found = allBookings.find(b => b.displayId?.toUpperCase() === cleanToken);
    
    if (!found) {
      // 2. Direct Database Search (Reliable Fallback)
      setIsProcessing(true);
      try {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), where("displayId", "==", cleanToken));
        const snap = await getDocs(q);
        if (!snap.empty) {
          found = { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      } catch (e) { console.error("Search Error", e); }
      setIsProcessing(false);
    }

    if (found) setSearchedBooking(found);
    else alert("Token not found. Please check the ID and try again.");
  };

  const handleFinalConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setShowConfirmModal(false);

    const token = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const ahead = allBookings.filter(b => b.storeId === selectedStore.id && b.date === bookingMeta.date).length;
    const total = cart.reduce((a, b) => a + Number(b.price), 0);

    const payload = { 
      ...bookingMeta, displayId: token, services: cart, totalPrice: total, 
      queuePos: ahead + 1, estWait: ahead * 30,
      storeId: selectedStore.id, storeName: selectedStore.name, timestamp: serverTimestamp() 
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      setLastBookingId(token);
      setQueueInfo({ pos: ahead + 1, delay: ahead * 30 });
      setIsProcessing(false);
      setView('confirmation');
    } catch (e) { 
      alert("System Busy. Try again."); 
      setIsProcessing(false); 
    }
  };

  const handleAdminWipe = async () => {
    if (!deleteTarget) return;
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', deleteTarget.id));
      if (deleteTarget.merchantId) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', deleteTarget.merchantId.toUpperCase()));
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) { alert("Wipe failed"); }
    setIsProcessing(false);
  };

  const handleVendorLogin = async () => {
    if (!vendorLogin.id) return;
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id.toUpperCase()));
    if (snap.exists() && snap.data().password === vendorLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        role: 'vendor', status: 'approved', businessId: snap.data().uid, businessName: snap.data().businessName
      });
      setIsSessionVerified(true);
      setView('dashboard');
    } else alert("Invalid Credentials");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase tracking-widest text-xs">ChiplunConnect Pro V18</div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {/* GLOBAL OVERLAYS */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[500] flex items-center justify-center p-6 animate-in zoom-in-95">
           <div className="bg-white w-full rounded-[3.5rem] p-10 shadow-2xl">
              <Lucide.ShieldCheck size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-black text-center mb-6 uppercase">Confirm Reservation</h3>
              <div className="bg-gray-50 p-6 rounded-3xl space-y-3 mb-8 text-[10px] font-black uppercase border border-gray-100 shadow-inner">
                 <div className="flex justify-between"><span>Provider:</span><span className="text-emerald-700">{bookingMeta.resourceName || 'Assigned'}</span></div>
                 <div className="flex justify-between"><span>Schedule:</span><span>{bookingMeta.date} @ {bookingMeta.time}</span></div>
                 <div className="flex justify-between border-t border-gray-200 pt-3"><span>Payable:</span><span className="text-lg font-black text-emerald-600">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</span></div>
              </div>
              <button disabled={isProcessing} onClick={handleFinalConfirm} className="w-full bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black uppercase text-xs shadow-xl active:scale-95 transition-all">
                {isProcessing ? 'Processing...' : 'Confirm & Secure'}
              </button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-gray-400 font-black text-[10px] uppercase">Cancel</button>
           </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[500] flex items-center justify-center p-6">
           <div className="bg-white w-full rounded-[3rem] p-8 shadow-2xl text-center">
              <Lucide.Trash2 size={48} className="text-rose-500 mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase">Destroy Records?</h3>
              <p className="text-gray-400 text-xs mt-3 mb-8">This wipes <span className="text-rose-600 font-bold underline">"{deleteTarget.name}"</span> and revokes ID access forever.</p>
              <button onClick={handleAdminWipe} className="w-full bg-rose-500 text-white py-5 rounded-2xl font-black uppercase text-xs mb-3 shadow-xl">Confirm Destruction</button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-4 text-gray-400 font-black text-xs uppercase">Back Safe</button>
           </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic">ChiplunConnect</h1>
            <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Enterprise Suite • V18</p>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 active:bg-white/20 shadow-inner">
            <Lucide.ShieldCheck size={20}/>
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-2">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search Chiplun stores..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 overflow-y-auto z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
             <div className="grid grid-cols-4 gap-4 animate-in zoom-in-95">
               {[{id:'salon', n:'Salon', i:<Lucide.Scissors/>, c:'bg-rose-50 text-rose-500'},{id:'travel', n:'Travel', i:<Lucide.Bus/>, c:'bg-blue-50 text-blue-500'},{id:'clinic', n:'Clinic', i:<Lucide.Stethoscope/>, c:'bg-emerald-50 text-emerald-500'},{id:'repair', n:'Repair', i:<Lucide.Info/>, c:'bg-amber-50 text-amber-500'}].map(cat => (
                 <button key={cat.id} className="flex flex-col items-center gap-2 group active:scale-90 transition-transform">
                   <div className={`${cat.c} p-4 rounded-2xl shadow-sm border border-black/5`}>{cat.i}</div>
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{cat.n}</span>
                 </button>
               ))}
             </div>

             <section className="animate-in slide-in-from-bottom-4">
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Live Businesses</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); setBookingMeta({ ...bookingMeta, resourceName: '' }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 hover:border-emerald-200 active:scale-[0.98] transition-all group">
                     <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover bg-gray-50 border border-gray-50 shadow-sm" />
                     <div className="flex-1">
                       <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full mb-1 inline-block ${store.category === 'salon' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{store.category}</span>
                       <h3 className="font-bold text-gray-800 text-sm uppercase">{store.name}</h3>
                       <p className="text-[10px] text-gray-400 font-medium italic">{store.address}</p>
                     </div>
                     <Lucide.ChevronRight size={18} className="text-gray-200 mr-2 group-hover:text-emerald-400" />
                   </div>
                 ))}
               </div>
             </section>
          </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === 'store_detail' && selectedStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 pb-10">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             <img src={selectedStore.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-full h-52 rounded-[3rem] object-cover shadow-2xl" />
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100">
               <h2 className="text-2xl font-black italic text-emerald-900 uppercase">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center font-medium italic"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
               
               {/* CATEGORY DEEP DIVE */}
               {selectedStore.category === 'travel' && (
                 <div className="space-y-3 mb-8 p-5 bg-blue-50/50 rounded-[2.5rem] border border-blue-100 animate-in slide-in-from-top-2">
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Travel Planner</p>
                    <div className="grid grid-cols-2 gap-2">
                       <input placeholder="Source" onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})} className="bg-white p-3 rounded-xl text-xs font-bold outline-none border border-blue-100 uppercase" />
                       <input placeholder="Destination" onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-white p-3 rounded-xl text-xs font-bold outline-none border border-blue-100 uppercase" />
                    </div>
                 </div>
               )}

               {selectedStore.category === 'clinic' && (
                 <div className="space-y-3 mb-8 p-5 bg-emerald-50/50 rounded-[2.5rem] border border-emerald-100 animate-in slide-in-from-top-2">
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Medical Info</p>
                    <div className="grid grid-cols-2 gap-2">
                       <input placeholder="Patient Age" type="number" onChange={e => setBookingMeta({...bookingMeta, patientAge: e.target.value})} className="bg-white p-3 rounded-xl text-xs font-bold outline-none border border-emerald-100" />
                       <select onChange={e => setBookingMeta({...bookingMeta, consultType: e.target.value})} className="bg-white p-3 rounded-xl text-xs font-bold border border-emerald-100"><option>General</option><option>Specialist</option></select>
                    </div>
                 </div>
               )}

               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest font-black">Choose Services</h3>
               <div className="space-y-3">
                 {selectedStore.services?.map((s, i) => (
                   <div key={i} onClick={() => { if(cart.find(c => c.name === s.name)) setCart(cart.filter(c => c.name !== s.name)); else setCart([...cart, s]); }} className={`p-5 rounded-3xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50 shadow-md' : 'border-gray-50 bg-gray-50'}`}>
                     <div><p className="font-bold text-sm leading-none uppercase">{s.name}</p><p className="text-[8px] text-gray-400 mt-1.5 uppercase font-black">{s.duration || '30'} MINS</p></div>
                     <span className="font-black text-emerald-600 text-lg">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>

             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 text-center tracking-widest font-black">Schedule</h3>
                 <div className="space-y-4">
                   <div className="flex gap-2">
                      <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                      <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-32 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                   </div>

                   <select 
                      onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} 
                      className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm shadow-inner"
                   >
                      <option value="">{selectedStore.category === 'travel' ? 'Choose Vehicle' : selectedStore.category === 'clinic' ? 'Choose Doctor' : 'Choose Specialist'}</option>
                      {selectedStore.staff?.map((st, i) => {
                         const busy = allBookings.some(b => b.storeId === selectedStore.id && b.resourceName === st && b.date === bookingMeta.date && b.time === bookingMeta.time);
                         return <option key={i} value={st} disabled={busy}>{st} {busy ? '(BUSY)' : ''}</option>
                      })}
                   </select>

                   <input placeholder="WhatsApp Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 uppercase shadow-inner" />
                   <button disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-50">Confirm Reservation</button>
                 </div>
              </div>
            )}
           </div>
        )}

        {/* VIEW: TRACK TOKEN (Deep Search Fix) */}
        {view === 'bookings' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4">
              <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter italic">Token Search</h2>
              <div className="bg-white p-2 rounded-[2.5rem] shadow-sm border border-gray-100 flex gap-2">
                 <input placeholder="CH-XXXX" value={trackInput} onChange={e => setTrackInput(e.target.value)} className="flex-1 bg-transparent px-5 py-3 outline-none font-black tracking-widest text-sm uppercase" />
                 <button onClick={handleTrackToken} className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all shadow-lg"><Lucide.Search size={22}/></button>
              </div>

              {isProcessing && <p className="text-center text-[10px] font-black text-emerald-600 uppercase animate-pulse">Deep Scanning Database...</p>}

              {searchedBooking ? (
                <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10"><Lucide.ShieldCheck size={80}/></div>
                   <div className="flex justify-between items-start mb-8 relative z-10">
                      <div><p className="text-[10px] font-black uppercase opacity-60">Verified Appointment</p><h3 className="text-xl font-black italic uppercase tracking-tight">{searchedBooking.storeName}</h3></div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black tracking-widest">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-4 text-sm font-bold relative z-10">
                      <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Queue Pos</p>#{searchedBooking.queuePos || '1'}</div>
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Assigned</p>{searchedBooking.resourceName || 'First Free'}</div>
                      </div>
                      <div className="bg-white/10 p-4 rounded-3xl">
                         <p className="opacity-60 text-[8px] uppercase mb-1 italic">Schedule</p>
                         <p>{searchedBooking.date} • {searchedBooking.time}</p>
                      </div>
                      {searchedBooking.source && <p className="text-[10px] font-black uppercase tracking-widest italic text-emerald-200 text-center">{searchedBooking.source} → {searchedBooking.destination}</p>}
                   </div>
                   <button onClick={() => setSearchedBooking(null)} className="w-full mt-10 py-3 text-[10px] font-black uppercase bg-white/10 rounded-2xl active:scale-95 transition-all">New Search</button>
                </div>
              ) : !isProcessing && (
                <p className="text-center py-20 text-gray-300 text-[10px] font-black uppercase tracking-widest animate-pulse italic">Enter unique token to track live status</p>
              )}
           </div>
        )}

        {/* VIEW: MERCHANT HUB (Fixed Login) */}
        {view === 'dashboard' && (
           <div className="pt-4 space-y-6 px-4 pb-10">
              {!isSessionVerified ? (
                 <div className="animate-in zoom-in-95 duration-500">
                    <div className="text-center mb-10">
                       <Lucide.UserCircle size={64} className="mx-auto text-emerald-600 mb-2 p-4 bg-emerald-50 rounded-[2.5rem] shadow-inner"/>
                       <h2 className="text-3xl font-black uppercase tracking-tighter italic text-emerald-900">Merchant Hub</h2>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Secure session access</p>
                    </div>
                    <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl space-y-4 border border-gray-100">
                       <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none uppercase shadow-inner" />
                       <input type="password" placeholder="Passcode" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none shadow-inner" />
                       <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest">Authorize Identity</button>
                    </div>
                 </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-bottom-8">
                   <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tight">{profile.businessName}</h2><button onClick={() => { setIsSessionVerified(false); setView('home'); }} className="bg-rose-50 px-4 py-2 rounded-xl text-rose-500 font-black text-[8px] uppercase shadow-sm">Logout</button></div>

                   <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 space-y-6 animate-in fade-in">
                      <div className="flex justify-between items-center"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center font-black"><Lucide.Image size={14} className="mr-2 text-emerald-600"/> Branding</h3>{editForm.image && <img src={editForm.image} className="w-10 h-10 rounded-xl object-cover" />}</div>
                      <input placeholder="New Image URL" value={editForm.image} onChange={e => setEditForm({...editForm, image: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner uppercase" />
                      <input placeholder="Shop Name" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner" />
                      <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), editForm); alert("Updated!"); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg">Save Changes</button>
                   </section>

                   <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 font-black uppercase">Service Menu</h3>
                      <div className="space-y-3 mb-6">
                        {myStore?.services?.map((s, i) => (<div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl font-bold text-sm border border-gray-100"><div><p className="text-[8px] uppercase text-emerald-600 font-black tracking-widest">{s.category}</p><p className="uppercase">{s.name}</p><p className="text-gray-400 text-[10px]">₹{s.price} • {s.duration} min</p></div><button onClick={() => { updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: myStore.services.filter((_, idx) => idx !== i) }); }} className="text-rose-400 p-2.5 bg-white rounded-xl shadow-sm"><Lucide.Trash2 size={16}/></button></div>))}
                      </div>
                      <div className="space-y-3 pt-6 border-t border-gray-100">
                        <input placeholder="New Service" value={newSvc.name} onChange={e => setNewSvc({...newSvc, name: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-xs outline-none uppercase font-bold" />
                        <div className="grid grid-cols-2 gap-2">
                           <input placeholder="Price ₹" type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs outline-none font-bold" />
                           <input placeholder="Duration Mins" type="number" value={newSvc.duration} onChange={e => setNewSvc({...newSvc, duration: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs outline-none font-bold" />
                        </div>
                        <button onClick={async () => {
                           if(!newSvc.name || !newSvc.price) return;
                           const current = myStore?.services || [];
                           await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: [...current, newSvc] });
                           setNewSvc({name:'', price:'', duration:'30', category:'General'});
                        }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px]">Add to List</button>
                      </div>
                   </section>

                   <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !myStore?.isLive })} className={`w-full py-5 rounded-[2.5rem] font-black uppercase shadow-2xl active:scale-95 transition-all ${myStore?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
                      {myStore?.isLive ? 'Disable storefront' : 'Set Business Live'}
                   </button>
                </div>
              )}
           </div>
        )}

        {/* ... (Admin and Confirmation Views kept stable) ... */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95 px-4">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-6" size={48} />
              <h2 className="text-3xl font-black mb-10 tracking-tighter text-emerald-900 uppercase">Admin Hub</h2>
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 border-emerald-100 outline-none bg-transparent mb-12 tracking-[0.2em]" />
              <button onClick={() => { if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("DENIED"); setAdminPinInput(''); } }} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl active:scale-95 uppercase">Unlock Panel</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-6 pb-20 px-4">
            <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter">System Core</h2>
            <div className="space-y-4">
              {stores.map(s => (
                <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-gray-100 flex items-center gap-4 animate-in fade-in">
                   <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 uppercase shadow-inner text-xl">{s.name[0]}</div>
                   <div className="flex-1 font-bold text-sm uppercase">{s.name} <span className="block text-[8px] opacity-40 font-black italic">{s.category} • ID: {s.merchantId}</span></div>
                   <button onClick={() => setDeleteTarget(s)} className="text-rose-500 p-3 active:bg-rose-50 rounded-xl transition-all shadow-sm"><Lucide.Trash2 size={24}/></button>
                </div>
              ))}
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mt-10">Application Requests</h3>
              {requests.filter(r => r.status === 'pending').map(req => (
                  <div key={req.id} className="bg-amber-50 p-7 rounded-[3rem] space-y-4 border border-amber-100 animate-in fade-in">
                    <h4 className="font-bold text-sm uppercase italic">{req.bizName} ({req.cat})</h4>
                    <div className="flex gap-2">
                      <input id={`id-${req.id}`} placeholder="Issue ID" className="flex-1 p-3 rounded-xl text-xs font-bold outline-none uppercase border border-amber-200" />
                      <input id={`pw-${req.id}`} placeholder="Key" className="w-20 p-3 rounded-xl text-xs font-bold outline-none border border-amber-200" />
                    </div>
                    <button onClick={async () => {
                        const mid = document.getElementById(`id-${req.id}`).value;
                        const pass = document.getElementById(`pw-${req.id}`).value;
                        if(!mid || !pass) return alert("Setup credentials");
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', mid.toUpperCase()), { password: pass, uid: req.uid, businessName: req.bizName });
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.uid), { status: 'approved' });
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, merchantId: mid.toUpperCase(), isLive: false, services: [], staff: [], image: "" });
                        alert("Merchant Live!");
                      }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg">Authorize Entrance</button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {view === 'vendor_portal' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4 pb-10 text-center">
              <div className="text-center mb-10">
                 <Lucide.PlusCircle size={56} className="mx-auto text-emerald-600 mb-2 p-4 bg-emerald-50 rounded-[2.5rem] shadow-inner" />
                 <h2 className="text-3xl font-black uppercase tracking-tighter text-emerald-900 italic">Apply to Join</h2>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Register business for MH-08</p>
              </div>
              <div className="bg-white p-7 rounded-[3.5rem] shadow-xl space-y-4 border border-gray-100 text-left">
                 <input placeholder="Official Shop Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase" />
                 <input placeholder="Chiplun Area Location" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase" />
                 <select value={regForm.cat} onChange={e => setRegForm({...regForm, cat: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200">
                    <option value="salon">Salon & Wellness</option><option value="travel">Taxi & Transport</option><option value="clinic">Clinic/Doctor</option><option value="repair">Service/Repair</option>
                 </select>
                 <button 
                  onClick={async () => {
                    if(!regForm.bizName || !regForm.addr) return alert("Fields required");
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), { uid: user.uid, ...regForm, status: 'pending', timestamp: new Date().toISOString() });
                    alert("Application Sent! Check with Admin for ID.");
                    setView('home');
                  }} 
                  className="w-full bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest"
                 >
                  Launch Application
                 </button>
              </div>
           </div>
        )}

        {view === 'confirmation' && (
           <div className="text-center pt-10 animate-in zoom-in-90 duration-700 pb-10 px-4">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce border-2 border-emerald-200 shadow-xl"><Lucide.CheckCircle2 size={48}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-6 uppercase tracking-tighter">Verified</h2>
             <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl space-y-6 relative overflow-hidden text-center shadow-emerald-200">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Lucide.Clock size={100}/></div>
                <div><p className="text-[10px] font-black uppercase opacity-60 mb-2 italic tracking-widest">Unique Booking Token</p><h3 className="text-5xl font-black tracking-widest italic">{lastBookingId}</h3></div>
                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 font-black uppercase">
                   <div className="text-center border-r border-white/10">
                      <p className="text-[8px] opacity-60">Position</p><p className="text-2xl">#{queueInfo.pos}</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[8px] opacity-60">Estimated</p><p className="text-2xl">+{queueInfo.delay}m</p>
                   </div>
                </div>
             </div>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 uppercase tracking-widest mt-10">Done</button>
           </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-3xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase tracking-widest">Explore</span></button>
        <button onClick={() => setView('vendor_portal')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'vendor_portal' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Building2 size={22} /><span className="text-[9px] font-black uppercase tracking-widest">Business</span></button>
        <button onClick={() => { setView('bookings'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase tracking-widest">Track</span></button>
        <button onClick={() => setView('dashboard')} className={`flex flex-col items-center gap-1.5 transition-all ${['merchant_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.UserCircle size={22} /><span className="text-[9px] font-black uppercase tracking-widest">Account</span></button>
      </nav>

    </div>
  );
}

