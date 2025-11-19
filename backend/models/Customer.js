const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  phone: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true,
    select: false   // hides password by default
  },

  profileImage: String,

  // 💰 Wallet
  wallet: {
    balance: { type: Number, default: 0 },
    transactions: [
      {
        type: { type: String }, // credit / debit
        amount: Number,
        previousBalance: Number,
        newBalance: Number,
        reference: String, // bookingId / razorpay / refund
        date: { type: Date, default: Date.now }
      }
    ]
  },

  loyaltyPoints: { type: Number, default: 0 },

  tier: {
    type: String,
    enum: ['silver', 'gold', 'platinum'],
    default: 'silver'
  },

  bookmarkedBarbers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barber'
    }
  ],

  // ⭐ User preferences
  preferences: {
    serviceType: [String],
    priceRange: String,
    distance: Number,
    preferredLocation: {
      lat: Number,
      lng: Number
    }
  },

  // 📍 Saved addresses
  addresses: [
    {
      type: String,
      isPrimary: Boolean,
      lat: Number,
      lng: Number
    }
  ],

  referralCode: String,
  referralBonus: { type: Number, default: 0 },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 🔍 Index for faster queries
customerSchema.index({ email: 1 });

module.exports = mongoose.model('Customer', customerSchema);
