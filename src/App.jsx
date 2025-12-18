import React, { useState, useEffect, useMemo } from 'react';
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
const appId = "chiplun-pro-v13"; 
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
  const [myBookings, setMyBookings] = useState([]);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Selections
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    paymentMethod: 'Cash at Store'
  });

  // Unique Logic
  const [queueDisplay, setQueueDisplay] = useState({ pos: 0, delay: 0 });
  const [lastBookingId, setLastBookingId] = useState('');
  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);

  // Merchant Forms
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '', cat: 'salon' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '', duration: '30', category: 'General' });
  const [newStaff, setNewStaff] = useState('');
  const [editForm, setEditForm] = useState({ name: '', address: '', image: '', category: 'salon' });

  // --- 1. Real-time Engine ---
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

  const myStore = useMemo(() => stores.find(s => s.ownerId === profile.businessId), [stores, profile.businessId]);

  useEffect(() => {
    if (isSessionVerified && myStore) {
      setEditForm({ name: myStore.name, address: myStore.address, image: myStore.image || '', category: myStore.category || 'salon' });
    }
  }, [isSessionVerified, myStore]);

  // --- 2. Availability Logic ---
  const getBusyStaff = (date, time) => {
    if (!selectedStore) return [];
    return allBookings
      .filter(b => b.storeId === selectedStore.id && b.date === date && b.time === time)
      .map(b => b.resourceName);
  };

  // --- 3. Action Handlers ---
  const handleFinalConfirm = async () => {
    if (isProcessing) return; // Anti-lag guard
    setIsProcessing(true);
    setShowConfirmModal(false);

    const shortId = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const ahead = allBookings.filter(b => b.storeId === selectedStore.id && b.date === bookingMeta.date && b.time === bookingMeta.time).length;
    const total = cart.reduce((a, b) => a + Number(b.price), 0);

    const payload = { 
      ...bookingMeta, displayId: shortId, services: cart, totalPrice: total, 
      queuePos: ahead + 1, estWait: ahead * 30,
      storeId: selectedStore.id, storeName: selectedStore.name, timestamp: serverTimestamp() 
    };

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setLastBookingId(shortId);
      setQueueDisplay({ pos: ahead + 1, delay: ahead * 30 });
      setView('confirmation');
    } catch (e) {
      alert("Booking failed. Please check network.");
    }
    setIsProcessing(false);
  };

  const handleFullStoreDeletion = async () => {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const mId = deleteTarget.merchantId;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', deleteTarget.id));
    if (mId) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', mId.toUpperCase()));
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', deleteTarget.id));
    setDeleteTarget(null);
    setIsProcessing(false);
  };

  const handleVendorLogin = async () => {
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

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse">CHIPLUN CONNECT PRO</div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {/* DOUBLE-BOOKING PROTECTION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-6 animate-in zoom-in-95">
           <div className="bg-white w-full rounded-[3rem] p-8 shadow-2xl">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Lucide.CheckCircle size={32}/>
              </div>
              <h3 className="text-xl font-black text-center mb-2">Final Confirmation</h3>
              <div className="bg-gray-50 p-4 rounded-2xl space-y-2 mb-6">
                 <div className="flex justify-between text-xs font-bold"><span>Expert:</span><span>{bookingMeta.resourceName || 'Any Specialist'}</span></div>
                 <div className="flex justify-between text-xs font-bold"><span>Total:</span><span className="text-emerald-600">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</span></div>
              </div>
              <button 
                disabled={isProcessing}
                onClick={handleFinalConfirm} 
                className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Confirm Appointment'}
              </button>
              <button onClick={() => setShowConfirmModal(false)} className="w-full py-4 text-gray-400 font-bold text-[10px] uppercase">Cancel</button>
           </div>
        </div>
      )}

      {/* ADMIN DELETE MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-6">
           <div className="bg-white w-full rounded-[3rem] p-8 shadow-2xl border-2 border-rose-100">
              <Lucide.Trash2 size={40} className="text-rose-500 mx-auto mb-4" />
              <h3 className="text-xl font-black text-center">Confirm Destruction?</h3>
              <p className="text-center text-gray-400 text-xs mt-3">This will erase <span className="font-bold text-gray-900">{deleteTarget.name}</span>, their Login ID, and all data forever.</p>
              <div className="flex flex-col gap-3 mt-8">
                 <button onClick={handleFullStoreDeletion} className="w-full bg-rose-500 text-white py-4 rounded-2xl font-black uppercase text-xs">Destroy Everything</button>
                 <button onClick={() => setDeleteTarget(null)} className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black uppercase text-xs">Back Safe</button>
              </div>
           </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic">ChiplunConnect</h1>
            <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Enterprise Pro • MH-08</p>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 active:bg-white/30 transition-all">
            <Lucide.ShieldCheck size={20}/>
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-2">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search Chiplun services..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none" />
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
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Verified Marketplace</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 hover:border-emerald-200 active:scale-[0.98] transition-all group">
                     <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover bg-gray-50 shadow-sm" />
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

        {/* VIEW: STORE DETAIL (With Busy Resource Locking) */}
        {view === 'store_detail' && selectedStore && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 pb-10">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             <img src={selectedStore.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-full h-52 rounded-[3rem] object-cover shadow-2xl" />
             
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100">
               <h2 className="text-2xl font-black italic text-emerald-900 uppercase tracking-tighter">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center font-medium"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore.address}</p>
               
               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 font-black">Choose Services</h3>
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
                 <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 text-center tracking-widest">Appointment Specs</h3>
                 <div className="space-y-4">
                   <div className="flex gap-2">
                      <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="flex-1 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                      <select onChange={e => setBookingMeta({...bookingMeta, time: e.target.value})} className="w-32 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner">
                         <option value="">Time</option>
                         {['10:00 AM','11:00 AM','12:00 PM','01:00 PM','04:00 PM','05:00 PM','06:00 PM','07:00 PM'].map(t => <option key={t}>{t}</option>)}
                      </select>
                   </div>

                   {/* SMART RESOURCE LOCKER */}
                   <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-gray-400 uppercase ml-1">Select Professional</p>
                      <select 
                        disabled={!bookingMeta.date || !bookingMeta.time}
                        onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} 
                        className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm shadow-inner disabled:opacity-50"
                      >
                        <option value="">Any Free Staff</option>
                        {selectedStore.staff?.map((st, i) => {
                          const isBusy = getBusyStaff(bookingMeta.date, bookingMeta.time).includes(st);
                          return <option key={i} value={st} disabled={isBusy}>{st} {isBusy ? '(BUSY)' : ''}</option>
                        })}
                      </select>
                   </div>

                   <input placeholder="WhatsApp Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border border-gray-100 shadow-inner" />
                   
                   <button 
                     disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custPhone}
                     onClick={() => setShowConfirmModal(true)} 
                     className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest disabled:opacity-50"
                   >
                     Confirm Slot Availability
                   </button>
                 </div>
              </div>
            )}
           </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD (Fixed Image System) */}
        {view === 'dashboard' && isSessionVerified && profile.role === 'vendor' && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-8 pb-10">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900 uppercase italic">{profile.businessName}</h2><button onClick={() => { setIsSessionVerified(false); setView('home'); }} className="bg-rose-50 px-4 py-2 rounded-xl text-rose-500 font-black text-[8px] uppercase tracking-widest">Logout Session</button></div>

            {/* Profile Modification Section */}
            <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 space-y-6 animate-in fade-in">
               <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center"><Lucide.Image size={14} className="mr-2 text-emerald-600"/> Branding & Details</h3>
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 uppercase shadow-inner">
                    {editForm.name[0]}
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-gray-400 uppercase ml-1">Store Front Image (URL)</p>
                    <input placeholder="Paste Image Link Here" value={editForm.image} onChange={e => setEditForm({...editForm, image: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner" />
                  </div>

                  {/* PREVIEW BOX */}
                  {editForm.image && (
                    <div className="w-full h-32 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 shadow-inner">
                       <img src={editForm.image} className="w-full h-full object-cover opacity-80" alt="Preview" onError={(e) => e.target.style.display = 'none'} />
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-gray-400 uppercase ml-1">Official Name</p>
                    <input placeholder="Store Name" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none shadow-inner" />
                  </div>

                  <button 
                    onClick={async () => {
                      setIsProcessing(true);
                      const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId);
                      await updateDoc(storeRef, editForm);
                      alert("Profile Branding Updated!");
                      setIsProcessing(false);
                    }} 
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-lg shadow-emerald-50"
                  >
                    {isProcessing ? 'Updating...' : 'Sync Branding Changes'}
                  </button>
               </div>
            </section>

            {/* SERVICES FIX */}
            <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Service Catalog</h3>
               <div className="space-y-3 mb-6">
                 {myStore?.services?.map((s, i) => (<div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl font-bold text-sm border border-gray-100"><div><p className="text-[8px] uppercase text-emerald-600 font-black">{s.category}</p><p className="uppercase">{s.name}</p><p className="text-gray-400 text-[10px]">₹{s.price} • {s.duration} min</p></div><button onClick={() => { updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: myStore.services.filter((_, idx) => idx !== i) }); }} className="text-rose-400 p-2.5 bg-white rounded-xl shadow-sm"><Lucide.Trash2 size={16}/></button></div>))}
               </div>
               <div className="space-y-3 pt-6 border-t border-gray-100">
                  <input placeholder="Service Name" value={newSvc.name} onChange={e => setNewSvc({...newSvc, name: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-xs outline-none uppercase font-bold" />
                  <div className="grid grid-cols-2 gap-2">
                     <input placeholder="Price ₹" type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs outline-none font-bold" />
                     <input placeholder="Mins" type="number" value={newSvc.duration} onChange={e => setNewSvc({...newSvc, duration: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs outline-none font-bold" />
                  </div>
                  <input placeholder="Tag (e.g. Premium, Basic)" value={newSvc.category} onChange={e => setNewSvc({...newSvc, category: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-xs outline-none font-bold uppercase" />
                  <button onClick={async () => {
                     if(!newSvc.name || !newSvc.price) return;
                     const current = myStore?.services || [];
                     await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: [...current, newSvc] });
                     setNewSvc({name:'', price:'', duration:'30', category:'General'});
                  }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px]">Save Service</button>
               </div>
            </section>

            <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !myStore?.isLive })} className={`w-full py-5 rounded-[2.5rem] font-black uppercase shadow-2xl ${myStore?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
               {myStore?.isLive ? 'Stop Selling (Private)' : 'Publish Store (Public)'}
            </button>
          </div>
        )}

        {/* ... Admin Core & Track kept from Enterprise build ... */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-6" size={48} />
              <h2 className="text-3xl font-black mb-10 tracking-tighter text-emerald-900 uppercase">Admin Hub</h2>
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 border-emerald-100 outline-none bg-transparent mb-12 tracking-[0.2em]" />
              <button onClick={() => { if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("ACCESS DENIED"); setAdminPinInput(''); } }} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl active:scale-95 uppercase">Unlock System</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-6 pb-20">
            <h2 className="text-2xl font-black text-emerald-900 uppercase italic px-2">Merchant Control</h2>
            <div className="space-y-4 px-2">
              {stores.map(s => (
                <div key={s.id} className="bg-white p-5 rounded-[2.5rem] border border-gray-100 flex items-center gap-4 animate-in fade-in">
                   <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 uppercase shadow-inner text-xl">{s.name[0]}</div>
                   <div className="flex-1 font-bold text-sm uppercase">{s.name} <span className="block text-[8px] opacity-40 font-black italic">{s.category} • {s.merchantId}</span></div>
                   <button onClick={() => setDeleteTarget(s)} className="text-rose-500 p-3 active:bg-rose-50 rounded-xl transition-all shadow-sm"><Lucide.Trash2 size={24}/></button>
                </div>
              ))}
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mt-10">Application Requests</h3>
              {requests.filter(r => r.status === 'pending').map(req => (
                  <div key={req.id} className="bg-amber-50 p-7 rounded-[3rem] space-y-4 border border-amber-100 shadow-sm animate-in fade-in">
                    <h4 className="font-bold text-sm uppercase italic">{req.bizName} ({req.cat})</h4>
                    <div className="flex gap-2">
                      <input id={`id-${req.id}`} placeholder="Issue ID" className="flex-1 p-3 rounded-xl text-xs font-black outline-none uppercase border border-amber-200" />
                      <input id={`pw-${req.id}`} placeholder="Key" className="w-20 p-3 rounded-xl text-xs font-bold outline-none border border-amber-200" />
                    </div>
                    <button onClick={async () => {
                        const mid = document.getElementById(`id-${req.id}`).value;
                        const pass = document.getElementById(`pw-${req.id}`).value;
                        if(!mid || !pass) return alert("Setup credentials");
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', mid.toUpperCase()), { password: pass, uid: req.uid, businessName: req.bizName });
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.uid), { status: 'approved' });
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, merchantId: mid.toUpperCase(), isLive: false, services: [], staff: [], image: "" });
                        alert("Merchant Active!");
                      }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg">Authorize Entrance</button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* View Selection: Merchant Login */}
        {view === 'merchant_login' && (
           <div className="pt-20 space-y-6 animate-in zoom-in-95 duration-500 px-4">
              <div className="text-center mb-10">
                 <Lucide.Lock size={60} className="mx-auto text-emerald-600 mb-2 p-4 bg-emerald-50 rounded-[2rem]"/>
                 <h2 className="text-3xl font-black tracking-tighter uppercase italic text-emerald-900">Partner Access</h2>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Verify Secure ID for MH-08 Hub</p>
              </div>
              <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl space-y-4 border border-gray-100">
                 <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none uppercase shadow-inner" />
                 <input type="password" placeholder="Merchant Passcode" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none shadow-inner" />
                 <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all">Authorize Session</button>
              </div>
           </div>
        )}

        {/* View Selection: Business Onboarding */}
        {view === 'vendor_portal' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4">
              <div className="text-center mb-10">
                 <Lucide.PlusCircle size={48} className="mx-auto text-emerald-600 mb-2" />
                 <h2 className="text-3xl font-black uppercase tracking-tighter text-emerald-900 italic">Apply to join</h2>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Register your business today</p>
              </div>
              <div className="bg-white p-7 rounded-[3.5rem] shadow-xl space-y-4 border border-gray-100">
                 <input placeholder="Shop / Business Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase" />
                 <input placeholder="Chiplun Area / Landmark" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200 uppercase" />
                 <select value={regForm.cat} onChange={e => setRegForm({...regForm, cat: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none border border-transparent focus:border-emerald-200">
                    <option value="salon">Salon & Wellness</option><option value="travel">Transport Service</option><option value="clinic">Clinic/Medical</option><option value="repair">Service/Repair</option>
                 </select>
                 <button 
                  onClick={async () => {
                    if(!regForm.bizName || !regForm.addr) return alert("Fill all fields");
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), { uid: user.uid, ...regForm, status: 'pending', timestamp: new Date().toISOString() });
                    alert("Application Submitted! Request Merchant ID from Admin.");
                    setView('home');
                  }} 
                  className="w-full bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black shadow-xl uppercase active:scale-95 transition-all tracking-widest"
                 >
                  Launch Application
                 </button>
              </div>
           </div>
        )}

        {/* View Selection: Track Token */}
        {view === 'bookings' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 px-4">
              <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter italic">Track Token</h2>
              <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-gray-100 flex gap-2">
                 <input placeholder="CH-XXXX" value={bookingSearchQuery} onChange={e => setBookingSearchQuery(e.target.value)} className="flex-1 bg-transparent px-4 py-3 outline-none font-black tracking-widest text-sm uppercase" />
                 <button onClick={() => {
                    const found = allBookings.find(b => b.displayId === bookingSearchQuery.toUpperCase());
                    if(found) setSearchedBooking(found); else alert("Token Invalid");
                 }} className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all shadow-lg"><Lucide.Search size={20}/></button>
              </div>

              {searchedBooking && (
                <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl animate-in zoom-in-95">
                   <div className="flex justify-between items-start mb-6">
                      <div><p className="text-[10px] font-black uppercase opacity-60">Confirmed Merchant</p><h3 className="text-xl font-black italic uppercase">{searchedBooking.storeName}</h3></div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black tracking-widest">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-4 text-sm font-bold border-t border-white/10 pt-6 mt-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Queue Pos</p>#{searchedBooking.queuePos || '1'}</div>
                         <div><p className="opacity-60 text-[8px] uppercase mb-1">Professional</p>{searchedBooking.resourceName || 'First Available'}</div>
                      </div>
                      <div className="bg-white/10 p-4 rounded-3xl">
                         <p className="opacity-60 text-[8px] uppercase mb-1 italic">Schedule</p>
                         <p>{searchedBooking.date} • {searchedBooking.time}</p>
                      </div>
                   </div>
                   <button onClick={() => setSearchedBooking(null)} className="w-full mt-10 py-3 text-[10px] font-black uppercase bg-white/10 rounded-2xl active:scale-95">Close Track</button>
                </div>
              )}
           </div>
        )}

        {/* View Selection: Confirmation */}
        {view === 'confirmation' && (
           <div className="text-center pt-10 animate-in zoom-in-90 duration-700 pb-10 px-4">
             <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce border-2 border-emerald-200"><Lucide.CheckCircle2 size={40}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-6 uppercase tracking-tighter">Verified</h2>
             <div className="bg-emerald-600 text-white p-8 rounded-[3.5rem] shadow-2xl space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Lucide.Clock size={80}/></div>
                <div><p className="text-[10px] font-black uppercase opacity-60 mb-2">Unique Token</p><h3 className="text-5xl font-black tracking-widest italic">{lastBookingId}</h3></div>
                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                   <div className="text-center border-r border-white/10">
                      <p className="text-[8px] font-black uppercase opacity-60">Queue Slot</p><p className="text-2xl font-black">#{queueDisplay.pos}</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[8px] font-black uppercase opacity-60">Delayed</p><p className="text-2xl font-black">+{queueDisplay.delay}m</p>
                   </div>
                </div>
             </div>
             <p className="text-gray-400 my-10 px-12 leading-relaxed font-bold uppercase text-[9px] opacity-60 italic tracking-widest">"Screenshot this Token. Present it at the store to claim your slot."</p>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 uppercase tracking-widest">Back to Hub</button>
           </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase">Explore</span></button>
        <button onClick={() => setView('vendor_portal')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'vendor_portal' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Building2 size={22} /><span className="text-[9px] font-black uppercase">Business</span></button>
        <button onClick={() => { setView('bookings'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase font-black uppercase">Track</span></button>
        <button onClick={() => setView(isSessionVerified ? 'dashboard' : 'merchant_login')} className={`flex flex-col items-center gap-1.5 transition-all ${['merchant_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.UserCircle size={22} /><span className="text-[9px] font-black uppercase">Account</span></button>
      </nav>

    </div>
  );
}

