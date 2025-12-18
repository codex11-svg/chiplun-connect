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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "chiplun-pro-v7"; 
const ADMIN_PIN = "112607"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data State
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]); 
  const [requests, setRequests] = useState([]);
  const [myBookings, setMyBookings] = useState([]);

  // Complex Booking Meta
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [bookingMeta, setBookingMeta] = useState({ 
    date: '', time: '', resourceName: '', custName: '', custPhone: '', 
    paymentMethod: 'cash', 
    // Travel specific
    source: '', destination: '', tripType: 'One-Way', vehicleType: 'AC Sedan',
    // Clinic specific
    consultType: 'New Consultation', age: '',
    // Repair specific
    brandModel: '', urgency: 'Standard'
  });

  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);
  const [lastBookingId, setLastBookingId] = useState('');

  // Admin/Vendor
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '', cat: 'salon' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '', duration: '30 min', cat: 'General' });
  const [newStaff, setNewStaff] = useState('');
  const [editStoreForm, setEditStoreForm] = useState({ name: '', address: '', image: '', category: 'salon' });

  // --- Auth & Data Listeners ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), (snap) => {
      if (snap.exists()) setProfile(snap.data());
      else setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { role: 'customer', status: 'none', uid: user.uid });
      setLoading(false);
    });
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (snap) => setStores(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (snap) => setAllBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), (snap) => setMyBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  // Sync edit form
  useEffect(() => {
    if (view === 'dashboard' && profile.businessId) {
      const s = stores.find(st => st.ownerId === profile.businessId);
      if (s) setEditStoreForm({ name: s.name, address: s.address, image: s.image || '', category: s.category || 'salon' });
    }
  }, [view, stores, profile.businessId]);

  // --- Helpers ---
  const finalizeBooking = async () => {
    setIsProcessing(true);
    const shortId = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    setTimeout(async () => {
      const total = cart.reduce((a, b) => a + Number(b.price), 0);
      const payload = { 
        ...bookingMeta, displayId: shortId, services: cart, totalPrice: total, 
        storeId: selectedStore.id, storeName: selectedStore.name, timestamp: serverTimestamp() 
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setLastBookingId(shortId);
      setIsProcessing(false);
      setView('confirmation');
    }, 2500);
  };

  const handlePaymentClick = (method) => {
    if (method === 'upi' || method === 'debit') {
      alert("⚠️ Digital Payment Gateway is under maintenance in Chiplun. Please select 'Pay at Store' to confirm your booking.");
    } else {
      setBookingMeta({...bookingMeta, paymentMethod: 'cash'});
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black text-xl animate-pulse">CHIPLUN CONNECT PRO</div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer">
            <h1 className="text-2xl font-black tracking-tighter italic">ChiplunConnect</h1>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-80">Local Business Engine V7</p>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 active:scale-90 transition-all">
            <Lucide.ShieldCheck size={20}/>
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-2">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Find stores, taxis, doctors..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 overflow-y-auto z-10">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-8 pt-2">
             <div className="grid grid-cols-4 gap-4">
               {[
                 {id:'salon', n:'Salon', i:<Lucide.Scissors/>, c:'bg-rose-50 text-rose-500'},
                 {id:'travel', n:'Travel', i:<Lucide.Bus/>, c:'bg-blue-50 text-blue-500'},
                 {id:'clinic', n:'Clinic', i:<Lucide.Stethoscope/>, c:'bg-emerald-50 text-emerald-500'},
                 {id:'repair', n:'Repair', i:<Lucide.Settings/>, c:'bg-amber-50 text-amber-500'}
               ].map(cat => (
                 <button key={cat.id} className="flex flex-col items-center gap-2 group active:scale-90 transition-transform">
                   <div className={`${cat.c} p-4 rounded-2xl shadow-sm border border-black/5`}>{cat.i}</div>
                   <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">{cat.n}</span>
                 </button>
               ))}
             </div>

             <section>
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Verified Partners • Chiplun</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 hover:border-emerald-200 active:scale-[0.98] transition-all">
                     <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover" />
                     <div className="flex-1">
                       <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${store.category === 'salon' ? 'bg-rose-100 text-rose-600' : store.category === 'travel' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {store.category}
                          </span>
                       </div>
                       <h3 className="font-bold text-gray-800 text-sm leading-tight">{store.name}</h3>
                       <p className="text-[10px] text-gray-400 font-medium mt-0.5">{store.address}</p>
                     </div>
                     <Lucide.ChevronRight size={18} className="text-gray-200 mr-2" />
                   </div>
                 ))}
               </div>
             </section>
          </div>
        )}

        {/* VIEW: STORE DETAIL (Deep Features) */}
        {view === 'store_detail' && selectedStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 pb-10">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             
             <div className="relative">
                <img src={selectedStore.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-full h-56 rounded-[3rem] object-cover shadow-2xl" />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase text-emerald-600 flex items-center gap-1 shadow-lg">
                   <Lucide.Star size={10} className="fill-emerald-600"/> 4.9 Verified
                </div>
             </div>
             
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100">
               <h2 className="text-2xl font-black italic">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>

               {/* CATEGORY SPECIFIC INPUTS */}
               <div className="grid grid-cols-1 gap-4 mb-8">
                  {selectedStore.category === 'travel' && (
                    <div className="space-y-3 p-5 bg-blue-50 rounded-[2.5rem] border border-blue-100 animate-in slide-in-from-top-2">
                       <p className="text-[9px] font-black text-blue-600 uppercase">Trip Details</p>
                       <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Source (Chiplun)" onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})} className="bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-blue-200" />
                          <input placeholder="Destination" onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-blue-200" />
                       </div>
                       <div className="flex gap-2">
                          <select onChange={e => setBookingMeta({...bookingMeta, tripType: e.target.value})} className="flex-1 bg-white p-3 rounded-2xl text-xs font-bold border border-blue-200"><option>One-Way</option><option>Round-Trip</option></select>
                          <select onChange={e => setBookingMeta({...bookingMeta, vehicleType: e.target.value})} className="flex-1 bg-white p-3 rounded-2xl text-xs font-bold border border-blue-200"><option>AC Sedan</option><option>SUV</option><option>Mini Bus</option></select>
                       </div>
                    </div>
                  )}

                  {selectedStore.category === 'clinic' && (
                    <div className="space-y-3 p-5 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
                       <p className="text-[9px] font-black text-emerald-600 uppercase">Patient Information</p>
                       <div className="flex gap-2">
                          <select onChange={e => setBookingMeta({...bookingMeta, consultType: e.target.value})} className="flex-1 bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-emerald-200"><option>New Consultation</option><option>Follow-up</option><option>Emergency</option></select>
                          <input placeholder="Patient Age" type="number" onChange={e => setBookingMeta({...bookingMeta, age: e.target.value})} className="w-24 bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-emerald-200" />
                       </div>
                    </div>
                  )}

                  {selectedStore.category === 'repair' && (
                    <div className="space-y-3 p-5 bg-amber-50 rounded-[2.5rem] border border-amber-100">
                       <p className="text-[9px] font-black text-amber-600 uppercase">Device Specification</p>
                       <input placeholder="Brand & Model (e.g. Samsung AC)" onChange={e => setBookingMeta({...bookingMeta, brandModel: e.target.value})} className="w-full bg-white p-3 rounded-2xl text-xs font-bold outline-none border border-amber-200" />
                       <select onChange={e => setBookingMeta({...bookingMeta, urgency: e.target.value})} className="w-full bg-white p-3 rounded-2xl text-xs font-bold border border-amber-200"><option>Standard Service</option><option>Urgent Repair</option></select>
                    </div>
                  )}
               </div>

               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Select Services</h3>
               <div className="space-y-3">
                 {selectedStore.services?.map((s, i) => (
                   <div 
                    key={i} 
                    onClick={() => {
                      if(cart.find(c => c.name === s.name)) setCart(cart.filter(c => c.name !== s.name));
                      else setCart([...cart, s]);
                    }}
                    className={`p-5 rounded-3xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50' : 'border-gray-50 bg-gray-50'}`}
                   >
                     <div className="flex items-center gap-3">
                       {cart.find(c => c.name === s.name) ? <Lucide.CheckCircle2 className="text-emerald-600" size={20}/> : <Lucide.Circle className="text-gray-200" size={20}/>} 
                       <div>
                          <p className="font-bold text-sm leading-none">{s.name}</p>
                          <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold">{s.duration || 'Flexible'}</p>
                       </div>
                     </div>
                     <span className="font-black text-emerald-600 tracking-tighter">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>

             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 text-center">Finalizing Details</h3>
                 
                 <div className="space-y-4 mb-8">
                   <div className="space-y-1.5">
                     <p className="text-[9px] font-black text-gray-400 ml-1 uppercase">
                        {selectedStore.category === 'travel' ? 'Driver/Vehicle' : selectedStore.category === 'clinic' ? 'Doctor' : 'Assigned Expert'}
                     </p>
                     <select onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm border-2 border-transparent focus:border-emerald-500 appearance-none text-center">
                       <option value="">Auto-Assign (Quickest)</option>
                       {selectedStore.staff?.map((st, i) => <option key={i} value={st}>{st}</option>)}
                     </select>
                   </div>
                   
                   <div className="flex gap-2">
                      <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                      <select onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-32 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500">
                         <option>10:00 AM</option><option>12:00 PM</option><option>02:00 PM</option><option>04:00 PM</option><option>06:00 PM</option><option>08:00 PM</option>
                      </select>
                   </div>
                 </div>

                 <div className="space-y-4 pt-6 border-t border-gray-100">
                    <input placeholder="Full Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                    <input placeholder="Mobile Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                 </div>
                 <button disabled={!bookingMeta.date || !bookingMeta.custName} onClick={() => setView('secure_payment')} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black mt-10 shadow-xl active:scale-95 transition-all uppercase tracking-widest">Select Payment Method</button>
               </div>
             )}
           </div>
        )}

        {/* VIEW: SECURE PAYMENT GATEWAY (New Logic) */}
        {view === 'secure_payment' && (
           <div className="pt-4 space-y-6 animate-in zoom-in-95">
              <div className="text-center mb-6">
                 <Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={40} />
                 <h2 className="text-2xl font-black uppercase tracking-tighter">Secure Checkout</h2>
                 <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Trial Billing Mode Activated</p>
              </div>

              <div className="bg-white p-8 rounded-[3.5rem] shadow-xl space-y-8 border border-gray-100">
                 <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                    <div><h4 className="text-[10px] font-black text-gray-400 uppercase">Recipient</h4><p className="font-bold text-lg">{selectedStore?.name}</p></div>
                    <p className="text-3xl font-black text-emerald-600">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</p>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Digital Channels</p>
                    <div className="grid grid-cols-2 gap-3">
                       <button onClick={() => handlePaymentClick('upi')} className="flex flex-col items-center gap-2 p-5 rounded-[2rem] border-2 border-gray-50 bg-gray-50/50 opacity-60">
                          <Lucide.Smartphone size={24} className="text-gray-400"/>
                          <span className="text-[10px] font-black uppercase">UPI / GPay</span>
                       </button>
                       <button onClick={() => handlePaymentClick('debit')} className="flex flex-col items-center gap-2 p-5 rounded-[2rem] border-2 border-gray-50 bg-gray-50/50 opacity-60">
                          <Lucide.CreditCard size={24} className="text-gray-400"/>
                          <span className="text-[10px] font-black uppercase">Card Pay</span>
                       </button>
                    </div>

                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center mt-6">Local Access</p>
                    <button 
                       onClick={() => { setBookingMeta({...bookingMeta, paymentMethod: 'Pay at Store'}); finalizeBooking(); }}
                       className="w-full p-5 rounded-[2rem] border-2 border-emerald-600 bg-emerald-50 flex items-center justify-between px-8 transition-all active:scale-95"
                    >
                       <div className="flex items-center gap-3">
                          <Lucide.Wallet className="text-emerald-600" size={24}/>
                          <span className="text-sm font-black uppercase text-emerald-900">Pay at Store</span>
                       </div>
                       <Lucide.CheckCircle2 className="text-emerald-600" size={20}/>
                    </button>
                 </div>

                 <div className="bg-gray-50 p-4 rounded-3xl flex items-center gap-3 border border-gray-100">
                    <Lucide.ShieldCheck className="text-emerald-600 flex-shrink-0" size={18}/>
                    <p className="text-[8px] font-bold text-gray-400 leading-tight uppercase">Every booking is protected by the ChiplunConnect 100% Reliability Guarantee.</p>
                 </div>
              </div>
           </div>
        )}

        {/* VIEW: CONFIRMATION (ID Generation) */}
        {view === 'confirmation' && (
           <div className="text-center pt-24 animate-in zoom-in-90 duration-700">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner animate-bounce"><Lucide.CheckCircle2 size={56}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-1 tracking-tighter uppercase font-black">Success!</h2>
             
             <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border-2 border-emerald-50 mx-4 mb-10 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-600 opacity-20"></div>
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Unique Booking Token</p>
                <h3 className="text-5xl font-black text-emerald-600 tracking-tighter mb-4">{lastBookingId}</h3>
                <p className="text-[8px] font-bold text-emerald-900 uppercase bg-emerald-100 px-4 py-1.5 rounded-full inline-block">ID SECURED MH-08</p>
             </div>

             <p className="text-gray-400 mb-14 italic px-12 leading-relaxed font-bold uppercase text-[10px] tracking-widest opacity-60">"Screenshot this ID. Present it at the store to claim your slot."</p>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 uppercase">Finish</button>
           </div>
        )}

        {/* VIEW: BOOKING SEARCH */}
        {view === 'bookings' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black text-emerald-900 tracking-tighter uppercase">Token Tracker</h2>
              <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-gray-100 flex gap-2">
                 <input placeholder="Enter Token (CH-XXXX)" value={bookingSearchQuery} onChange={e => setBookingSearchQuery(e.target.value)} className="flex-1 bg-transparent px-4 py-3 outline-none font-bold text-sm uppercase" />
                 <button onClick={() => {
                    const found = allBookings.find(b => b.displayId === bookingSearchQuery.toUpperCase());
                    if(found) setSearchedBooking(found); else alert("Invalid Token");
                 }} className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all"><Lucide.Search size={20}/></button>
              </div>

              {searchedBooking && (
                <div className="bg-emerald-600 text-white p-7 rounded-[3rem] shadow-2xl animate-in zoom-in-95">
                   <div className="flex justify-between items-start mb-6">
                      <div><p className="text-[10px] font-black uppercase opacity-60">Confirmed Merchant</p><h3 className="text-xl font-black italic">{searchedBooking.storeName}</h3></div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black uppercase">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-xs font-bold border-b border-white/10 pb-4">
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Appointment</p>{searchedBooking.date} • {searchedBooking.time}</div>
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Customer</p>{searchedBooking.custName}</div>
                      </div>
                      {searchedBooking.source && (
                        <div className="text-xs font-bold bg-white/10 p-3 rounded-2xl">
                           <p className="opacity-60 text-[8px] uppercase mb-1">Route Info</p>
                           {searchedBooking.source} <Lucide.ArrowRight size={10} className="inline mx-1"/> {searchedBooking.destination}
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm font-black">
                         <span className="opacity-60 uppercase text-[10px]">Payment: {searchedBooking.paymentMethod}</span>
                         <span className="text-emerald-200">₹{searchedBooking.totalPrice}</span>
                      </div>
                   </div>
                   <button onClick={() => setSearchedBooking(null)} className="w-full mt-8 py-3 text-[10px] font-black uppercase bg-white/10 rounded-2xl">Clear</button>
                </div>
              )}
           </div>
        )}

        {/* ... Rest of functionality (Admin, Dashboard) follows similar V6 logic ... */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={48} />
              <h2 className="text-3xl font-black mb-10 tracking-tighter uppercase">Admin Core</h2>
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 outline-none py-4 text-emerald-600 border-gray-100 bg-transparent mb-12 tracking-[0.2em]" />
              <button onClick={() => {if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("ACCESS DENIED"); setAdminPinInput(''); }}} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl active:scale-95 transition-all">Unlock System</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-6">
            <h2 className="text-2xl font-black text-emerald-900 uppercase">Management</h2>
            {stores.map(s => (
              <div key={s.id} className="bg-white p-4 rounded-3xl border border-gray-100 flex items-center gap-4">
                 <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center font-bold text-emerald-600 uppercase">{s.name[0]}</div>
                 <div className="flex-1 font-bold text-sm">{s.name} <span className="block text-[8px] text-gray-400 uppercase">{s.category}</span></div>
                 <button onClick={async () => { if(window.confirm("Delete " + s.name + "?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="text-rose-500 p-2"><Lucide.Trash2 size={18}/></button>
              </div>
            ))}
            {requests.filter(r => r.status === 'pending').map(req => (
                <div key={req.id} className="bg-amber-50 p-6 rounded-3xl space-y-4 border border-amber-100">
                  <h4 className="font-bold">{req.bizName} ({req.cat})</h4>
                  <div className="flex gap-2">
                    <input id={`id-${req.id}`} placeholder="Issue ID" className="flex-1 p-2 rounded-xl text-xs outline-none" />
                    <input id={`pw-${req.id}`} placeholder="Password" className="flex-1 p-2 rounded-xl text-xs outline-none" />
                  </div>
                  <button onClick={async () => {
                      const uid = document.getElementById(`id-${req.id}`).value;
                      const pass = document.getElementById(`pw-${req.id}`).value;
                      if(!uid || !pass) return;
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', uid), { password: pass, uid: req.uid, businessName: req.bizName });
                      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.uid), { status: 'approved' });
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, isLive: false, services: [], staff: [], image: "" });
                    }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs">Authorize</button>
                </div>
              ))}
          </div>
        )}

        {(view === 'vendor_portal' || view === 'vendor_login') && (
           <div className="pt-4 space-y-6">
              <div className="text-center mb-8"><h2 className="text-3xl font-black uppercase tracking-tight italic">Merchant Hub</h2></div>
              <div className="bg-white p-7 rounded-[3rem] shadow-sm space-y-4 border border-gray-50">
                 <div className="flex bg-gray-100 p-1 rounded-2xl">
                    <button onClick={() => setView('vendor_login')} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase ${view==='vendor_login' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>Entrance</button>
                    <button onClick={() => setView('vendor_portal')} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase ${view==='vendor_portal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>Application</button>
                 </div>
                 {view === 'vendor_login' ? (
                   <>
                    <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                    <input type="password" placeholder="Access Key" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                    <button onClick={async () => {
                       const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id));
                       if (snap.exists() && snap.data().password === vendorLogin.pass) {
                          await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
                             role: 'vendor', status: 'approved', businessId: snap.data().uid, businessName: snap.data().businessName
                          });
                          setView('dashboard');
                       } else alert("Invalid Credentials");
                    }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase">Verify & Enter</button>
                   </>
                 ) : (
                   <>
                    <input placeholder="Shop Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                    <input placeholder="Exact Location" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                    <select value={regForm.cat} onChange={e => setRegForm({...regForm, cat: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none">
                       <option value="salon">Salon & Wellness</option>
                       <option value="travel">Travel & Taxis</option>
                       <option value="clinic">Medical Clinic</option>
                       <option value="repair">Maintenance/Other</option>
                    </select>
                    <button onClick={async () => { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), { uid: user.uid, ...regForm, status: 'pending' }); alert("Submitted!"); }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg uppercase">Apply Now</button>
                   </>
                 )}
              </div>
           </div>
        )}

        {view === 'dashboard' && profile.role === 'vendor' && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-8">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900 uppercase italic">{profile.businessName}</h2><button onClick={() => setView('home')} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 active:scale-90 transition-all"><Lucide.XCircle size={18}/></button></div>

            {/* Profile Mod */}
            <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 space-y-5">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center"><Lucide.Settings size={14} className="mr-2 text-emerald-600"/> Setup Shop</h3>
               <select value={editStoreForm.category} onChange={e => setEditStoreForm({...editStoreForm, category: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500"><option value="salon">Salon</option><option value="travel">Travel</option><option value="clinic">Clinic</option><option value="repair">Repair</option></select>
               <input placeholder="Business Name" value={editStoreForm.name} onChange={e => setEditStoreForm({...editStoreForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
               <input placeholder="Cover Image URL" value={editStoreForm.image} onChange={e => setEditStoreForm({...editStoreForm, image: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
               <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), editStoreForm); alert("Profile Synced!"); }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg">Save Profile</button>
            </section>

            {/* Resources Management */}
            <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">
                  {editStoreForm.category === 'travel' ? 'Manage Vehicles' : editStoreForm.category === 'clinic' ? 'Consultants' : 'Staff Members'}
               </h3>
               <div className="flex flex-wrap gap-2 mb-4">
                 {stores.find(s => s.ownerId === profile.businessId)?.staff?.map((n, i) => (<div key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">{n} <button onClick={() => { const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: s.staff.filter((_, idx) => idx !== i) }); }}><Lucide.XCircle size={12}/></button></div>))}
               </div>
               <div className="flex gap-2"><input placeholder="Name/Model" value={newStaff} onChange={e => setNewStaff(e.target.value)} className="flex-1 bg-gray-50 p-3 rounded-lg font-bold text-sm outline-none" /><button onClick={() => { if(!newStaff) return; const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: [...(s.staff || []), newStaff] }); setNewStaff(''); }} className="bg-emerald-600 text-white p-3 rounded-lg shadow-lg"><Lucide.Plus size={18}/></button></div>
            </section>

            <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Service Menu</h3>
               <div className="space-y-3 mb-8">
                 {stores.find(s => s.ownerId === profile.businessId)?.services?.map((s, i) => (<div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl font-bold text-sm"><div><p>{s.name}</p><p className="text-emerald-600 text-[10px]">₹{s.price} • {s.duration}</p></div><button onClick={() => { const s_ = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: s_.services.filter((_, idx) => idx !== i) }); }} className="text-rose-400 p-2.5 bg-white rounded-xl shadow-sm border border-gray-100"><Lucide.Trash2 size={16}/></button></div>))}
               </div>
               <div className="space-y-3 pt-4 border-t border-gray-50">
                  <input placeholder="Service Title" value={newSvc.name} onChange={e => setNewSvc({...newSvc, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm" />
                  <div className="flex gap-2">
                    <input placeholder="₹ Price" type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price: e.target.value})} className="flex-1 bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm" />
                    <input placeholder="30 min" value={newSvc.duration} onChange={e => setNewSvc({...newSvc, duration: e.target.value})} className="w-28 bg-gray-50 p-4 rounded-xl outline-none font-bold text-sm" />
                  </div>
                  <button onClick={() => { if(!newSvc.name || !newSvc.price) return; const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: [...(s.services || []), newSvc] }); setNewSvc({name:'', price:'', duration:'30 min', cat:'General'}); }} className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-black shadow-xl uppercase">Publish Service</button>
               </div>
            </section>
            
            <button onClick={() => { const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !s.isLive }); }} className={`w-full py-5 rounded-[2.5rem] font-black uppercase shadow-2xl transition-all active:scale-95 ${stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
               {stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'Stop Selling (Offline)' : 'Publish Store (Live)'}
            </button>
          </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase">Explore</span></button>
        <button onClick={() => setView(profile.role === 'vendor' ? 'dashboard' : 'vendor_login')} className={`flex flex-col items-center gap-1.5 transition-all ${['vendor_portal', 'vendor_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-black uppercase">Business</span></button>
        <button onClick={() => { setView('bookings'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Track Token</span></button>
        <button className="flex flex-col items-center gap-1.5 text-gray-300 active:scale-90 transition-transform"><Lucide.User size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Profile</span></button>
      </nav>

    </div>
  );
}

