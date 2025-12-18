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

// Initialize Services once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "chiplun-pro-v6"; 
const ADMIN_PIN = "112607"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ role: 'customer', status: 'none' });
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Database Data
  const [stores, setStores] = useState([]);
  const [allBookings, setAllBookings] = useState([]); 
  const [requests, setRequests] = useState([]);

  // Interaction States
  const [selectedStore, setSelectedStore] = useState(null);
  const [cart, setCart] = useState([]); 
  const [bookingIdSearch, setBookingIdSearch] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [lastGeneratedId, setLastGeneratedId] = useState('');
  
  // Forms
  const [adminPin, setAdminPin] = useState('');
  const [vendorAuth, setVendorAuth] = useState({ id: '', pass: '' });
  const [regForm, setRegForm] = useState({ name: '', addr: '' });
  const [editStore, setEditStore] = useState({ name: '', addr: '', img: '' });
  const [newSvc, setNewSvc] = useState({ name: '', price: '' });
  const [newStaff, setNewStaff] = useState('');

  // 1. Unified Auth & Data Listener (Reduces Lag)
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try { await signInAnonymously(auth); } catch (e) { console.error(e); }
        return;
      }
      setUser(u);

      // Fetch Profile
      onSnapshot(doc(db, 'artifacts', appId, 'users', u.uid, 'profile', 'data'), (snap) => {
        if (snap.exists()) setProfile(snap.data());
        else setDoc(doc(db, 'artifacts', appId, 'users', u.uid, 'profile', 'data'), { role: 'customer', status: 'none' });
        setLoading(false);
      });

      // Fetch Stores
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'stores'), (s) => 
        setStores(s.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      // Fetch Requests
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), (s) => 
        setRequests(s.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      // Fetch All Bookings (For admin and conflict checking)
      onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), (s) => 
        setAllBookings(s.docs.map(d => ({ id: d.id, ...d.data() })))
      );
    });

    return () => unsubAuth();
  }, []);

  // Sync edit form when merchant enters dashboard
  useEffect(() => {
    if (view === 'dashboard' && profile.businessId) {
      const s = stores.find(st => st.ownerId === profile.businessId);
      if (s) setEditStore({ name: s.name, addr: s.address, img: s.image || '' });
    }
  }, [view, profile.businessId]);

  // --- Logic Handlers ---
  const handleBookingSearch = () => {
    const found = allBookings.find(b => b.displayId?.toUpperCase() === bookingIdSearch.toUpperCase());
    setSearchResult(found || "NOT_FOUND");
  };

  const checkAvailability = (date, time, staff = null) => {
    if (!selectedStore || !date || !time) return true;
    const busy = allBookings.filter(b => b.storeId === selectedStore.id && b.date === date && b.time === time);
    if (staff && staff !== "") return !busy.some(b => b.staffName === staff);
    return busy.length < (selectedStore.staff?.length || 1);
  };

  const handleApply = async () => {
    if (!regForm.name || !regForm.addr) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', user.uid), {
      uid: user.uid, bizName: regForm.name, addr: regForm.addr, status: 'pending'
    });
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { status: 'pending' });
    alert("Application Sent to Admin!");
  };

  const handleMerchantLogin = async () => {
    const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', vendorAuth.id));
    if (snap.exists() && snap.data().password === vendorAuth.pass) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
        role: 'vendor', status: 'approved', businessId: snap.data().uid, businessName: snap.data().businessName
      });
      setView('dashboard');
    } else alert("Invalid Login");
  };

  const finalizeBooking = async () => {
    setIsProcessing(true);
    const shortId = "CH-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const total = cart.reduce((a, b) => a + Number(b.price), 0);
    const payload = { 
      displayId: shortId, storeId: selectedStore.id, storeName: selectedStore.name,
      custName: cart.custName, ...bookingMeta, services: cart, totalPrice: total, timestamp: serverTimestamp() 
    };
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), payload);
    setLastGeneratedId(shortId);
    setIsProcessing(false);
    setView('confirmation');
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-emerald-600 text-white font-black animate-pulse">CHIPLUN CONNECT...</div>;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col shadow-2xl relative font-sans text-gray-900">
      
      {isProcessing && <div className="fixed inset-0 bg-white/90 z-[100] flex items-center justify-center font-bold">SAVING...</div>}

      {/* HEADER */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[3.5rem] sticky top-0 z-50">
        <div className="flex justify-between items-center mb-6">
          <h1 onClick={() => setView('home')} className="text-2xl font-black tracking-tighter cursor-pointer">ChiplunConnect</h1>
          <button onClick={() => setView('admin_auth')} className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center"><Lucide.ShieldCheck size={20} /></button>
        </div>
        {view === 'home' && (
          <div className="relative">
            <Lucide.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300" size={18} />
            <input type="text" placeholder="Search Chiplun..." className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-12 pr-4 text-white placeholder-emerald-200 outline-none" />
          </div>
        )}
      </header>

      <main className="flex-1 -mt-6 px-4 pb-32 overflow-y-auto">
        
        {/* VIEW: HOME */}
        {view === 'home' && (
          <div className="space-y-6 pt-2 animate-in slide-in-from-bottom-4">
             <div className="grid grid-cols-4 gap-4">
               {[{id:'salon', n:'Salon', i:<Lucide.Scissors/>},{id:'travel', n:'Travel', i:<Lucide.Bus/>},{id:'health', n:'Clinic', i:<Lucide.User/>},{id:'repair', n:'More', i:<Lucide.Plus/>}].map(c => (
                 <div key={c.id} className="flex flex-col items-center gap-2">
                   <div className="bg-white p-4 rounded-2xl shadow-sm text-emerald-600">{c.i}</div>
                   <span className="text-[9px] font-bold uppercase">{c.n}</span>
                 </div>
               ))}
             </div>
             <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Live Stores</h2>
             <div className="space-y-4">
               {stores.filter(s => s.isLive).map(s => (
                 <div key={s.id} onClick={() => { setSelectedStore(s); setView('store_detail'); setCart([]); }} className="bg-white p-3 rounded-[2.5rem] flex gap-4 items-center shadow-sm active:scale-95 transition-all">
                   <img src={s.image || "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200"} className="w-16 h-16 rounded-[1.5rem] object-cover" />
                   <div className="flex-1">
                      <h3 className="font-bold text-sm">{s.name}</h3>
                      <p className="text-[10px] text-gray-400">{s.address}</p>
                   </div>
                   <Lucide.ChevronRight size={18} className="text-gray-300 mr-2" />
                 </div>
               ))}
               {stores.filter(s => s.isLive).length === 0 && <p className="text-center py-10 text-gray-300 text-xs font-bold">NO STORES ONLINE</p>}
             </div>
          </div>
        )}

        {/* VIEW: STORE DETAIL */}
        {view === 'store_detail' && selectedStore && (
          <div className="pt-4 space-y-6 animate-in slide-in-from-right-4">
            <button onClick={() => setView('home')} className="flex items-center text-emerald-600 font-bold text-[10px] uppercase"><Lucide.ArrowLeft size={14} className="mr-1"/> BACK</button>
            <img src={selectedStore.image} className="w-full h-48 rounded-[2.5rem] object-cover shadow-lg" />
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm">
               <h2 className="text-2xl font-black">{selectedStore.name}</h2>
               <p className="text-gray-400 text-xs mb-6">{selectedStore.address}</p>
               <h3 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Select Services</h3>
               <div className="space-y-2">
                 {selectedStore.services?.map((s, i) => (
                   <div key={i} onClick={() => cart.find(c => c.name === s.name) ? setCart(cart.filter(c => c.name !== s.name)) : setCart([...cart, s])} className={`p-4 rounded-2xl border-2 flex justify-between items-center ${cart.find(c => c.name === s.name) ? 'border-emerald-600 bg-emerald-50' : 'border-gray-50'}`}>
                      <span className="font-bold text-sm">{s.name}</span>
                      <span className="text-emerald-600 font-black text-sm">₹{s.price}</span>
                   </div>
                 ))}
               </div>
            </div>
            {cart.length > 0 && (
               <div className="bg-white p-6 rounded-[2.5rem] shadow-sm space-y-4">
                  <select onChange={e => setBookingMeta({...bookingMeta, staffName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none"><option value="">Any Staff</option>{selectedStore.staff?.map(st => <option key={st} value={st}>{st}</option>)}</select>
                  <input type="date" onChange={e => setBookingMeta({...bookingMeta, date: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                  <div className="grid grid-cols-3 gap-2">
                    {['10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'].map(t => {
                      const avail = checkAvailability(bookingMeta.date, t, bookingMeta.staffName);
                      return <button key={t} disabled={!avail} onClick={() => setBookingMeta({...bookingMeta, time: t})} className={`py-3 rounded-lg text-[10px] font-black ${bookingMeta.time === t ? 'bg-emerald-600 text-white' : !avail ? 'bg-gray-100 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>{t}</button>
                    })}
                  </div>
                  <input placeholder="Your Name" value={bookingMeta.custName} onChange={e => setBookingMeta({...bookingMeta, custName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                  <input placeholder="Phone Number" type="tel" value={bookingMeta.custPhone} onChange={e => setBookingMeta({...bookingMeta, custPhone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold text-sm outline-none" />
                  <button onClick={finalizeBooking} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black shadow-xl uppercase">Confirm Booking</button>
               </div>
            )}
          </div>
        )}

        {/* VIEW: BOOKINGS SEARCH */}
        {view === 'bookings' && (
          <div className="pt-4 space-y-6">
             <h2 className="text-2xl font-black text-emerald-900 uppercase tracking-tighter">Find Booking</h2>
             <div className="flex gap-2">
                <input placeholder="Enter ID (CH-XXXX)" value={bookingIdSearch} onChange={e => setBookingIdSearch(e.target.value)} className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 font-bold uppercase outline-none" />
                <button onClick={handleBookingSearch} className="bg-emerald-600 text-white p-4 rounded-2xl shadow-lg"><Lucide.Search/></button>
             </div>
             
             {searchResult === "NOT_FOUND" && <p className="text-center text-rose-500 font-black text-[10px] uppercase">ID Not Found. Try Again.</p>}
             {searchResult && searchResult !== "NOT_FOUND" && (
                <div className="bg-emerald-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-in zoom-in-95">
                   <h3 className="text-xl font-black mb-1">{searchResult.storeName}</h3>
                   <p className="text-[10px] font-black uppercase opacity-60 mb-4">ID: {searchResult.displayId}</p>
                   <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Date:</span><span className="font-bold">{searchResult.date}</span></div>
                      <div className="flex justify-between"><span>Time:</span><span className="font-bold">{searchResult.time}</span></div>
                      <div className="flex justify-between"><span>Expert:</span><span className="font-bold">{searchResult.staffName || 'Any'}</span></div>
                   </div>
                   <button onClick={() => setSearchResult(null)} className="w-full mt-6 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase">Close</button>
                </div>
             )}
          </div>
        )}

        {/* VIEW: MERCHANT DASHBOARD */}
        {view === 'dashboard' && profile.role === 'vendor' && (
          <div className="pt-4 space-y-6">
             <div className="flex justify-between items-center"><h2 className="text-2xl font-black text-emerald-900">{profile.businessName}</h2><button onClick={() => setView('home')} className="text-gray-400"><Lucide.XCircle/></button></div>
             
             <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Update Store Info</h3>
                <input placeholder="Shop Name" value={editStore.name} onChange={e => setEditStore({...editStore, name: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold outline-none" />
                <input placeholder="Address" value={editStore.addr} onChange={e => setEditStore({...editStore, addr: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold outline-none" />
                <input placeholder="Image URL (Paste from Web)" value={editStore.img} onChange={e => setEditStore({...editStore, img: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold outline-none" />
                <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { name: editStore.name, address: editStore.addr, image: editStore.img }); alert("Store Updated!"); }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black">Save Changes</button>
             </section>

             <section className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Visibility</h3>
                <button onClick={() => { const s = stores.find(st => st.ownerId === profile.businessId); updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', profile.businessId), { isLive: !s.isLive }); }} className={`w-full py-4 rounded-2xl font-black uppercase shadow-md ${stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white'}`}>{stores.find(s => s.ownerId === profile.businessId)?.isLive ? 'Stop Selling' : 'Go Live'}</button>
             </section>
          </div>
        )}

        {/* VIEW: MERCHANT HUB (LOGIN/APPLY) */}
        {(view === 'vendor_login' || view === 'vendor_portal') && profile.role !== 'vendor' && (
           <div className="pt-4 space-y-6">
              <div className="flex bg-gray-200 p-1.5 rounded-2xl mb-4">
                <button onClick={() => setView('vendor_login')} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase ${view === 'vendor_login' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}>Login</button>
                <button onClick={() => setView('vendor_portal')} className={`flex-1 py-3 text-[10px] font-black rounded-xl uppercase ${view === 'vendor_portal' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}>Apply</button>
              </div>
              {view === 'vendor_login' ? (
                <div className="bg-white p-8 rounded-[2.5rem] space-y-4 shadow-sm">
                   <input placeholder="Merchant ID" value={vendorAuth.id} onChange={e => setVendorAuth({...vendorAuth, id: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold outline-none" />
                   <input type="password" placeholder="Passcode" value={vendorAuth.pass} onChange={e => setVendorAuth({...vendorAuth, pass: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold outline-none" />
                   <button onClick={handleMerchantLogin} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase">Enter Dashboard</button>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-[2.5rem] space-y-4 shadow-sm">
                   <input placeholder="Store Name" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold outline-none" />
                   <input placeholder="Location in Chiplun" value={regForm.addr} onChange={e => setRegForm({...regForm, addr: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl font-bold outline-none" />
                   <button onClick={handleApply} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase">Submit App</button>
                </div>
              )}
           </div>
        )}

        {/* VIEW: ADMIN CORE */}
        {view === 'admin_auth' && (
           <div className="pt-20 text-center animate-in zoom-in-95">
              <Lucide.Lock className="mx-auto text-emerald-600 mb-4" size={40} />
              <input type="password" maxLength={6} value={adminPin} onChange={e => setAdminPin(e.target.value)} className="w-48 text-center text-6xl font-black border-b-4 outline-none py-4 text-emerald-600 border-gray-100 mb-10" />
              <button onClick={() => { if(adminPin === ADMIN_PIN) setView('admin_panel'); else { setAdminPin(''); alert("WRONG PIN"); }}} className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black uppercase tracking-widest">Unlock Admin</button>
           </div>
        )}

        {view === 'admin_panel' && (
          <div className="pt-4 space-y-8">
             <h2 className="text-2xl font-black uppercase tracking-tighter">Management</h2>
             
             <section className="space-y-4">
                <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1">Pending Requests ({requests.filter(r => r.status === 'pending').length})</h3>
                {requests.filter(r => r.status === 'pending').map(req => (
                  <div key={req.id} className="bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm space-y-4">
                     <div><h4 className="font-bold text-lg leading-none">{req.bizName}</h4><p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">{req.addr}</p></div>
                     <div className="bg-gray-50 p-4 rounded-2xl space-y-2">
                        <input id={`id-${req.id}`} placeholder="Issue Merchant ID" className="w-full bg-white p-2 rounded text-xs font-bold outline-none" />
                        <input id={`pw-${req.id}`} placeholder="Set Passcode" className="w-full bg-white p-2 rounded text-xs font-bold outline-none" />
                     </div>
                     <button onClick={async () => {
                        const mid = document.getElementById(`id-${req.id}`).value;
                        const mpw = document.getElementById(`pw-${req.id}`).value;
                        if(!mid || !mpw) return;
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vendor_creds', mid), { password: mpw, uid: req.uid, businessName: req.bizName });
                        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', req.uid), { name: req.bizName, address: req.addr, ownerId: req.uid, isLive: false, services: [], staff: [], rating: 5.0, image: "" });
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', req.id));
                     }} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-xs uppercase">Approve Merchant</button>
                  </div>
                ))}
             </section>

             <section className="space-y-4">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Active Directory ({stores.length})</h3>
                {stores.map(s => (
                  <div key={s.id} className="bg-white p-4 rounded-[2rem] shadow-sm flex items-center gap-4">
                     <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-bold text-gray-400">{s.name[0]}</div>
                     <div className="flex-1 font-bold text-sm">{s.name}</div>
                     <button onClick={async () => { if(confirm("Delete store?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stores', s.id)); }} className="p-2 text-rose-500"><Lucide.Trash2 size={18}/></button>
                  </div>
                ))}
             </section>
          </div>
        )}

        {/* VIEW: CONFIRMATION */}
        {view === 'confirmation' && (
           <div className="text-center pt-24 animate-in zoom-in-90">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 animate-bounce"><Lucide.CheckCircle2 size={48}/></div>
             <h2 className="text-4xl font-black text-emerald-900 mb-1 uppercase tracking-tighter">SECURED</h2>
             <div className="bg-white p-8 rounded-[3rem] shadow-xl border-2 border-emerald-50 mx-4 my-10">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Unique Booking ID</p>
                <h3 className="text-5xl font-black text-emerald-600 tracking-widest">{lastGeneratedId}</h3>
                <p className="text-[9px] font-bold text-emerald-900 mt-4 uppercase bg-emerald-50 inline-block px-4 py-1 rounded-full">Save or Screenshot this ID</p>
             </div>
             <button onClick={() => setView('home')} className="w-full bg-emerald-700 text-white py-5 rounded-[2.5rem] font-black shadow-2xl">DONE</button>
           </div>
        )}

      </main>

      {/* NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-gray-100 px-8 py-5 pb-9 flex justify-between items-center z-50 rounded-t-[3.5rem] shadow-2xl">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'home' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Home size={22} /><span className="text-[9px] font-black uppercase">Explore</span></button>
        <button onClick={() => setView(profile.role === 'vendor' ? 'dashboard' : 'vendor_login')} className={`flex flex-col items-center gap-1.5 transition-all ${['vendor_portal', 'vendor_login', 'dashboard'].includes(view) ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.LayoutDashboard size={22} /><span className="text-[9px] font-black uppercase">Business</span></button>
        <button onClick={() => { setView('bookings'); setSearchResult(null); }} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'bookings' ? 'text-emerald-600 scale-110' : 'text-gray-300'}`}><Lucide.Calendar size={22} /><span className="text-[9px] font-black uppercase">Bookings</span></button>
        <button className="flex flex-col items-center gap-1.5 text-gray-300"><Lucide.User size={22} /><span className="text-[9px] font-black uppercase">Account</span></button>
      </nav>

    </div>
  );
}

