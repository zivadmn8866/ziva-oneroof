// backend/controllers/bookingController.js

const Booking = require('../models/Booking');
const Customer = require('../models/Customer');

// Try to require Barber, fallback to Business if present
let Barber;
try {
  Barber = require('../models/Barber');
} catch (e) {
  try {
    Barber = require('../models/Business');
  } catch (e2) {
    Barber = null;
  }
}

/**
 * Create a new booking
 * Expects: { customerId, barberId, serviceId, date, time, location, paymentMethod }
 */
exports.createBooking = async (req, res) => {
  try {
    const { customerId, barberId, serviceId, date, time, location = {}, paymentMethod } = req.body;

    if (!customerId || !barberId || !serviceId || !date || !time || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Ensure barber model is available
    if (!Barber) return res.status(500).json({ error: 'Provider model not available on server' });

    const barber = await Barber.findById(barberId);
    if (!barber) return res.status(404).json({ error: 'Barber / Provider not found' });

    // Find the service inside barber.services
    const service = (barber.services || []).find((s) => {
      if (!s) return false;
      // s._id might be ObjectId or string
      return s._id?.toString() === serviceId?.toString() || String(s._id) === String(serviceId);
    });

    if (!service) return res.status(404).json({ error: 'Requested service not found for this provider' });

    // Calculate amounts
    let totalAmount = Number(service.price || 0);
    let homeServiceFee = 0;

    if (location.type === 'home' || location.type === 'house' || location.type === 'home_service') {
      homeServiceFee = Number(barber.homeServiceFee || 0);
      totalAmount += homeServiceFee;
    }

    const commissionRate = Number(barber.commissionRatePercent ?? barber.commissionRate ?? 20); // support both fields
    const commission = Math.round((totalAmount * commissionRate) / 100);
    const barberAmount = Math.max(0, totalAmount - commission);

    // Create booking document
    const booking = new Booking({
      customerId,
      barberId,
      serviceId,
      serviceName: service.name || '',
      date: new Date(date),
      time,
      duration: service.duration || null,
      location,
      price: Number(service.price || 0),
      commission,
      discountApplied: 0,
      homeServiceFee,
      totalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'unpaid' : 'unpaid', // server should verify on payment success
      status: 'pending'
    });

    await booking.save();

    // Update barber stats atomically if possible
    barber.totalBookings = (barber.totalBookings || 0) + 1;
    // ensure earnings shape exists
    barber.earnings = barber.earnings || { today: 0, month: 0, total: 0 };
    await barber.save();

    // OPTIONAL: emit socket event for new booking (if you pass io to controllers)
    // req.app.get('io')?.to(`barber-${barberId}`).emit('new-booking', booking);

    res.status(201).json({
      success: true,
      booking: {
        id: booking._id,
        status: booking.status,
        totalAmount: booking.totalAmount,
        date: booking.date,
        time: booking.time
      }
    });
  } catch (err) {
    console.error('createBooking error:', err);
    res.status(500).json({ error: err.message || 'Server error creating booking' });
  }
};

/**
 * Get bookings for a customer
 * URL: GET /api/booking/customer/:customerId?status=pending
 */
exports.getCustomerBookings = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status } = req.query;

    if (!customerId) return res.status(400).json({ error: 'Missing customerId parameter' });

    const query = { customerId };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate('barberId', 'businessName name rating reviewCount location')
      .sort({ date: -1, time: 1 });

    res.json({ success: true, bookings });
  } catch (err) {
    console.error('getCustomerBookings error:', err);
    res.status(500).json({ error: err.message || 'Server error fetching bookings' });
  }
};

/**
 * Get bookings for a barber/provider
 * URL: GET /api/booking/barber/:barberId?date=YYYY-MM-DD&status=confirmed
 */
