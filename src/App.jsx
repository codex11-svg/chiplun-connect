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

const appId = "chiplun-pro-v3"; 
const ADMIN_PIN = "112607"; // Updated Secure PIN

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]); 
  const [requests, setRequests] = useState([]);

  // Customer State
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [bookingMeta, setBookingMeta] = useState({ 
    date: '', time: '', staffName: '', custName: '', custPhone: '', paymentMethod: 'upi' 
  });
  
  // Admin/Vendor States
  const [adminPinInput, setAdminPinInput] = useState('');
  const [vendorLogin, setVendorLogin] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ bizName: '', cat: 'salon', addr: '' });
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

    const unsubProf = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
      } else {
        const d = { role: 'customer', status: 'none', uid: user.uid };
        setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), d);
        setProfile(d);
      }
      setLoading(false);
    });

    const unsubStores = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubBookings = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (snap) => {
      setAllBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubReqs = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubProf(); unsubStores(); unsubBookings(); unsubReqs(); };
  }, [user]);

  // Set edit form when dashboard opens
  useEffect(() => {
    if (view === 'dashboard' && profile.businessId) {
      const s = stores.find(st => st.ownerId === profile.businessId);
      if (s) setEditStoreForm({ name: s.name, address: s.address, image: s.image || '' });
    }
  }, [view, stores, profile.businessId]);

  // --- 3. Logic ---
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
    } else alert("Invalid Merchant ID or Password");
  };

  const deleteBusiness = async (bizId) => {
    if (!window.confirm("Are you sure you want to permanently delete this business?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', bizId));
    // Clean up associated requests if needed
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', bizId));
  };

  const finalizeBooking = async () => {
    setIsProcessing(true);
    setTimeout(async () => {
      const total = cart.reduce((a, b) => a + Number(b.price), 0);
      const payload = { ...bookingMeta, services: cart, totalPrice: total, storeId: selectedStore.id, storeName: selectedStore.name, timestamp: serverTimestamp() };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'bookings'), payload);
      setIsProcessing(false);
      setView('confirmation');
    }, 2000);
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-emerald-50"><Lucide.Loader2 className="animate-spin text-emerald-600 mb-4" size={40}/><p className="text-emerald-900 font-black tracking-widest uppercase">Initializing ChiplunConnect</p></div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900 overflow-x-hidden">
      
      {/* PROCESSING OVERLAY */}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col items-center justify-center animate-in fade-in">
           <Lucide.Loader2 className="animate-spin text-emerald-600 mb-6" size={56} />
           <h2 className="text-2xl font-black text-emerald-900 tracking-tighter uppercase">Securing Slot</h2>
           <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Connecting Local Gateway</p>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[4rem] shadow-lg sticky top-0 z-20">
        <div className="flex justify-between items-center mb-6">
          <div onClick={() => setView('home')} className="cursor-pointer active:scale-95 transition-transform">
            <h1 className="text-2xl font-black tracking-tighter">ChiplunConnect</h1>
            <div className="flex items-center text-emerald-100 text-[9px] font-black uppercase mt-1">
              <Lucide.MapPin size={10} className="mr-1" /> Managed Local Services
            </div>
          </div>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
            <Lucide.ShieldCheck size={20} />
          </button>
        </div>
        {view === 'home' && (
          <div className="relative animate-in zoom-in-95 duration-500">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search verified services..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-emerald-200 outline-none" />
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
                   <div className={`${cat.c} p-4 rounded-2xl shadow-sm group-active:scale-90 transition-transform`}>{cat.i}</div>
                   <span className="text-[8px] font-black text-gray-400 uppercase">{cat.n}</span>
                 </button>
               ))}
             </div>

             <section>
               <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Verified Partners</h2>
               <div className="space-y-4">
                 {stores.filter(s => s.isLive).map(store => (
                   <div key={store.id} onClick={() => { setSelectedStore(store); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm border border-gray-100 active:scale-98 transition-all cursor-pointer group">
                     <img 
                        src={store.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} 
                        className="w-20 h-20 rounded-[2rem] object-cover shadow-sm" 
                        onError={(e) => e.target.src = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"}
                     />
                     <div className="flex-1">
                       <h3 className="font-bold text-gray-800 text-sm">{store.name}</h3>
                       <p className="text-[10px] text-gray-400 font-medium italic">{store.address}</p>
                       <div className="flex items-center gap-2 mt-2">
                         <Lucide.Star size={12} className="text-yellow-400 fill-yellow-400" />
                         <span className="text-xs font-black text-gray-600">{store.rating || '5.0'}</span>
                         <span className="text-[8px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-black uppercase">{store.staff?.length || 0} Experts</span>
                       </div>
                     </div>
                     <Lucide.ChevronRight size={18} className="text-gray-200 mr-2" />
                   </div>
                 ))}
                 {stores.filter(s => s.isLive).length === 0 && (
                   <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 flex flex-col items-center">
                     <Lucide.Store size={48} className="text-gray-100 mb-3" />
                     <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">No Partners Live Yet</p>
                   </div>
                 )}
               </div>
             </section>
          </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === 'store_detail' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-right-4 duration-500 pb-10">
             <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-black text-[10px] uppercase mb-4 active:scale-95 transition-transform"><Lucide.ArrowLeft size={16} className="mr-1"/> BACK</button>
             
             <img 
                src={selectedStore?.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"} 
                className="w-full h-56 rounded-[3rem] object-cover shadow-2xl" 
                onError={(e) => e.target.src = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400"}
             />
             
             <section className="bg-white p-6 rounded-[3rem] shadow-sm border border-gray-50">
               <h2 className="text-2xl font-black">{selectedStore?.name}</h2>
               <p className="text-gray-400 text-xs mb-8 flex items-center"><Lucide.MapPin size={12} className="mr-1"/> {selectedStore?.address}</p>

               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Choose Services</h3>
               <div className="space-y-3">
                 {selectedStore?.services?.map((s, i) => (
                   <div 
                    key={i} 
                    onClick={() => {
                      if(cart.find(c => c.name === s.name)) setCart(cart.filter(c => c.name !== s.name));
                      else setCart([...cart, s]);
                    }}
                    className={`p-5 rounded-3xl border-2 transition-all flex justify-between items-center cursor-pointer ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50 shadow-md' : 'border-gray-50 bg-gray-50'}`}
                   >
                     <div className="flex items-center gap-3">
                       {cart.find(c => c.name === s.name) ? <Lucide.CheckSquare className="text-emerald-600" size={20}/> : <Lucide.Square className="text-gray-300" size={20}/>}
                       <span className="font-bold text-sm text-gray-700">{s.name}</span>
                     </div>
                     <span className="font-black text-emerald-600">₹{s.price}</span>
                   </div>
                 ))}
               </div>
             </section>

             {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[3rem] shadow-sm animate-in slide-in-from-bottom-6 border border-gray-50">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 text-center">Booking Details</h3>
                 
                 <div className="space-y-4 mb-8">
                   <div className="space-y-1.5">
                     <p className="text-[9px] font-bold text-gray-400 ml-1 uppercase">Expert</p>
                     <select onChange={e => setBookingMeta({...bookingMeta, staffName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm border-2 border-transparent focus:border-emerald-500 appearance-none text-center">
                       <option value="">Any Staff (Available)</option>
                       {selectedStore?.staff?.map((st, i) => <option key={i} value={st}>{st}</option>)}
                     </select>
                   </div>
                   <div className="space-y-1.5 text-center">
                     <p className="text-[9px] font-bold text-gray-400 ml-1 uppercase">Select Date</p>
                     <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                   </div>
                   <div className="grid grid-cols-3 gap-2 pt-2">
                     {['10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '04:00 PM', '06:00 PM'].map(t => {
                       const full = isSlotFull(bookingMeta.date, t, bookingMeta.staffName);
                       return (<button key={t} disabled={full} onClick={() => setBookingMeta({...bookingMeta, time: t})} className={`py-3.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${bookingMeta.time === t ? 'bg-emerald-600 text-white shadow-xl scale-105' : full ? 'bg-gray-100 text-gray-300 line-through' : 'bg-gray-50 text-gray-600'}`}>{t} {full && '• FULL'}</button>);
                     })}
                   </div>
                 </div>
                 <div className="space-y-4 pt-6 border-t border-gray-100">
                    <input placeholder="Enter Your Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                    <input placeholder="Enter Phone Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" />
                 </div>
                 <button disabled={!bookingMeta.date || !bookingMeta.time || !bookingMeta.custName || !bookingMeta.custPhone} onClick={() => setView('checkout')} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black mt-10 shadow-xl disabled:opacity-50 active:scale-95 transition-all">Confirm Booking ₹{cart.reduce((a, b) => a + Number(b.price), 0)}</button>
               </div>
             )}
           </div>
        )}

        {/* VIEW: VENDOR DASHBOARD (Modify & Add Images) */}
        {view === 'dashboard' && profile.role === 'vendor' && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900 tracking-tighter uppercase">{profile.businessName}</h2><button onClick={() => setView('home')} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 active:scale-90 transition-all"><Lucide.XCircle size={18}/></button></div>

            {/* MODIFY PROFILE & IMAGE */}
            <section className="bg-white p-7 rounded-[3.5rem] shadow-sm border border-gray-100">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center"><Lucide.Edit size={14} className="mr-2 text-emerald-600"/> Modify Business Profile</h3>
               <div className="space-y-4">
                  <div><p className="text-[8px] font-black text-gray-400 uppercase mb-1 ml-1">Shop Name</p>
                  <input value={editStoreForm.name} onChange={e => setEditStoreForm({...editStoreForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" /></div>
                  
                  <div><p className="text-[8px] font-black text-gray-400 uppercase mb-1 ml-1">Location / Address</p>
                  <input value={editStoreForm.address} onChange={e => setEditStoreForm({...editStoreForm, address: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" /></div>

                  <div><p className="text-[8px] font-black text-gray-400 uppercase mb-1 ml-1">Cover Image URL</p>
                  <input placeholder="Paste image link here" value={editStoreForm.image} onChange={e => setEditStoreForm({...editStoreForm, image: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none border-2 border-transparent focus:border-emerald-500" /></div>

                  <button 
                    onClick={async () => {
                      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId);
                      await updateDoc(ref, editStoreForm);
                      alert("Business Profile Updated!");
                    }}
                    className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-black shadow-lg shadow-emerald-100 mt-2"
                  >
                    Save Changes
                  </button>
               </div>
            </section>

            {/* LIVE TOGGLE */}
            <div className={`p-6 rounded-[3rem] border-2 flex justify-between items-center transition-all ${stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'bg-emerald-50 border-emerald-200 shadow-md' : 'bg-gray-50 border-gray-100 opacity-80'}`}>
               <div><p className="text-[10px] font-black text-gray-400 uppercase">Visibility</p><p className={`font-black text-lg ${stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'text-emerald-700' : 'text-gray-400'}`}>{stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'ONLINE' : 'OFFLINE'}</p></div>
               <button onClick={() => { const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !s.isLive }); }} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg ${stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>
                 {stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'Stop Selling' : 'Go Live Now'}
               </button>
            </div>

            {/* STAFF & SERVICES */}
            <section className="bg-white p-7 rounded-[3.5rem] shadow-sm border border-gray-100"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center"><Lucide.Users size={14} className="mr-2"/> Team Members</h3><div className="flex flex-wrap gap-2 mb-6">{stores.find(s => s.ownerId === profile.businessId)?.staff?.map((n, i) => (<div key={i} className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-[10px] font-bold flex items-center gap-2 border border-emerald-100">{n} <button onClick={() => { const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: s.staff.filter((_, idx) => idx !== i) }); }}><Lucide.XCircle size={12}/></button></div>))}</div>
            <div className="flex gap-2"><input placeholder="Worker Name" value={newStaff} onChange={e => setNewStaff(e.target.value)} className="flex-1 bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none" /><button onClick={() => { if(!newStaff) return; const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { staff: [...(s.staff || []), newStaff] }); setNewStaff(''); }} className="bg-emerald-600 text-white p-4 rounded-2xl active:scale-95 shadow-lg"><Lucide.Plus size={20}/></button></div></section>
            
            <section className="bg-white p-7 rounded-[3.5rem] shadow-sm border border-gray-100"><h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Service Catalog</h3><div className="space-y-3 mb-8">{stores.find(s => s.ownerId === profile.businessId)?.services?.map((s, i) => (<div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl font-bold text-sm"><div><p>{s.name}</p><p className="text-emerald-600">₹{s.price}</p></div><button onClick={() => { const s_ = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: s_.services.filter((_, idx) => idx !== i) }); }} className="text-rose-400 p-2.5 bg-white rounded-xl shadow-sm"><Lucide.Trash2 size={16}/></button></div>))}</div>
            <div className="space-y-3 pt-4 border-t border-gray-50"><input placeholder="Service Title" value={newSvc.name} onChange={e => setNewSvc({...newSvc, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm" /><input placeholder="Price ₹" type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl outline-none font-bold text-sm" /><button onClick={() => { if(!newSvc.name || !newSvc.price) return; const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { services: [...(s.services || []), newSvc] }); setNewSvc({name:'', price:''}); }} className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-black shadow-xl">Add to Menu</button></div></section>
          </div>
        )}

        {/* VIEW: ADMIN PANEL (Delete & Manage Businesses) */}
        {view === 'admin_panel' && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-top-8 duration-500">
            <h2 className="text-2xl font-black tracking-tight uppercase">Admin Core</h2>
            
            <div className="bg-white p-7 rounded-[3rem] border border-gray-100 shadow-sm grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 p-5 rounded-[2.5rem] flex flex-col items-center"><Lucide.BarChart3 size={20} className="text-emerald-600 mb-2"/><p className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">Bookings</p><p className="text-3xl font-black text-emerald-900">{allBookings.length}</p></div>
                <div className="bg-blue-50 p-5 rounded-[2.5rem] flex flex-col items-center"><Lucide.TrendingUp size={20} className="text-blue-600 mb-2"/><p className="text-[8px] font-black uppercase text-blue-600 tracking-widest">Partners</p><p className="text-3xl font-black text-blue-900">{stores.length}</p></div>
            </div>

            <section className="space-y-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Live Businesses Control</h3>
              {stores.map(s => (
                <div key={s.id} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center gap-4 animate-in fade-in">
                   <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center font-black text-emerald-600 uppercase">{s.name[0]}</div>
                   <div className="flex-1">
                      <h4 className="font-bold text-sm leading-none">{s.name}</h4>
                      <p className="text-[8px] font-bold text-gray-400 mt-1 uppercase">{s.address}</p>
                   </div>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id), { isLive: !s.isLive })}
                        className={`p-2 rounded-xl border ${s.isLive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
                      >
                        {s.isLive ? <Lucide.Eye size={16}/> : <Lucide.EyeOff size={16}/>}
                      </button>
                      <button 
                        onClick={() => deleteBusiness(s.id)}
                        className="p-2 bg-rose-50 text-rose-500 rounded-xl border border-rose-100"
                      >
                        <Lucide.Trash2 size={16}/>
                      </button>
                   </div>
                </div>
              ))}
              {stores.length === 0 && <p className="text-center py-10 text-gray-300 text-xs italic">No businesses registered.</p>}
            </section>

            <section className="space-y-4 pt-6 border-t border-gray-100">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pending Partner Apps</h3>
              {requests.filter(r => r.status === 'pending').map(req => (
                <div key={req.id} className="bg-white p-7 rounded-[3.5rem] border border-gray-100 shadow-sm space-y-4">
                  <div><h4 className="font-bold text-lg">{req.bizName}</h4><p className="text-[10px] text-gray-400">{req.addr}</p></div>
                  <div className="bg-gray-50 p-4 rounded-3xl space-y-2">
                    <input id={`id-${req.id}`} placeholder="Issue Merchant ID" className="w-full bg-white p-3 rounded-xl text-xs font-bold outline-none" />
                    <input id={`pw-${req.id}`} placeholder="Merchant Pass" className="w-full bg-white p-3 rounded-xl text-xs font-bold outline-none" />
                  </div>
                  <button onClick={async () => {
                      const uid = document.getElementById(`id-${req.id}`).value;
                      const pass = document.getElementById(`pw-${req.id}`).value;
                      if(!uid || !pass) return;
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', uid), { password: pass, uid: req.uid, businessName: req.bizName });
                      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.uid), { status: 'approved' });
                      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, category: req.cat || 'salon', ownerId: req.uid, isLive: false, services: [], staff: [], rating: 5.0, image: "" });
                    }} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg">Approve & Issue Access</button>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* SECURE ADMIN LOGIN (PIN UPDATED) */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner"><Lucide.Lock size={40} /></div>
              <h2 className="text-3xl font-black mb-2 tracking-tighter">Admin Login</h2>
              <p className="text-[10px] text-gray-400 mb-10 uppercase tracking-widest text-center font-bold">New Security Key Required</p>
              <input type="password" maxLength={6} value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} className="w-60 text-center text-6xl font-black border-b-4 outline-none py-4 text-emerald-600 border-gray-100 focus:border-emerald-500 bg-transparent mb-12 tracking-[0.2em]" />
              <button onClick={() => {if(adminPinInput===ADMIN_PIN) setView('admin_panel'); else { alert("ACCESS DENIED"); setAdminPinInput(''); }}} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black shadow-2xl active:scale-95 transition-all uppercase tracking-widest">Unlock Management</button>
           </div>
        )}

        {/* MERCHANT GATEWAY */}
        {view === 'vendor_portal' && profile.role !== 'vendor' && (
           <div className="pt-4 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="text-center"><div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-sm"><Lucide.Store size={48}/></div><h2 className="text-3xl font-black tracking-tight uppercase tracking-tighter">Business Portal</h2></div>
              <div className="flex bg-gray-200 p-1.5 rounded-3xl mt-8"><button onClick={() => setView('vendor_portal')} className="flex-1 py-3 text-[10px] font-black rounded-2xl bg-white shadow-sm uppercase tracking-widest transition-all">Register</button><button onClick={() => setView('vendor_login')} className="flex-1 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest transition-all">Login</button></div>
              {profile.status === 'none' ? (
                <div className="bg-white p-7 rounded-[3.5rem] space-y-4 shadow-sm mt-4 border border-gray-50">
                  <input placeholder="Official Business Title" value={regForm.bizName} onChange={e => setRegForm({...regForm, bizName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-emerald-500" />
                  <input placeholder="Store Location (Area)" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-emerald-500" />
                  <button onClick={handleApplication} className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-black shadow-xl mt-4 active:scale-95 transition-all uppercase tracking-widest font-black">Submit Application</button>
                </div>
              ) : <div className="text-center py-24 italic text-gray-400 font-black uppercase text-[10px] tracking-widest animate-pulse">Application Under Moderation...</div>}
           </div>
        )}

        {view === 'vendor_login' && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-8 duration-500">
             <div className="text-center mb-8"><div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6"><Lucide.LogIn size={48}/></div><h2 className="text-3xl font-black text-gray-800 tracking-tighter uppercase font-black tracking-tighter">Merchant Auth</h2></div>
             <div className="bg-white p-7 rounded-[3.5rem] space-y-4 shadow-sm border border-gray-100">
                <input placeholder="Merchant User ID" value={vendorLogin.id} onChange={e => setVendorLogin({...vendorLogin, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-emerald-500" />
                <input type="password" placeholder="Merchant Security Key" value={vendorLogin.pass} onChange={e => setVendorLogin({...vendorLogin, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 ring-emerald-500" />
                <button onClick={handleVendorAuth} className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-black shadow-2xl active:scale-95 transition-all uppercase font-black">Secure Access</button>
             </div>
          </div>
        )}

        {/* VIEW: CHECKOUT */}
        {view === 'checkout' && (
           <div className="pt-4 space-y-6 animate-in zoom-in-95">
             <h2 className="text-2xl font-black tracking-tight uppercase tracking-tighter font-black uppercase">Confirm Booking</h2>
             <div className="bg-white p-6 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                <div className="flex justify-between items-start">
                   <div><h3 className="font-bold text-lg text-emerald-900">{selectedStore?.name}</h3><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{bookingMeta.date} • {bookingMeta.time}</p></div>
                   <div className="bg-emerald-50 text-emerald-600 px-4 py-1 rounded-2xl text-[10px] font-black uppercase shadow-inner">{bookingMeta.staffName || 'Auto-Expert'}</div>
                </div>
                <div className="space-y-2 py-4 border-y border-gray-50">
                  {cart.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs font-bold text-gray-500"><span>{s.name}</span><span>₹{s.price}</span></div>
                  ))}
                  <div className="flex justify-between text-xl font-black pt-4 border-t border-gray-100"><span className="text-emerald-900 tracking-tighter">Grand Total</span><span className="text-emerald-600">₹{cart.reduce((a, b) => a + Number(b.price), 0)}</span></div>
                </div>
                <div className="text-[10px] font-bold text-gray-300 uppercase text-center flex items-center justify-center gap-2"><Lucide.Lock size={10}/> SECURE PAYMENT GATEWAY</div>
             </div>
             <button onClick={finalizeBooking} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-2xl active:scale-95 transition-all uppercase tracking-widest">Confirm & Book Now</button>
          </div>
        )}

        {view === 'confirmation' && (
           <div className="h-full flex flex-col items-center justify-center text-center pt-24 animate-in zoom-in-90 duration-700">
             <div className="w-28 h-28 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner animate-bounce"><Lucide.CheckCircle2 size={56}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-2 tracking-tighter uppercase font-black uppercase tracking-widest">Confirmed</h2>
             <p className="text-gray-400 mb-14 italic px-12 leading-relaxed font-bold uppercase text-[10px] tracking-[0.2em]">"See you soon! Your booking is secured on the ChiplunConnect Network."</p>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl active:scale-95 transition-all uppercase tracking-widest">Finish</button>
           </div>
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}>
          <Lucide.Home size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Explore</span>
        </button>
        <button onClick={() => setView(profile.role === 'vendor' ? 'dashboard' : 'vendor_portal')} className={`flex flex-col items-center gap-1.5 transition-all ${['vendor_portal', 'vendor_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}>
          <Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Business</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-gray-300 active:scale-90 transition-transform">
          <Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Bookings</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-gray-300 active:scale-90 transition-transform">
          <Lucide.User size={22} /><span className="text-[9px] font-black uppercase tracking-tighter">Account</span>
        </button>
      </nav>

    </div>
  );
}

