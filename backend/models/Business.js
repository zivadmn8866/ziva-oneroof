// Business.js
// Ziva - Single Mongoose model for Barber / Beauty Parlour / Salon (ready to paste)
// Usage: drop into your backend/models folder. Designed for MongoDB (Atlas), works with deployments on
// GitHub -> CI, Vercel Serverless Functions, Render, or any Node/Express host.
// Note: Sensitive operations (payment verification, encryption at rest) should be handled server-side
// and/or by the platform (e.g., KMS). This model keeps fields ready for that integration.

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Business types supported by Ziva:
 * - barber (individual barber / small barbershop)
 * - beauty (beauty parlour / aesthetician)
 * - salon (full-service salon)
 *
 * This single model covers all three by design.
 */

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'general' }, // e.g., haircut, facial, manicure
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, required: true, min: 1 }, // minutes
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { _id: true }
);

const weekdaySchema = new Schema(
  {
    open: { type: String, default: '09:00' }, // store as 'HH:mm' strings for simplicity
    close: { type: String, default: '18:00' },
    isOpen: { type: Boolean, default: true }
  },
  { _id: false }
);

const earningsSchema = new Schema(
  {
    today: { type: Number, default: 0 },
    month: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  { _id: false }
);

const bankDetailsSchema = new Schema(
  {
    accountNumber: { type: String }, // consider encrypting in server before saving
    bankName: { type: String },
    ifscCode: { type: String },
    accountHolder: { type: String }
  },
  { _id: false }
);

const barberSchema = new Schema(
  {
    // Core identity
    name: { type: String, required: true, trim: true },
    businessName: { type: String, required: true, trim: true }, // shop / parlour / salon name
    businessType: {
      type: String,
      enum: ['barber', 'beauty', 'salon'],
      default: 'barber'
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },

    // Auth
    password: { type: String, required: true, select: false },

    // Media
    profileImage: { type: String, default: '' },
    gallery: { type: [String], default: [] },
    coverImage: { type: String, default: '' },

    // Description & tags
    description: { type: String, default: '' },
    tags: { type: [String], default: [] }, // e.g., ["men", "kids", "bridal", "keratin"]

    // Location (GeoJSON Point) - coordinates: [longitude, latitude]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    },
    address: { type: String, default: '' },
    city: { type: String, index: true },
    state: { type: String },
    zipCode: { type: String },

    // Services & pricing
    services: { type: [serviceSchema], default: [] },

    // Schedule
    schedule: {
      weekDays: {
        Monday: { type: weekdaySchema, default: () => ({}) },
        Tuesday: { type: weekdaySchema, default: () => ({}) },
        Wednesday: { type: weekdaySchema, default: () => ({}) },
        Thursday: { type: weekdaySchema, default: () => ({}) },
        Friday: { type: weekdaySchema, default: () => ({}) },
        Saturday: { type: weekdaySchema, default: () => ({}) },
        Sunday: { type: weekdaySchema, default: () => ({}) }
      },
      holidays: { type: [Date], default: [] }
    },

    // Home service options
    homeServiceAvailable: { type: Boolean, default: false },
    homeServiceRadiusKm: { type: Number, default: 5 }, // in km
    homeServiceFee: { type: Number, default: 0 },

    // Reputation & stats
    rating: { type: Number, default: 5, min: 1, max: 5 },
    reviewCount: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },

    // Earnings & payouts
    earnings: { type: earningsSchema, default: () => ({}) },
    pendingPayout: { type: Number, default: 0 },

    // Financials - handle with care; encrypt before saving in production
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },

    // Verification & documents
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    documents: {
      idProof: { type: String, default: '' },
      businessLicense: { type: String, default: '' },
      gstProof: { type: String, default: '' }, // optional
      verificationVideo: { type: String, default: '' }
    },

    // Subscription & commercial
    subscriptionTier: {
      type: String,
      enum: ['free', 'silver', 'gold', 'platinum'],
      default: 'free'
    },
    commissionRatePercent: { type: Number, default: 20 }, // platform commission %
    isActive: { type: Boolean, default: true },

    // Wallet (simple client-side friendly shape)
    wallet: {
      balance: { type: Number, default: 0 },
      currency: { type: String, default: 'INR' }
    },

    // Preferences & metadata
    languages: { type: [String], default: [] }, // e.g., ["hi","en"]
    acceptsWalkIns: { type: Boolean, default: true },
    prebookWindowDays: { type: Number, default: 30 }, // how far customers can book

    // Operational metadata
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: false },
    isDeleted: { type: Boolean, default: false }
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/**
 * Indexes
 */
barberSchema.index({ location: '2dsphere' });
barberSchema.index({ city: 1 });
barberSchema.index({ email: 1 });
barberSchema.index({ phone: 1 });

/**
 * Virtuals
 */
barberSchema.virtual('avgRating').get(function () {
  // expose avgRating alias for compatibility
  return this.rating;
});

/**
 * Instance methods
 */
barberSchema.methods.getPublicProfile = function () {
  // Return a sanitized public profile (e.g., for search results / detail page)
  return {
    id: this._id,
    name: this.name,
    businessName: this.businessName,
    businessType: this.businessType,
    profileImage: this.profileImage,
    coverImage: this.coverImage,
    gallery: this.gallery,
    rating: this.rating,
    reviewCount: this.reviewCount,
    totalBookings: this.totalBookings,
    services: this.services.filter(s => s.isActive),
    location: this.location,
    address: this.address,
    city: this.city,
    tags: this.tags,
    homeServiceAvailable: this.homeServiceAvailable,
    subscriptionTier: this.subscriptionTier,
    isActive: this.isActive
  };
};

/**
 * Statics
 */
barberSchema.statics.incrementBooking = async function (barberId, amount = 1) {
  return this.findByIdAndUpdate(
    barberId,
    { $inc: { totalBookings: amount } },
    { new: true }
  ).exec();
};

/**
 * Pre-save hooks
 */
barberSchema.pre('save', function (next) {
  // ensure coordinates length sanity (should be [lng, lat])
  if (this.location && Array.isArray(this.location.coordinates)) {
    if (this.location.coordinates.length !== 2) {
      return next(new Error('location.coordinates must be [longitude, latitude]'));
    }
  }
  next();
});

/**
 * Security note (important for deployments):
 * - Do NOT store plaintext sensitive fields in git or client bundles.
 * - For deployments on Vercel, Render, or any host, prefer:
 *   1) Encrypt bank/account numbers server-side (use KMS or environment secrets).
 *   2) Store secrets in platform env variables (Vercel Env, Render Secrets, GitHub Secrets).
 * - Use Mongoose field-level encryption plugins or encrypt before saving if required.
 */

module.exports = mongoose.model('Business', barberSchema); // model name: Business (covers barber/beauty/salon)
