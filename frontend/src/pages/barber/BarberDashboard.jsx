import React, { useEffect, useState } from "react";
import axios from "axios";

const BarberDashboard = () => {
  const [stats, setStats] = useState({
    todayBookings: 0,
    completedBookings: 0,
    pendingBookings: 0,
    totalEarnings: 0,
  });

  const [todayList, setTodayList] = useState([]);
  const [loading, setLoading] = useState(true);

  const barberId = localStorage.getItem("barberId");

  // Fetch Dashboard Data
  const fetchBarberDashboard = async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_API_URL}/api/barber/dashboard/${barberId}`
      );

      setStats(res.data.stats);
      setTodayList(res.data.todayBookings);
      setLoading(false);
    } catch (error) {
      console.error("Dashboard error:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarberDashboard();
  }, []);

  if (loading) return <p className="spinner">Loading Dashboard...</p>;

  return (
    <div className="barber-dashboard">
      <h1>Welcome Barber / Salon Owner</h1>

      {/* STATS CARDS */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Today's Bookings</h3>
          <p>{stats.todayBookings}</p>
        </div>

        <div className="stat-card">
          <h3>Completed</h3>
          <p>{stats.completedBookings}</p>
        </div>

        <div className="stat-card">
          <h3>Pending</h3>
          <p>{stats.pendingBookings}</p>
        </div>

        <div className="stat-card">
          <h3>Total Earnings (₹)</h3>
          <p>{stats.totalEarnings}</p>
        </div>
      </div>

      {/* TODAY’S BOOKINGS LIST */}
      <div className="today-bookings">
        <h2>Today's Appointments</h2>

        {todayList.length === 0 ? (
          <p>No bookings for today</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Time</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {todayList.map((b) => (
                <tr key={b._id}>
                  <td>{b.customer?.name}</td>
                  <td>{b.serviceName}</td>
                  <td>{b.time}</td>
                  <td>₹{b.totalAmount}</td>
                  <td className={`status ${b.status}`}>{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .barber-dashboard {
          padding: 20px;
          font-family: Arial, sans-serif;
        }
        h1 {
          font-size: 26px;
          margin-bottom: 20px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 25px;
        }
        .stat-card {
          background: #fff;
          padding: 18px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
        }
        .stat-card h3 {
          margin-bottom: 10px;
          font-size: 17px;
        }
        .stat-card p {
          font-size: 24px;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        table th, table td {
          border-bottom: 1px solid #ddd;
          padding: 12px;
        }
        .status.completed { color: green; font-weight: bold; }
        .status.pending { color: orange; font-weight: bold; }
        .status.cancelled { color: red; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default BarberDashboard;
