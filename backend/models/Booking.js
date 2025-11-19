const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },

  barberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Barber',
    required: true
  },

  serviceId: {
    type: String,
    required: true
  },

  serviceName: {
    type: String,
    required: true
  },

  date: { type: Date, required: true },
  time: { type: String, required: true },
  duration: Number,

  location: {
    type: {
      type: String,
      enum: ['salon', 'home'],
      default: 'salon'
    },
    address: String,
    coordinates: {
      type: { type: String, default: 'Point' },
      coordinates: [Number]   // [longitude, latitude]
    }
  },

  price: { type: Number, required: true },
  commission: Number,
  discountApplied: { type: Number, default: 0 },
  homeServiceFee: { type: Number, default: 0 },

  totalAmount: { type: Number, required: true },

  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'refunded'],
    default: 'unpaid'
  },

  paymentMethod: {
    type: String,
    enum: ['wallet', 'upi', 'card', 'netbanking'],
    default: 'wallet'
  },

  transactionId: String,

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },

  customerNotes: String,
  barberNotes: String,
  cancellationReason: String,

  rating: {
    overall: { type: Number, min: 1, max: 5 },
    serviceQuality: { type: Number, min: 1, max: 5 },
    hygiene: { type: Number, min: 1, max: 5 },
    behavior: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    review: String,
    photos: [String],
    ratedAt: Date
  },

  isReviewed: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  scheduledAt: Date,
  completedAt: Date,
  cancelledAt: Date
});

// 🚀 Useful indexes for performance
bookingSchema.index({ customerId: 1, date: 1 });
bookingSchema.index({ barberId: 1, date: 1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