exports.getBarberBookings = async (req, res) => {
  try {
    const { barberId } = req.params;
    const { date, status } = req.query;

    if (!barberId) return res.status(400).json({ error: 'Missing barberId parameter' });

    const query = { barberId };
    if (status) query.status = status;

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const bookings = await Booking.find(query)
      .populate('customerId', 'name phone profileImage')
      .sort({ date: 1, time: 1 });

    res.json({ success: true, bookings });
  } catch (err) {
    console.error('getBarberBookings error:', err);
    res.status(500).json({ error: err.message || 'Server error fetching bookings' });
  }
};

/**
 * Accept (confirm) a booking
 * PATCH /api/booking/:bookingId/accept
 */
exports.acceptBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId parameter' });

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'confirmed', updatedAt: new Date() },
      { new: true }
    );

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // OPTIONAL: notify customer/barber via socket or push
    // req.app.get('io')?.to(`booking-${bookingId}`).emit('status-changed', booking);

    res.json({ success: true, booking });
  } catch (err) {
    console.error('acceptBooking error:', err);
    res.status(500).json({ error: err.message || 'Server error accepting booking' });
  }
};

/**
 * Complete booking: mark as completed, update earnings and loyalty
 * PATCH /api/booking/:bookingId/complete
 */
exports.completeBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId parameter' });

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: 'completed', completedAt: new Date(), paymentStatus: 'paid', updatedAt: new Date() },
      { new: true }
    );

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Update barber earnings (safely)
    if (booking.barberId) {
      const barber = await Barber.findById(booking.barberId);
      if (barber) {
        barber.earnings = barber.earnings || { today: 0, month: 0, total: 0 };
        const barberEarning = Math.max(0, (booking.totalAmount || 0) - (booking.commission || 0));
        barber.earnings.today = (barber.earnings.today || 0) + barberEarning;
        barber.earnings.month = (barber.earnings.month || 0) + barberEarning;
        barber.earnings.total = (barber.earnings.total || 0) + barberEarning;
        await barber.save();
      }
    }

    // Add loyalty points to customer (10 points = ₹1)
    if (booking.customerId) {
      const customer = await Customer.findById(booking.customerId);
      if (customer) {
        const points = Math.round((booking.totalAmount || 0) * 10); // e.g. ₹1 => 10 points
        customer.loyaltyPoints = (customer.loyaltyPoints || 0) + points;
        await customer.save();
      }
    }

    // OPTIONAL: emit events
    // req.app.get('io')?.to(`booking-${bookingId}`).emit('status-changed', booking);

    res.json({ success: true, booking });
  } catch (err) {
    console.error('completeBooking error:', err);
    res.status(500).json({ error: err.message || 'Server error completing booking' });
  }
};

/**
 * Submit review for a booking and update barber ratings
 * POST /api/booking/:bookingId/review
 */
exports.submitReview = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { overall, serviceQuality, hygiene, behavior, value, review, photos = [] } = req.body;

    if (!bookingId) return res.status(400).json({ error: 'Missing bookingId parameter' });

    const ratingObj = {
      overall: Number(overall || 0),
      serviceQuality: Number(serviceQuality || 0),
      hygiene: Number(hygiene || 0),
      behavior: Number(behavior || 0),
      value: Number(value || 0),
      review: review || '',
      photos,
      ratedAt: new Date()
    };

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        isReviewed: true,
        rating: ratingObj,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Recalculate barber rating based on all reviewed bookings
    if (booking.barberId) {
      const barberId = booking.barberId;
      const reviewedBookings = await Booking.find({ barberId, isReviewed: true, 'rating.overall': { $exists: true } });

      if (reviewedBookings.length > 0) {
        const avg = reviewedBookings.reduce((sum, b) => sum + (b.rating?.overall || 0), 0) / reviewedBookings.length;
        const barber = await Barber.findById(barberId);
        if (barber) {
          barber.rating = Math.round(avg * 10) / 10; // one decimal place
          barber.reviewCount = reviewedBookings.length;
          await barber.save();
        }
      }
    }

    res.json({ success: true, booking });
  } catch (err) {
    console.error('submitReview error:', err);
    res.status(500).json({ error: err.message || 'Server error submitting review' });
  }
};
