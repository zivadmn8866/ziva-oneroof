// frontend-customer/src/pages/CustomerDashboard.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Customer Dashboard
 * - Shows upcoming bookings, recent past bookings
 * - Shows wallet balance and loyalty points
 * - Quick actions: Book a service, Go to Wallet, View Bookings
 *
 * Expects: REACT_APP_API_URL in env, and customerId stored in localStorage/session (adjust as needed)
 */

const CustomerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [bookmarks, setBookmarks] = useState([]);
  const customerId = localStorage.getItem('customerId'); // adapt if you have auth context

  const API = process.env.REACT_APP_API_URL || '';

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    fetchDashboard();
  }, [customerId]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      // parallel requests
      const [bookingsRes, walletRes, profileRes] = await Promise.all([
        axios.get(`${API}/api/customer/bookings?customerId=${customerId}`), // backend should support filtering
        axios.get(`${API}/api/payment/wallet-balance/${customerId}`),
        axios.get(`${API}/api/customer/profile`) // assume token identifies customer on server
      ]);

      const bookings = bookingsRes.data.bookings || bookingsRes.data || [];
      // split upcoming vs past by status / date
      const now = new Date();
      const upcomingList = bookings.filter(b => {
        return b.status !== 'completed' && b.status !== 'cancelled' && new Date(b.date) >= now;
      }).sort((a,b) => new Date(a.date) - new Date(b.date));
      const pastList = bookings.filter(b => {
        return b.status === 'completed' || new Date(b.date) < now;
      }).sort((a,b) => new Date(b.date) < new Date(a.date) ? -1 : 1);

      setUpcoming(upcomingList.slice(0, 6));
      setPast(pastList.slice(0, 6));

      setWallet({
        balance: walletRes.data.balance ?? 0,
        transactions: walletRes.data.transactions ?? []
      });

      const profile = profileRes.data.customer || profileRes.data;
      setLoyaltyPoints(profile?.loyaltyPoints ?? 0);
      setBookmarks(profile?.bookmarkedBarbers ?? []);

    } catch (err) {
      console.error('Dashboard fetch error', err);
    } finally {
      setLoading(false);
    }
  }

  const handleCancel = async (bookingId) => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await axios.delete(`${API}/api/customer/bookings/${bookingId}`);
      // optimistic UI update
      setUpcoming(prev => prev.filter(b => b._id !== bookingId));
    } catch (err) {
      console.error('Cancel error', err);
      alert('Unable to cancel booking');
    }
  };

  const goToBooking = (id) => {
    // change to your router nav (example with window.location)
    window.location.href = `/bookings/${id}`;
  };

  const openSearch = () => {
    window.location.href = '/search';
  };

  const openWallet = () => {
    window.location.href = '/wallet';
  };

  if (loading) {
    return (
      <div className="center">
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="customer-dashboard">
      <header className="topbar">
        <h1>Welcome back 👋</h1>
        <div className="top-actions">
          <button className="btn" onClick={openSearch}>Book a Service</button>
          <button className="btn outline" onClick={openWallet}>Wallet ₹{wallet.balance}</button>
        </div>
      </header>

      <section className="cards">
        <div className="card">
          <h3>Wallet</h3>
          <p className="big">₹{wallet.balance}</p>
          <small onClick={openWallet} className="link">Top up / Transactions</small>
        </div>

        <div className="card">
          <h3>Loyalty</h3>
          <p className="big">{loyaltyPoints} pts</p>
          <small className="muted">10 pts = ₹1</small>
        </div>

        <div className="card">
          <h3>Bookmarks</h3>
          <p className="big">{bookmarks.length}</p>
          <small className="muted">Saved barbers & salons</small>
        </div>
      </section>

      <section className="list-section">
        <h2>Upcoming Appointments</h2>
        {upcoming.length === 0 ? (
          <div className="empty">No upcoming bookings. <button className="link" onClick={openSearch}>Find a barber</button></div>
        ) : (
          <div className="list">
            {upcoming.map(b => (
              <div key={b._id} className="list-item">
                <div className="left">
                  <div className="title">{b.serviceName}</div>
                  <div className="meta">{b.barber?.shopName || b.barber?.businessName || '—'}</div>
                  <div className="meta small">{new Date(b.date).toLocaleDateString()} • {b.time}</div>
                </div>
                <div className="right">
                  <div className={`status ${b.status}`}>{b.status}</div>
                  <div className="actions">
                    <button className="btn small" onClick={() => goToBooking(b._id)}>View</button>
                    {b.status !== 'completed' && b.status !== 'cancelled' && (
                      <button className="btn danger small" onClick={() => handleCancel(b._id)}>Cancel</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="list-section">
        <h2>Recent Visits</h2>
        {past.length === 0 ? (
          <div className="empty">No past bookings</div>
        ) : (
          <div className="list">
            {past.map(b => (
              <div key={b._id} className="list-item">
                <div className="left">
                  <div className="title">{b.serviceName}</div>
                  <div className="meta">{b.barber?.shopName || b.barber?.businessName || '—'}</div>
                  <div className="meta small">{new Date(b.date).toLocaleDateString()}</div>
                </div>
                <div className="right">
                  <div className={`status ${b.status}`}>{b.status}</div>
                  <div className="actions">
                    <button className="btn small" onClick={() => goToBooking(b._id)}>Details</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .customer-dashboard { padding: 20px; font-family: Inter, Arial, sans-serif; max-width: 980px; margin: 0 auto; }
        .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
        .topbar h1 { margin:0; font-size:22px; }
        .top-actions .btn { margin-left:10px; }
        .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:18px; }
        .card { background:#fff; padding:14px; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
        .card h3 { margin:0 0 6px 0; font-size:14px; color:#555; }
        .big { font-size:20px; font-weight:700; margin:6px 0; }
        .muted { color:#777; font-size:12px; }
        .list-section { margin-top:18px; }
        .list { display:flex; flex-direction:column; gap:10px; }
        .list-item { display:flex; justify-content:space-between; align-items:center; background:#fff; padding:12px; border-radius:10px; box-shadow:0 1px 6px rgba(0,0,0,0.04); }
        .title { font-weight:600; }
        .meta { color:#666; font-size:13px; margin-top:4px; }
        .meta.small { color:#999; font-size:12px; }
        .status { padding:6px 10px; border-radius:18px; font-weight:600; text-transform:capitalize; }
        .status.pending { background:#fff7e6; color:#b36b00; }
        .status.confirmed { background:#e6f7ff; color:#0971b2; }
        .status.in-progress { background:#fff0f6; color:#bf3b82; }
        .status.completed { background:#e6ffed; color:#1f8a3d; }
        .status.cancelled { background:#ffecec; color:#b30000; }
        .actions { display:flex; gap:8px; margin-top:6px; }
        .btn { padding:8px 12px; border-radius:8px; border:none; background:#1976d2; color:#fff; cursor:pointer; }
        .btn.small { padding:6px 8px; font-size:13px; }
        .btn.outline { background:transparent; border:1px solid #1976d2; color:#1976d2; }
        .btn.danger { background:#d32f2f; }
        .btn.danger.small { background:#d32f2f; padding:6px 8px; }
        .link { color:#1976d2; cursor:pointer; text-decoration:underline; background:none; border:none; padding:0; }
        .empty { color:#666; padding:12px 0; }
        .center { padding:40px; text-align:center; }
      `}</style>
    </div>
  );
};

export default CustomerDashboard;
