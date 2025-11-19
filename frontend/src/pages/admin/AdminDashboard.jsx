import React, { useEffect, useState } from "react";
import axios from "axios";

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalBarbers: 0,
    totalBookings: 0,
    totalEarnings: 0,
  });

  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Admin Dashboard Stats
  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/admin/dashboard`);
      setStats(res.data.stats);
      setRecentBookings(res.data.recentBookings);
      setLoading(false);
    } catch (error) {
      console.error("Dashboard Error:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) return <p className="spinner">Loading Dashboard...</p>;

  return (
    <div className="admin-dashboard">
      <h1>ZIVA — Admin Dashboard</h1>

      {/* Statistics Section */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Customers</h3>
          <p>{stats.totalCustomers}</p>
        </div>

        <div className="stat-card">
          <h3>Total Barbers / Parlours</h3>
          <p>{stats.totalBarbers}</p>
        </div>

        <div className="stat-card">
          <h3>Total Bookings</h3>
          <p>{stats.totalBookings}</p>
        </div>

        <div className="stat-card">
          <h3>Total Earnings (₹)</h3>
          <p>{stats.totalEarnings}</p>
        </div>
      </div>

      {/* Recent Bookings */}
      <div className="recent-bookings">
        <h2>Recent Bookings</h2>

        {recentBookings.length === 0 ? (
          <p>No recent bookings</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Barber / Salon</th>
                <th>Service</th>
                <th>Status</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {recentBookings.map((b) => (
                <tr key={b._id}>
                  <td>{b.customer?.name}</td>
                  <td>{b.barber?.shopName}</td>
                  <td>{b.serviceName}</td>
                  <td className={`status ${b.status}`}>{b.status}</td>
                  <td>{b.totalAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .admin-dashboard {
          padding: 20px;
          font-family: sans-serif;
        }

        h1 {
          font-size: 28px;
          margin-bottom: 20px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
        }

        .stat-card {
          background: #fff;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
        }

        .stat-card h3 {
          font-size: 18px;
          margin-bottom: 10px;
        }

        .stat-card p {
          font-size: 26px;
          font-weight: bold;
        }

        .recent-bookings table {
          width: 100%;
          margin-top: 20px;
          border-collapse: collapse;
        }

        table th, table td {
          border-bottom: 1px solid #ddd;
          padding: 12px;
          text-align: left;
        }

        .status.completed { color: green; }
        .status.pending { color: orange; }
        .status.cancelled { color: red; }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
