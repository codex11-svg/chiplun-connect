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
const appId = "chiplun-pro-v45-supreme"; 
const ADMIN_PIN = "112607";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  
  // Data Registry
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [myBookings, setMyBookings] = useState([]); 
  
  // Interaction Engine
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 

  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    paymentMethod: 'Cash Only',
    source: 'Chiplun', destination: '', numSeats: 1,
    patientAge: '', brandModel: ''
  });

  const [queueInfo, setQueueInfo] = useState({ pos: 1, delay: 0 });
  const [lastBookingId, setLastBookingId] = useState('');
  const [trackInput, setTrackInput] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);

  // Forms
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '', cat: 'salon' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '', km: '1', stops: '' }); 
  const [newStaff, setNewStaff] = useState({ name: '', capacity: 1 }); 
  const [editForm, setEditForm] = useState({ name: '', address: '', image: '', category: 'salon', lunchStart: '13:00', lunchEnd: '14:00' });

  // --- Core Lifecycle ---
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
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (s) => setRequests(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), (s) => setMyBookings(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    ];
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // Enterprise Memos
  const myStore = useMemo(() => stores.find(s => s.id === profile.businessId), [stores, profile.businessId]);
  const merchantBookings = useMemo(() => profile.businessId ? allBookings.filter(b => b.storeId === profile.businessId && b.status !== 'completed') : [], [allBookings, profile.businessId]);
  const todayRevenue = useMemo(() => profile.businessId ? allBookings.filter(b => b.storeId === profile.businessId && b.status === 'completed').reduce((a, b) => a + (Number(b.totalPrice) || 0), 0) : 0, [allBookings, profile.businessId]);
  const filteredStores = useMemo(() => stores.filter(s => s.isLive && (s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.address.toLowerCase().includes(searchQuery.toLowerCase()) || s.category.toLowerCase().includes(searchQuery.toLowerCase()))), [stores, searchQuery]);

  useEffect(() => {
    if (isSessionVerified && myStore) {
      setEditForm({ name: myStore.name, address: myStore.address, image: myStore.image || '', category: myStore.category || 'salon', lunchStart: myStore.lunchStart || '13:00', lunchEnd: myStore.lunchEnd || '14:00' });
    }
  }, [isSessionVerified, myStore]);

  // --- Logistics Helpers ---
  const calculateDynamicFare = (service, source, dest) => {
    if (!service || !service.km || service.km === "0") return Number(service.price);
    const farePerKm = Number(service.price) / Number(service.km);
    // segment logic: if travel is within partial stops, reduce fare (Mocking distance as 70% of total)
    if (dest && !service.name.toLowerCase().includes(dest.toLowerCase())) return Math.floor(Number(service.price) * 0.65);
    return Number(service.price);
  };

  const getRemainingSeats = (vehicleName, date, time, totalCap) => {
    const taken = allBookings.filter(b => b.storeId === selectedStore?.id && b.resourceName === vehicleName && b.date === date && b.time === time && b.status !== 'completed')
                    .reduce((sum, b) => sum + (Number(b.numSeats) || 1), 0);
    return Math.max(0, totalCap - taken);
  };

  const handleFinalConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setShowConfirmModal(false);

    const token = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const unitPrice = cart[0] ? calculateDynamicFare(cart[0], bookingMeta.source, bookingMeta.destination) : 0;
    const finalTotal = unitPrice * (selectedStore.category === 'travel' ? bookingMeta.numSeats : 1);

    const payload = { 
      ...bookingMeta, 
      displayId: token, 
      services: cart, 
      totalPrice: finalTotal, 
      status: 'pending', 
      storeId: selectedStore.id, 
      storeName: selectedStore.name, 
      timestamp: Date.now() 
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setLastBookingId(token);
      setIsProcessing(false);
      setView('confirmation');
    } catch (e) { alert("Error"); setIsProcessing(false); }
  };

  const handleTrackToken = () => {
    if (!trackInput) return;
    const found = allBookings.find(b => b.displayId?.toUpperCase() === trackInput.trim().toUpperCase());
    if (found) setSearchedBooking(found);
    else alert("Invalid ID");
  };

  const handleVendorLogin = async () => {
    if (!vendorLogin.id) return;
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id.toUpperCase()));
    if (snap.exists() && snap.data().password === vendorLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        role: 'vendor', status: 'approved', businessId: snap.data().storeId, businessName: snap.data().businessName
      });
      setIsSessionVerified(true);
      setView('merchant_dashboard');
    } else alert("Invalid Merchant ID or Key");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse uppercase text-xs tracking-widest italic">CHIPLUNCONNECT SUPREME</div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden text-left">
      
      {/* FINAL MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[500] flex items-center justify-center p-6 animate-in zoom-in-95">
           <div className="bg-white w-full rounded-[3.5rem] p-10 shadow-2xl border-t-8 border-emerald-500">
              <Lucide.ShieldCheck size={48} className="text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-black text-center mb-6 uppercase tracking-tighter italic">Confirm Booking</h3>
              <div className="bg-gray-50 p-6 rounded-3xl space-y-3 mb-8 text-[10px] font-black uppercase border border-gray-100 shadow-inner text-gray-700">
                 <div className="flex justify-between"><span>Merchant:</span><span className="text-emerald-800">{selectedStore?.name}</span></div>
                 <div className="flex justify-between"><span>Schedule:</span><span>{bookingMeta.time}</span></div>
                 <div className="flex justify-between border-t border-gray-200 pt-3"><span>Payable:</span><span className="text-xl font-black text-emerald-600">₹{cart[0] ? calculateDynamicFare(cart[0], bookingMeta.source, bookingMeta.destination) * (selectedStore.category === 'travel' ? bookingMeta.numSeats : 1) : 0} (CASH)</span></div>
              </div>
              <button disabled={isProcessing} onClick={handleFinalConfirm} className="w-full bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Verify & Book Now</button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-gray-400 font-black text-[10px] uppercase text-center w-full">Go Back</button>
           </div>
        </div>
      )}

      {/* ADMIN DELETE */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[500] flex items-center justify-center p-6 animate-in fade-in text-center">
           <div className="bg-white w-full rounded-[3rem] p-10 shadow-2xl border-2 border-rose-100">
              <Lucide.Trash2 size={40} className="text-rose-500 mx-auto mb-4" />
              <h3 className="text-xl font-black uppercase tracking-tighter">Destroy Business?</h3>
              <p className="text-gray-400 text-xs mt-3 mb-8 leading-relaxed font-bold uppercase tracking-widest italic">Wiping <span className="underline">{deleteTarget.name}</span> will erase all records forever.</p>
              <button onClick={async () => {
                setIsProcessing(true);
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', deleteTarget.id));
                if (deleteTarget.merchantId) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', deleteTarget.merchantId.toUpperCase()));
                const reqSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), where("uid", "==", deleteTarget.ownerId)));
                reqSnap.forEach(async (d) => await deleteDoc(d.ref));
                setDeleteTarget(null);
                setIsProcessing(false);
              }} className="w-full bg-rose-50 text-white py-5 rounded-2xl font-black uppercase text-xs mb-3 shadow-xl">Purge Entire Data</button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-4 text-gray-400 font-bold text-xs uppercase">Cancel</button>
           </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all text-left">
            <h1 className="text-2xl font-black tracking-tighter italic leading-none">ChiplunConnect</h1>
            <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest italic font-black">Nexus Enterprise • MH-08</p>
          </div>
          <button onClick={() => setView('admin')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 active:bg-white/30 shadow-inner"><Lucide.Lock size={20}/></button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-2">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search businesses or areas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none shadow-inner" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 overflow-y-auto z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2 text-center">
             <div className="grid grid-cols-4 gap-4 animate-in zoom-in-95">
               {[{id:'salon', n:'Salon', i:<Lucide.Scissors/>, c:'bg-rose-50 text-rose-500'},{id:'travel', n:'Travel', i:<Lucide.Bus/>, c:'bg-blue-50 text-blue-500'},{id:'clinic', n:'Clinic', i:<Lucide.Stethoscope/>, c:'bg-emerald-50 text-emerald-500'},{id:'repair', n:'Repair', i:<Lucide.Wrench/>, c:'bg-amber-50 text-amber-500'}].map(cat => (
                 <button key={cat.id} onClick={() => setSearchQuery(cat.id === searchQuery ? '' : cat.id)} className={`flex flex-col items-center gap-2 active:scale-90 transition-transform ${searchQuery === cat.id ? 'scale-110' : 'opacity-60'}`}>
                   <div className={`${cat.c} p-4 rounded-2xl shadow-sm border border-black/5`}>{cat.i}</div>
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{cat.n}</span>
                 </button>
               ))}
             </div>

             <section className="animate-in slide-in-from-bottom-4 pb-10 text-left">
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1 italic font-black">Live Businesses</h2>
               <div className="space-y-4">
                 {filteredStores.map(store => {
                   const status = getStoreStatus(store);
                   return (
                    <div key={store.id} onClick={() => { setSelectedStore(store); setView('detail'); setCart([]); setBookingMeta({ ...bookingMeta, resourceName: '' }); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 hover:border-emerald-200 active:scale-[0.98] transition-all group overflow-hidden">
                      <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover bg-gray-50 shadow-sm" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                           <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${store.category === 'salon' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{store.category}</span>
                           <div className={`${status.color} px-2 py-0.5 rounded-full flex items-center gap-1 text-white text-[7px] font-black uppercase shadow-sm`}>{status.icon} {status.label}</div>
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm leading-tight uppercase tracking-tight">{store.name}</h3>
                        <p className="text-[10px] text-gray-400 font-medium italic mt-0.5 leading-none">{store.address}</p>
                      </div>
                      <Lucide.ChevronRight size={18} className="text-gray-200 mr-2 group-hover:text-emerald-400" />
                    </div>
                   );
                 })}
               </div>
             </section>
          </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === 'detail' && selectedStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 pb-10 text-left">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4 active:scale-95 transition-all"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             <img src={selectedStore.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-full h-52 rounded-[3rem] object-cover shadow-2xl" />
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100">
               <h2 className="text-2xl font-black italic text-emerald-900 uppercase tracking-tighter">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center italic font-medium"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
               
               {/* TRAVEL LOGISTICS: ROUTE PICKER */}
               {selectedStore.category === 'travel' && (
                  <div className="space-y-4 mb-8 p-6 bg-blue-50/50 rounded-[2.5rem] border border-blue-100 animate-in fade-in">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-center italic font-black">Logistics Planner</p>
                    <div className="grid grid-cols-2 gap-3">
                       <input placeholder="From Area" value={bookingMeta.source} onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})} className="bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-blue-200 uppercase shadow-inner" />
                       <input placeholder="To (e.g. Mumbai/Khed)" onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-blue-200 uppercase shadow-inner" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-blue-400 uppercase ml-1">Number of Seats (Ertiga 1-7, Creta 1-5)</p>
                      <input type="number" min="1" max="10" value={bookingMeta.numSeats} onChange={e => setBookingMeta({...bookingMeta, numSeats: Number(e.target.value)})} className="w-full bg-white p-3 rounded-2xl text-xs font-bold border border-blue-200" />
                    </div>
                  </div>
               )}

               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest font-black">Select {selectedStore.category === 'travel' ? 'Route Package' : 'Service'}</h3>
               <div className="space-y-3">
                 {selectedStore.services?.map((s, i) => {
                   const finalP = calculateDynamicFare(s, bookingMeta.source, bookingMeta.destination);
                   return (
                    <div key={i} onClick={() => { setCart([s]); }} className={`p-5 rounded-3xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart[0]?.name === s.name ? 'border-emerald-600 bg-emerald-50 shadow-md scale-[1.02]' : 'border-gray-50 bg-gray-50'}`}>
                      <div className="text-left">
                        <p className="font-bold text-sm leading-none uppercase">{s.name}</p>
                        <p className="text-[8px] text-gray-400 mt-1.5 uppercase font-black tracking-widest">{selectedStore.category === 'travel' ? `Calculated segment price` : `${s.duration} MINS`}</p>
                      </div>
                      <span className="font-black text-emerald-600 text-lg tracking-tighter">₹{finalP}</span>
                    </div>
                   );
                 })}
               </div>
             </section>

             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 text-center tracking-widest font-black italic">Scheduling</h3>
                 <div className="space-y-4 text-left">
                   <div className="flex gap-2">
                      <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                      <input type="time" onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-32 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                   </div>
                   
                   <select onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm shadow-inner text-left">
                      <option value="">{selectedStore.category === 'salon' ? 'Select Barber/Stylist' : selectedStore.category === 'travel' ? 'Select Car/Vehicle' : 'Select Specialist'}</option>
                      {selectedStore.staff?.map((st, i) => {
                         const rem = selectedStore.category === 'travel' ? getRemainingSeats(st.name, bookingMeta.date, bookingMeta.time, st.capacity) : 1;
                         const isBusy = rem < (selectedStore.category === 'travel' ? bookingMeta.numSeats : 1);
                         return <option key={i} value={st.name} disabled={isBusy}>{st.name} {selectedStore.category === 'travel' ? `(${rem} Seats Left)` : isBusy ? '(BUSY)' : ''}</option>
                      })}
                   </select>

                   <input placeholder="WhatsApp Phone" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 uppercase shadow-inner" />
                   <button disabled={!bookingMeta.date || !bookingMeta.time || isMerchantOnBreak(bookingMeta.time, selectedStore)} onClick={() => setShowConfirmModal(true)} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-40">
                      {isMerchantOnBreak(bookingMeta.time, selectedStore) ? 'Merchant on Break' : 'Review & Confirm'}
                   </button>
                 </div>
              </div>
            )}
           </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD (Partner Hub - Logic Locked) */}
        {view === 'merchant_dashboard' && isSessionVerified && (
           <div className="pt-4 space-y-6 px-4 pb-20 animate-in slide-in-from-bottom-8 text-left">
              <div className="flex justify-between items-center text-left"><h2 className="text-2xl font-black text-emerald-900 italic uppercase tracking-tight">{profile.businessName}</h2><button onClick={() => {setIsSessionVerified(false); setView('account');}} className="bg-rose-50 px-4 py-2 rounded-xl text-rose-500 font-black text-[8px] uppercase shadow-sm">Logout</button></div>

              <div className="grid grid-cols-2 gap-3 text-left">
                 <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-center">
                    <p className="text-[8px] font-black uppercase text-gray-400 mb-1 tracking-widest">Revenue Forecast</p>
                    <p className="text-xl font-black text-emerald-600">₹{todayRevenue}</p>
                 </div>
                 <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#store=${profile.businessId}`); alert("Enterprise Link Copied!"); }} className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-center active:scale-95 transition-all">
                    <Lucide.QrCode size={20} className="text-emerald-600 mb-1"/>
                    <p className="text-[8px] font-black uppercase text-emerald-900 italic font-black">Share QR Link</p>
                 </button>
              </div>

              <section className="bg-emerald-600 text-white p-7 rounded-[3rem] shadow-xl space-y-4 border border-black/5 text-left">
                 <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center opacity-80 italic font-black font-black uppercase tracking-widest text-left"><Lucide.Calendar size={14} className="mr-2"/> Incoming Queue</h3>
                 <div className="space-y-3 max-h-72 overflow-y-auto pr-1 text-left">
                   {merchantBookings.length > 0 ? merchantBookings.sort((a,b) => b.timestamp - a.timestamp).map((b, i) => (
                      <div key={i} className="bg-white/10 p-4 rounded-2xl border border-white/5 space-y-1 animate-in fade-in text-left">
                         <div className="flex justify-between font-black text-[11px] uppercase italic text-white text-left text-left"><span>{b.custName || 'Guest'}</span><span className="text-emerald-200">#{b.displayId}</span></div>
                         <div className="bg-emerald-700/50 px-3 py-1 rounded-xl inline-block mt-1 text-left"><p className="text-[9px] font-black text-emerald-50 uppercase tracking-tighter italic font-black text-emerald-50">Booked: {b.services?.map(s => s.name).join(', ')} {b.numSeats ? `(${b.numSeats} Seats)` : ''}</p></div>
                         <p className="text-[9px] opacity-70 uppercase font-bold tracking-widest block pt-1 italic text-left">{b.date} • {b.time} • {b.resourceName || 'Available'}</p>
                         {b.source && <p className="text-[8px] text-emerald-100 italic leading-none">{b.source} → {b.destination}</p>}
                         <div className="pt-2 flex justify-between items-center text-left">
                            <span className="text-[10px] font-black uppercase text-emerald-200 flex items-center gap-1 text-left"><Lucide.Phone size={10}/> {b.custPhone}</span>
                            <div className="flex gap-1">
                              <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'completed' }); }} className="bg-white text-emerald-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase shadow-sm">Mark Done</button>
                              <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', b.id), { status: 'cancelled' }); }} className="bg-rose-500 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase shadow-sm">Cancel</button>
                            </div>
                         </div>
                      </div>
                   )) : <p className="text-center py-10 text-[9px] opacity-60 font-bold uppercase tracking-widest italic font-black text-emerald-200">Zero active requests</p>}
                 </div>
              </section>

              <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 space-y-6 text-left">
                 <div className="flex justify-between items-center"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center font-black italic uppercase tracking-widest"><Lucide.Clock size={14} className="mr-2 text-emerald-600"/> Night/Lunch Shift</h3>{editForm.image && <img src={editForm.image} className="w-10 h-10 rounded-xl object-cover shadow-sm border border-gray-50" />}</div>
                 <div className="grid grid-cols-2 gap-2 text-left">
                   <div className="space-y-1"><p className="text-[8px] font-black text-gray-400 ml-1 uppercase italic text-left font-black">Window Start</p><input type="time" value={editForm.lunchStart} onChange={e => setEditForm({...editForm, lunchStart: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner border uppercase" /></div>
                   <div className="space-y-1"><p className="text-[8px] font-black text-gray-400 ml-1 uppercase italic text-left font-black">Window End</p><input type="time" value={editForm.lunchEnd} onChange={e => setEditForm({...editForm, lunchEnd: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner border uppercase" /></div>
                 </div>
                 <input placeholder="Official Shop Name" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner border" />
                 <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), editForm); alert("Updated!"); }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Save Operations</button>
              </section>

              {/* LOGISTICS: RESOURCE CAPACITIES (FIXED) */}
              <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 text-left text-left">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 font-black uppercase tracking-widest italic text-left">
                   {myStore?.category === 'salon' ? 'Manage Barbers & Stylists' : 
                    myStore?.category === 'travel' ? 'Manage Vehicles & Capacities' : 
                    myStore?.category === 'clinic' ? 'Manage Doctors' : 
                    'Manage Technicians'}
                 </h3>
                 <div className="flex flex-wrap gap-2 mb-6">
                   {myStore?.staff?.map((n, i) => (<div key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">{n.name} ({n.capacity} Slots/Seats) <button onClick={async () => { const updated = myStore.staff.filter((_, idx) => idx !== i); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: updated }); }}><Lucide.X size={12}/></button></div>))}
                 </div>
                 <div className="flex gap-2"><input placeholder={myStore?.category === 'salon' ? 'Barber Name' : 'Expert Name'} value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} className="flex-1 bg-gray-50 p-3 rounded-lg font-bold text-sm outline-none border shadow-inner" />
                 <input placeholder="Cap" type="number" value={newStaff.capacity} onChange={e => setNewStaff({...newStaff, capacity: Number(e.target.value)})} className="w-16 bg-gray-50 p-3 rounded-lg font-bold text-sm outline-none border shadow-inner" />
                 <button onClick={async () => { if(!newStaff.name) return; const updated = [...(myStore.staff || []), newStaff]; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: updated }); setNewStaff({name:'', capacity:1}); }} className="bg-emerald-600 text-white p-3 rounded-lg active:scale-95 shadow-lg"><Lucide.Plus size={18}/></button></div>
              </section>

              {/* SERVICE PRICE LIST (KM BASED FOR TRAVEL) */}
              <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 text-left">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 font-black uppercase tracking-widest italic text-left text-left">Service/Route Menu</h3>
                 <div className="space-y-3 mb-6 max-h-40 overflow-y-auto pr-1">
                   {myStore?.services?.map((s, i) => (
                      <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl font-bold text-sm border border-gray-100 text-left">
                         <div><p className="uppercase text-left">{s.name}</p><p className="text-gray-400 text-[10px] text-left">₹{s.price} {myStore.category === 'travel' ? `(${s.km} KM)` : `(${s.duration} MIN)`}</p></div>
                         <button onClick={async () => { const updated = myStore.services.filter((_, idx) => idx !== i); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: updated }); }} className="text-rose-400 p-2.5 bg-white rounded-xl shadow-sm hover:text-rose-600 transition-all"><Lucide.Trash2 size={16}/></button>
                      </div>
                   ))}
                 </div>
                 <div className="space-y-3 pt-6 border-t border-gray-100">
                   <input placeholder="Title (e.g. Chiplun-Mumbai)" value={newSvc.name} onChange={e => setNewSvc({...newSvc, name: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-xs outline-none uppercase font-bold border shadow-inner" />
                   <div className="grid grid-cols-2 gap-2 text-left">
                      <input placeholder="Base Price ₹" type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold border shadow-inner" />
                      <input placeholder={myStore.category === 'travel' ? 'Route KM' : 'Duration'} type="number" value={newSvc.km} onChange={e => setNewSvc({...newSvc, km: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold border shadow-inner" />
                   </div>
                   <button onClick={async () => { if(!newSvc.name || !newSvc.price) return; const current = myStore?.services || []; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: [...current, newSvc] }); setNewSvc({name:'', price:'', km:'1'}); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all text-center">Add to Price List</button>
                 </div>
              </section>

              <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !myStore?.isLive })} className={`w-full py-6 rounded-[2.5rem] font-black uppercase shadow-2xl active:scale-95 transition-all ${myStore?.isLive ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-emerald-600 text-white shadow-emerald-100'}`}>
                 {myStore?.isLive ? 'Shut Shop (Go Offline)' : 'Set Business Live (Open Now)'}
              </button>
           </div>
        )}

        {/* VIEW: ACCOUNT (Token Wallet) */}
        {view === 'account' && (
           <div className="pt-4 space-y-6 px-4 pb-10 animate-in slide-in-from-bottom-4 text-left">
              <div className="flex items-center justify-between mb-8">
                 <h2 className="text-3xl font-black uppercase tracking-tighter italic text-emerald-900 leading-none">Wallet</h2>
                 <Lucide.UserCircle size={40} className="text-emerald-600 p-2 bg-emerald-50 rounded-2xl shadow-inner"/>
              </div>
              
              <section className="space-y-4 mb-10 text-left">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 italic font-black">Private Token Wallet (Device Storage)</h3>
                 {myBookings.length > 0 ? (
                   <div className="space-y-3 text-left">
                      {myBookings.map((b, i) => (
                         <div key={i} className="bg-white p-5 rounded-[2rem] border border-gray-100 flex justify-between items-center shadow-sm hover:border-emerald-200 transition-all cursor-pointer text-left" onClick={() => {setTrackInput(b.displayId); setView('track'); handleTrackToken();}}>
                            <div className="text-left"><p className="font-bold text-sm text-gray-800 uppercase tracking-tight text-left">{b.storeName}</p><p className="text-[8px] text-gray-400 uppercase font-black italic">{b.date} • {b.time} • {b.status}</p></div>
                            <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-xl text-[10px] font-black tracking-widest italic shadow-sm text-left">{b.displayId}</span>
                         </div>
                      ))}
                   </div>
                 ) : (
                   <div className="py-12 bg-white rounded-[2.5rem] border border-gray-100 text-center space-y-2 text-left">
                      <Lucide.Wallet size={32} className="mx-auto text-gray-100" />
                      <p className="text-gray-300 font-black uppercase text-[8px] tracking-widest text-center">No reservations found for this device</p>
                   </div>
                 )}
              </section>

              <section className="bg-gray-100 p-6 rounded-[3rem] border border-gray-200 mt-12 text-left">
                 <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center italic font-black uppercase tracking-widest text-left"><Lucide.ShieldCheck size={14} className="mr-2"/> Chiplun Merchant Auth</h3>
                 <div className="space-y-3 text-left">
                    <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-white p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500 shadow-sm text-left" />
                    <input type="password" placeholder="Passcode" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-white p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500 shadow-sm text-left" />
                    <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-xl active:scale-95 transition-all text-xs uppercase tracking-widest text-center">Enter Partner Hub</button>
                 </div>
              </section>
           </div>
        )}

        {/* VIEW: TRACK TOKEN */}
        {view === 'track' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4 pb-20 text-left">
              <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter italic text-left">Track Token</h2>
              <div className="bg-white p-2 rounded-[2.5rem] shadow-sm border border-gray-100 flex gap-2 text-left">
                 <input placeholder="Enter CH-XXXX" value={trackInput} onChange={e => setTrackInput(e.target.value)} className="flex-1 bg-transparent px-5 py-3 outline-none font-black tracking-widest text-sm uppercase text-left" />
                 <button onClick={handleTrackToken} className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all shadow-lg shadow-emerald-50 text-left"><Lucide.Search size={22}/></button>
              </div>
              {searchedBooking ? (
                <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95 relative overflow-hidden text-left shadow-emerald-100 text-left">
                   <div className="absolute top-0 right-0 p-4 opacity-10 text-left"><Lucide.CheckCircle size={80}/></div>
                   <div className="flex justify-between items-start mb-8 relative z-10 text-left">
                      <div className="text-left"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest text-left">Verified Appointment</p><h3 className="text-xl font-black italic uppercase tracking-tight text-left">{searchedBooking.storeName}</h3></div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black tracking-widest text-left">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-4 text-sm font-bold relative z-10 border-t border-white/10 pt-6 text-white text-left">
                      <div className="grid grid-cols-2 gap-4 text-left">
                         <div className="text-left"><p className="opacity-60 text-[8px] uppercase mb-1 tracking-widest font-black italic text-left">Status</p><p className="text-lg uppercase text-left">{searchedBooking.status || 'Pending'}</p></div>
                         <div className="text-left"><p className="opacity-60 text-[8px] uppercase mb-1 tracking-widest font-black italic text-left">Provider</p><p className="text-lg uppercase text-left">{searchedBooking.resourceName || 'Any'}</p></div>
                      </div>
                      <div className="bg-white/10 p-4 rounded-3xl text-left"><p className="opacity-60 text-[8px] uppercase mb-1 italic text-emerald-100 font-black tracking-widest text-left">Timing Details</p><p className="font-black italic text-left">{searchedBooking.date} • {searchedBooking.time}</p></div>
                   </div>
                   <button onClick={() => {setSearchedBooking(null); setTrackInput('');}} className="w-full mt-10 py-3 text-[10px] font-black uppercase bg-white/10 rounded-2xl active:scale-95 transition-all text-center">Clear</button>
                </div>
              ) : (
                <p className="text-center py-20 text-gray-300 text-[10px] font-black uppercase tracking-widest animate-pulse italic font-black leading-relaxed text-left">Nexus Tracking Engine Active</p>
              )}
           </div>
        )}

        {/* VIEW: ADMIN Portal (FIXED List Rendering) */}
        {view === 'admin' && (
           <div className="pt-20 text-center animate-in zoom-in-95 px-4 text-center">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-6 text-center" size={48} />
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 border-emerald-100 outline-none bg-transparent mb-12 tracking-[0.2em] text-center" />
              <button onClick={() => { if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else setAdminPinInput(''); }} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl active:scale-95 uppercase tracking-widest font-black uppercase italic text-center text-center">Unlock Control Console</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-8 pb-32 px-4 text-left flex flex-col h-full text-left">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter">System Engine</h2>
               <button onClick={() => setView('home')} className="bg-gray-100 p-2 rounded-xl text-gray-400 active:scale-90"><Lucide.XCircle size={18}/></button>
            </div>

            <div className="space-y-4 mb-10">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 italic font-black">Verified Directory (Global Registry)</h3>
              <div className="space-y-4 max-h-[35vh] overflow-y-auto pr-1 text-left">
                {stores.map(s => (
                  <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-gray-100 flex items-center gap-4 animate-in fade-in shadow-sm">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 uppercase shadow-inner text-xl">{s.name[0]}</div>
                    <div className="flex-1 font-bold text-sm uppercase text-left">{s.name} <span className="block text-[8px] opacity-40 italic font-black">{s.category} • ID: {s.merchantId}</span></div>
                    <button onClick={() => setDeleteTarget(s)} className="text-rose-400 p-3 active:bg-rose-50 rounded-xl transition-all shadow-sm hover:text-rose-600"><Lucide.Trash2 size={24}/></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 border-t border-gray-100 pt-8">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 italic font-black">Intake Feed</h3>
              <div className="space-y-4">
                 {requests.filter(r => r.status === 'pending').map(req => (
                    <div key={req.id} className="bg-amber-50 p-7 rounded-[3rem] space-y-4 border border-amber-100 shadow-sm animate-in fade-in text-left">
                       <h4 className="font-bold text-sm uppercase italic text-left">{req.bizName}</h4>
                       <div className="flex gap-2 text-left">
                         <input id={`id-${req.id}`} placeholder="Issue ID" className="flex-1 p-3 rounded-xl text-xs font-bold outline-none uppercase border border-amber-200 shadow-inner" />
                         <input id={`pw-${req.id}`} placeholder="Key" className="w-24 p-3 rounded-xl text-xs font-bold outline-none border border-amber-200 shadow-inner" />
                       </div>
                       <button onClick={async () => {
                           const mid = document.getElementById(`id-${req.id}`).value;
                           const pass = document.getElementById(`pw-${req.id}`).value;
                           if(!mid || !pass) return alert("Fill data");
                           // PERSISTENCE REGISTRY FIX: Creating Store with unique Merchant ID key
                           await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', mid.toUpperCase()), { password: pass, uid: req.uid, businessName: req.bizName, storeId: mid.toUpperCase() });
                           await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id), { status: 'approved' });
                           await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', mid.toUpperCase()), { id: mid.toUpperCase(), name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, merchantId: mid.toUpperCase(), isLive: false, services: [], staff: [], image: "", lunchStart: '13:00', lunchEnd: '14:00' });
                           alert("Merchant Authorized!");
                        }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-emerald-100 italic text-center text-center">Approve Business</button>
                    </div>
                 ))}
                 {requests.filter(r => r.status === 'pending').length === 0 && <p className="text-center py-6 text-[9px] text-gray-300 font-black uppercase italic text-center">Inbox Empty</p>}
              </div>
            </div>
          </div>
        )}

        {/* ONBOARDING */}
        {view === 'onboarding' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4 pb-20 text-center">
              <div className="text-center mb-10 text-left">
                 <Lucide.Building2 size={56} className="mx-auto text-emerald-600 mb-2 p-4 bg-emerald-50 rounded-[2.5rem] shadow-inner text-center" />
                 <h2 className="text-3xl font-black uppercase tracking-tighter text-emerald-900 italic text-center leading-none">Apply to join</h2>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2">Verified registration for MH-08</p>
              </div>
              <div className="bg-white p-7 rounded-[3.5rem] shadow-xl space-y-4 border border-gray-100 text-left text-xs font-black uppercase">
                 <input placeholder="Official Shop Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase shadow-inner text-left" />
                 <input placeholder="Location Area" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase shadow-inner text-left" />
                 <select value={regForm.cat} onChange={e => setRegForm({...regForm, cat: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 shadow-inner font-black uppercase italic text-left">
                    <option value="salon">Salon & Wellness</option><option value="travel">Transport Service</option><option value="clinic">Clinic/Doctor</option><option value="repair">Service/Repair</option>
                 </select>
                 <button onClick={async () => {
                    if(!regForm.bizName || !regForm.addr) return alert("All fields required");
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), { uid: user.uid, ...regForm, status: 'pending', timestamp: Date.now() });
                    alert("Application Sent!"); setView('home');
                 }} className="w-full bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest font-black uppercase italic shadow-emerald-50 text-center">Submit Verification</button>
              </div>
           </div>
        )}

        {/* View Selection: Confirmation */}
        {view === 'confirmation' && (
           <div className="text-center pt-10 animate-in zoom-in-90 duration-700 pb-10 px-4 text-center">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce border-2 border-emerald-200 shadow-xl shadow-emerald-50 text-center"><Lucide.CheckCircle2 size={48}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-6 uppercase tracking-tighter italic text-center">Reserved</h2>
             <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl space-y-6 relative overflow-hidden text-center shadow-emerald-200 text-white">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Lucide.Clock size={100}/></div>
                <div className="text-left"><p className="text-[10px] font-black uppercase opacity-60 mb-2 italic tracking-widest text-left text-center">Booking Token</p><h3 className="text-5xl font-black tracking-widest italic text-center leading-none">{lastBookingId}</h3></div>
                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 font-black uppercase">
                   <div className="text-center border-r border-white/10"><p className="text-[8px] opacity-60 font-black tracking-widest text-center">Price</p><p className="text-2xl font-black text-center">₹{myBookings[myBookings.length-1]?.totalPrice}</p></div>
                   <div className="text-center"><p className="text-[8px] opacity-60 font-black tracking-widest text-center">Method</p><p className="text-xl font-black text-center uppercase">Cash</p></div>
                </div>
             </div>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 uppercase tracking-widest mt-12 font-black italic text-center">Return Home</button>
           </div>
        )}

      </main>

      {/* NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-3xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-[100] rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase tracking-widest italic text-center">Explore</span></button>
        <button onClick={() => setView(isSessionVerified ? 'merchant_dashboard' : 'onboarding')} className={`flex flex-col items-center gap-1.5 transition-all ${['onboarding', 'merchant_dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Building2 size={22} /><span className="text-[9px] font-black uppercase tracking-widest italic text-center">Business</span></button>
        <button onClick={() => { setView('track'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'track' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase tracking-widest italic text-center">Track</span></button>
        <button onClick={() => setView('account')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'account' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.UserCircle size={22} /><span className="text-[9px] font-black uppercase tracking-widest italic font-black text-center">Account</span></button>
      </nav>

    </div>
  );
}
