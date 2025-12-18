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
const appId = "chiplun-pro-v10"; 
const ADMIN_PIN = "112607";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home');
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // SESSION STATE (Auto-logout on refresh)
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  
  // Data State
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [myBookings, setMyBookings] = useState([]);

  // Selections
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]);
  const [bookingMeta, setBookingMeta] = useState({
    date: '', time: '', resourceName: '', custName: '', custPhone: '',
    paymentMethod: 'cash', source: '', destination: '', tripType: 'One-Way'
  });

  const [bookingSearchQuery, setBookingSearchQuery] = useState('');
  const [searchedBooking, setSearchedBooking] = useState(null);
  const [lastBookingId, setLastBookingId] = useState('');

  // Forms
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', addr: '', cat: 'salon' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '', duration: '30 min' });
  const [newStaff, setNewStaff] = useState('');
  const [editForm, setEditForm] = useState({ name: '', address: '', image: '', category: 'salon' });

  // --- Auth & Data ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
      setUser(u);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
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

  // --- Handlers ---
  const handleBooking = async () => {
    setIsProcessing(true);
    const shortId = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const total = cart.reduce((a, b) => a + Number(b.price), 0);
    const payload = { ...bookingMeta, displayId: shortId, services: cart, totalPrice: total, storeId: selectedStore.id, storeName: selectedStore.name, timestamp: serverTimestamp() };
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
    setLastBookingId(shortId);
    setIsProcessing(false);
    setView('confirmation');
  };

  const handleVendorLogin = async () => {
    setIsProcessing(true);
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorLogin.id));
    if (snap.exists() && snap.data().password === vendorLogin.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        role: 'vendor', status: 'approved', businessId: snap.data().uid, businessName: snap.data().businessName
      });
      setIsSessionVerified(true);
      setView('dashboard');
    } else alert("Invalid Merchant ID or Key");
    setIsProcessing(false);
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-emerald-600 p-10"><Lucide.Loader2 className="animate-spin text-white mb-4" size={40}/><h1 className="text-white font-black uppercase text-xs tracking-widest">ChiplunConnect Pro</h1></div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {/* PROCESSING UI */}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col items-center justify-center animate-in fade-in">
           <Lucide.Loader2 className="animate-spin text-emerald-600 mb-6" size={56} />
           <h2 className="text-xl font-black text-emerald-900 uppercase">Synchronizing...</h2>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-all">
            <h1 className="text-2xl font-black tracking-tighter italic">ChiplunConnect</h1>
            <p className="text-[9px] font-bold opacity-70 uppercase tracking-widest">Secure Local Gateway</p>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/5 active:bg-white/20 transition-all shadow-inner">
            <Lucide.ShieldCheck size={20}/>
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in slide-in-from-top-2">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search Chiplun services..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none focus:bg-white/20" />
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

             <section className="animate-in slide-in-from-bottom-4 pb-10">
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Verified Chiplun Partners</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 hover:border-emerald-200 active:scale-[0.98] transition-all">
                     <img src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} className="w-20 h-20 rounded-[2rem] object-cover bg-gray-50" />
                     <div className="flex-1">
                       <span className="text-[7px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full mb-1 inline-block">{store.category}</span>
                       <h3 className="font-bold text-gray-800 text-sm leading-tight">{store.name}</h3>
                       <p className="text-[10px] text-gray-400 font-medium">{store.address}</p>
                     </div>
                     <Lucide.ChevronRight size={18} className="text-gray-200 mr-2" />
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
               <h2 className="text-2xl font-black italic text-emerald-900">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-8">{selectedStore.address}</p>
               
               {selectedStore.category === 'travel' && (
                 <div className="grid grid-cols-2 gap-2 mb-6">
                    <input placeholder="Source" onChange={e => setBookingMeta({...bookingMeta, source: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold border border-gray-100 outline-none focus:border-blue-300 uppercase" />
                    <input placeholder="Destination" onChange={e => setBookingMeta({...bookingMeta, destination: e.target.value})} className="bg-gray-50 p-3 rounded-xl text-xs font-bold border border-gray-100 outline-none focus:border-blue-300 uppercase" />
                 </div>
               )}

               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Select Services</h3>
               <div className="space-y-3">
                 {selectedStore.services?.map((s, i) => (
                   <div key={i} onClick={() => { if(cart.find(c => c.name === s.name)) setCart(cart.filter(c => c.name !== s.name)); else setCart([...cart, s]); }} className={`p-5 rounded-3xl border-2 transition-all flex justify-between items-center ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50 shadow-md scale-[1.02]' : 'border-gray-50 bg-gray-50'}`}>
                     <div><p className="font-bold text-sm leading-none">{s.name}</p><p className="text-[8px] text-gray-400 mt-1 uppercase font-bold">{s.duration || 'Standard'}</p></div>
                     <span className="font-black text-emerald-600 tracking-tighter">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>

             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase mb-6 text-center tracking-widest font-black">Secure Appointment</h3>
                 <div className="space-y-4">
                   <select onChange={e => setBookingMeta({...bookingMeta, resourceName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm">
                      <option value="">Any Specialist</option>
                      {selectedStore.staff?.map((st, i) => <option key={i} value={st}>{st}</option>)}
                   </select>
                   <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none" />
                   <input placeholder="WhatsApp Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none uppercase" />
                   <button onClick={() => setView('payment')} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all">Proceed to Booking</button>
                 </div>
              </div>
            )}
           </div>
        )}

        {/* VIEW: PAYMENT GATEWAY (SIMULATED) */}
        {view === 'payment' && (
           <div className="pt-4 space-y-6 animate-in zoom-in-95 duration-500">
              <div className="text-center mb-8"><Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={40}/><h2 className="text-2xl font-black uppercase tracking-tighter italic">Checkout</h2></div>
              <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border border-gray-100 space-y-8">
                 <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                    <p className="font-bold text-emerald-900">{selectedStore?.name}</p><p className="text-3xl font-black text-emerald-600 tracking-tighter">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-3 opacity-60">
                    <button onClick={() => alert("Digital Gateway is under maintenance. Please use 'Cash at Store' for now.")} className="flex flex-col items-center p-5 rounded-[2rem] border-2 border-gray-100 bg-gray-50 active:scale-90 transition-all"><Lucide.Smartphone size={24}/><span className="text-[8px] font-black mt-2">GPAY/UPI</span></button>
                    <button onClick={() => alert("Digital Gateway is under maintenance. Please use 'Cash at Store' for now.")} className="flex flex-col items-center p-5 rounded-[2rem] border-2 border-gray-100 bg-gray-50 active:scale-90 transition-all"><Lucide.CreditCard size={24}/><span className="text-[8px] font-black mt-2">DEBIT CARD</span></button>
                 </div>
                 <button onClick={() => { setBookingMeta({...bookingMeta, paymentMethod: 'Cash'}); handleBooking(); }} className="w-full p-6 rounded-[2.5rem] border-2 border-emerald-600 bg-emerald-50 flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg"><Lucide.Wallet className="text-emerald-600"/><span className="text-sm font-black uppercase tracking-widest text-emerald-900">Confirm & Pay at Store</span></button>
              </div>
           </div>
        )}

        {/* VIEW: BUSINESS TAB (Applications Only) */}
        {view === 'vendor_portal' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 pb-10">
              <div className="text-center mb-8">
                 <Lucide.Building2 size={48} className="mx-auto text-emerald-600 mb-2" />
                 <h2 className="text-3xl font-black uppercase tracking-tighter">Business Onboarding</h2>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Become a verified ChiplunConnect partner</p>
              </div>
              <div className="bg-white p-7 rounded-[3rem] shadow-xl space-y-4 border border-gray-50">
                 <input placeholder="Official Shop Name" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                 <input placeholder="Area / Landmark" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                 <select value={regForm.cat} onChange={e => setRegForm({...regForm, cat: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none">
                    <option value="salon">Salon & Wellness</option>
                    <option value="travel">Travel & Taxis</option>
                    <option value="clinic">Health & Medical</option>
                    <option value="repair">Other Services</option>
                 </select>
                 <button 
                  onClick={async () => {
                    if(!regForm.bizName || !regForm.addr) return alert("All fields required");
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), { uid: user.uid, ...regForm, status: 'pending', timestamp: new Date().toISOString() });
                    alert("Application Sent! Check with Admin for your Merchant ID.");
                    setView('home');
                  }} 
                  className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all"
                 >
                  Launch Application
                 </button>
                 <div className="p-4 bg-gray-50 rounded-2xl text-[9px] font-bold text-gray-400 uppercase leading-relaxed">
                    Note: After submitting, the ChiplunConnect admin will verify your location and provide you with a Merchant ID for the Account tab.
                 </div>
              </div>
           </div>
        )}

        {/* VIEW: ACCOUNT TAB (Entrance & Dashboard) */}
        {(view === 'vendor_login' || view === 'dashboard') && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 pb-10">
              {!isSessionVerified ? (
                 <div className="space-y-6">
                    <div className="text-center mb-8">
                       <Lucide.UserCircle size={56} className="mx-auto text-emerald-600 mb-2"/>
                       <h2 className="text-3xl font-black tracking-tighter uppercase">Merchant Hub</h2>
                       <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Restricted Access Portal</p>
                    </div>
                    <div className="bg-white p-8 rounded-[3.5rem] shadow-2xl border border-gray-100 space-y-4">
                       <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none uppercase" />
                       <input type="password" placeholder="Access Passcode" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none" />
                       <button onClick={handleVendorLogin} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-xl active:scale-95 transition-all uppercase tracking-widest">Verify Merchant Identity</button>
                    </div>
                 </div>
              ) : (
                <div className="space-y-6 animate-in slide-in-from-bottom-6">
                   <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900 uppercase italic tracking-tighter">{profile.businessName}</h2><button onClick={() => { setIsSessionVerified(false); setView('home'); }} className="bg-rose-50 p-3 rounded-2xl text-rose-500 shadow-sm active:scale-90 transition-all font-black text-[10px]">LOGOUT</button></div>

                   <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100 space-y-5">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center"><Lucide.Edit size={14} className="mr-2 text-emerald-600"/> Edit Storefront</h3>
                      <input placeholder="Cover Image URL" value={editForm.image} onChange={e => setEditForm({...editForm, image: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none uppercase" />
                      <input placeholder="Store Name" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-xs outline-none" />
                      <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), editForm); alert("Profile Synced!"); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-xs">Save Updates</button>
                   </section>

                   <section className="bg-white p-7 rounded-[3rem] shadow-sm border border-gray-100">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Resource Management</h3>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {myStore?.staff?.map((n, i) => (<div key={i} className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">{n} <button onClick={() => { updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: myStore.staff.filter((_, idx) => idx !== i) }); }}><Lucide.X size={12}/></button></div>))}
                      </div>
                      <div className="flex gap-2"><input placeholder="Add Name" value={newStaff} onChange={e => setNewStaff(e.target.value)} className="flex-1 bg-gray-50 p-3 rounded-lg font-bold text-sm outline-none" /><button onClick={() => { if(!newStaff) return; updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: [...(myStore.staff || []), newStaff] }); setNewStaff(''); }} className="bg-emerald-600 text-white p-3 rounded-lg"><Lucide.Plus size={18}/></button></div>
                   </section>
                   
                   <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !myStore?.isLive })} className={`w-full py-5 rounded-[2.5rem] font-black uppercase shadow-2xl ${myStore?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
                      {myStore?.isLive ? 'Take Store Offline' : 'Publish Store (Live)'}
                   </button>
                </div>
              )}
           </div>
        )}

        {/* ... (Admin and Search UI kept stable from V9) ... */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-6" size={40}/>
              <h2 className="text-2xl font-black mb-10 tracking-tighter uppercase font-black">Admin Core</h2>
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 border-emerald-100 outline-none bg-transparent mb-12 tracking-[0.2em]" />
              <button onClick={() => { if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("ACCESS DENIED"); setAdminPinInput(''); } }} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl uppercase font-black">Enter Core</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-6 pb-10">
            <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter">System Management</h2>
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Live Stores</h3>
              {stores.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-3xl border border-gray-100 flex items-center gap-4">
                   <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center font-bold text-emerald-600 uppercase">{s.name[0]}</div>
                   <div className="flex-1 font-bold text-sm uppercase">{s.name} <span className="block text-[8px] opacity-50">{s.category}</span></div>
                   <button onClick={async () => { if(window.confirm("Permanent Delete?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="text-rose-500 p-2"><Lucide.Trash2 size={18}/></button>
                </div>
              ))}
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mt-6">Application Inbox</h3>
              {requests.filter(r => r.status === 'pending').map(req => (
                  <div key={req.id} className="bg-amber-50 p-6 rounded-3xl space-y-4 border border-amber-100 animate-in fade-in">
                    <h4 className="font-bold text-sm uppercase italic">{req.bizName}</h4>
                    <div className="flex gap-2">
                      <input id={`id-${req.id}`} placeholder="Set Merchant ID" className="flex-1 p-2 rounded-xl text-xs font-bold outline-none uppercase" />
                      <input id={`pw-${req.id}`} placeholder="Set Key" className="w-20 p-2 rounded-xl text-xs font-bold outline-none" />
                    </div>
                    <button onClick={async () => {
                        const uid = document.getElementById(`id-${req.id}`).value;
                        const pass = document.getElementById(`pw-${req.id}`).value;
                        if(!uid || !pass) return alert("Setup credentials first");
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', uid), { password: pass, uid: req.uid, businessName: req.bizName });
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.uid), { status: 'approved' });
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, isLive: false, services: [], staff: [], image: "" });
                        alert("Approved!");
                      }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px]">Authorize Merchant</button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {view === 'bookings' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4">
              <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter">Token Search</h2>
              <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-gray-100 flex gap-2">
                 <input placeholder="CH-XXXX" value={bookingSearchQuery} onChange={e => setBookingSearchQuery(e.target.value)} className="flex-1 bg-transparent px-4 py-3 outline-none font-black tracking-widest text-sm uppercase" />
                 <button onClick={() => {
                    const found = allBookings.find(b => b.displayId === bookingSearchQuery.toUpperCase());
                    if(found) setSearchedBooking(found); else alert("Token not found");
                 }} className="bg-emerald-600 text-white p-3 rounded-2xl active:scale-90 transition-all"><Lucide.Search size={20}/></button>
              </div>

              {searchedBooking && (
                <div className="bg-emerald-600 text-white p-7 rounded-[3rem] shadow-2xl animate-in zoom-in-95">
                   <div className="flex justify-between items-start mb-6">
                      <div><p className="text-[10px] font-black uppercase opacity-60">Verified Appointment</p><h3 className="text-xl font-black italic">{searchedBooking.storeName}</h3></div>
                      <span className="bg-white/20 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest">{searchedBooking.displayId}</span>
                   </div>
                   <div className="space-y-4 text-sm font-bold">
                      <p className="opacity-60 text-[8px] uppercase">Schedule</p><p>{searchedBooking.date} • {searchedBooking.time}</p>
                      <p className="opacity-60 text-[8px] uppercase mt-2">Assigned Specialist</p><p>{searchedBooking.resourceName || 'First Available'}</p>
                      <div className="pt-4 border-t border-white/10 flex justify-between items-center text-[10px] uppercase">
                         <span>Payment: {searchedBooking.paymentMethod}</span>
                         <span className="text-emerald-200 text-lg">₹{searchedBooking.totalPrice}</span>
                      </div>
                   </div>
                   <button onClick={() => setSearchedBooking(null)} className="w-full mt-8 py-3 text-[10px] font-black uppercase bg-white/10 rounded-2xl active:scale-95 transition-all">Close</button>
                </div>
              )}
           </div>
        )}

        {view === 'confirmation' && (
           <div className="text-center pt-24 animate-in zoom-in-90 duration-700">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 animate-bounce shadow-inner"><Lucide.CheckCircle2 size={56}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-4 tracking-tighter uppercase font-black uppercase">Reserved</h2>
             <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border-2 border-emerald-50 mx-4 mb-10 text-center relative overflow-hidden">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">Unique Token</p>
                <h3 className="text-5xl font-black text-emerald-600 tracking-tighter mb-4 italic">{lastBookingId}</h3>
                <p className="text-[8px] font-bold text-emerald-900 uppercase bg-emerald-100 px-4 py-1.5 rounded-full inline-block tracking-widest italic">ID Verified MH-08</p>
             </div>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 uppercase tracking-widest">Back to Hub</button>
           </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Explore</span></button>
        <button onClick={() => setView('vendor_portal')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'vendor_portal' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Business</span></button>
        <button onClick={() => { setView('bookings'); setSearchedBooking(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Track</span></button>
        <button onClick={() => setView(isSessionVerified ? 'dashboard' : 'vendor_login')} className={`flex flex-col items-center gap-1.5 transition-all ${['vendor_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.User size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Account</span></button>
      </nav>

    </div>
  );
}

