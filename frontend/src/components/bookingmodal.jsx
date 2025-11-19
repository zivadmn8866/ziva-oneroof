import React, { useState } from "react";
import axios from "axios";

const BookingModal = ({ barber, service, onClose, customerId }) => {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [locationType, setLocationType] = useState("shop");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [loading, setLoading] = useState(false);

  const handleBooking = async () => {
    if (!date || !time) {
      alert("Please select date & time");
      return;
    }

    if (locationType === "home" && address.trim() === "") {
      alert("Please enter home address");
      return;
    }

    const payload = {
      customerId,
      barberId: barber._id,
      serviceId: service._id,
      date,
      time,
      location: {
        type: locationType,
        address: address || "Salon Shop",
      },
      paymentMethod,
    };

    try {
      setLoading(true);
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/bookings/create`,
        payload
      );

      setLoading(false);
      alert("Booking Successful!");
      onClose();
    } catch (error) {
      console.error("Booking Error:", error);
      setLoading(false);
      alert("Booking Failed");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2>Confirm Booking</h2>

        {/* Barber + Service Info */}
        <div className="info-box">
          <p><strong>Barber:</strong> {barber.shopName}</p>
          <p><strong>Service:</strong> {service.name}</p>
          <p><strong>Price:</strong> ₹{service.price}</p>
          {locationType === "home" && (
            <p><strong>Home Service Fee:</strong> ₹{barber.homeServiceFee}</p>
          )}
        </div>

        {/* Date */}
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        {/* Time */}
        <label>Time</label>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />

        {/* Location Type */}
        <label>Location</label>
        <select
          value={locationType}
          onChange={(e) => setLocationType(e.target.value)}
        >
          <option value="shop">At Salon Shop</option>
          <option value="home">Home Service</option>
        </select>

        {/* Address */}
        {locationType === "home" && (
          <>
            <label>Home Address</label>
            <textarea
              placeholder="Enter full address…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </>
        )}

        {/* Payment Method */}
        <label>Payment Method</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          <option value="upi">Pay Using UPI</option>
          <option value="wallet">Pay Using Wallet</option>
        </select>

        {/* Buttons */}
        <div className="button-row">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button disabled={loading} className="confirm-btn" onClick={handleBooking}>
            {loading ? "Processing..." : "Confirm Booking"}
          </button>
        </div>
      </div>

      {/* MODAL STYLES */}
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999;
        }
        .modal-box {
          width: 90%;
          max-width: 400px;
          background: #fff;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        h2 {
          margin-bottom: 15px;
          text-align: center;
        }
        label {
          font-weight: bold;
          margin-top: 10px;
          display: block;
        }
        input, select, textarea {
          width: 100%;
          padding: 10px;
          margin-top: 5px;
          border: 1px solid #ccc;
          border-radius: 8px;
        }
        textarea {
          height: 70px;
          resize: none;
        }
        .info-box {
          background: #f7f7f7;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 15px;
        }
        .button-row {
          display: flex;
          justify-content: space-between;
          margin-top: 20px;
        }
        .cancel-btn {
          background: #ccc;
          padding: 10px 15px;
          border: none;
          border-radius: 8px;
        }
        .confirm-btn {
          background: #28a745;
          color: white;
          padding: 10px 15px;
          border: none;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
};

export default BookingModal;
