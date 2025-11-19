// backend/controllers/authController.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Customer = require('../models/Customer');

// Try to require Barber, fallback to Business model if file named Business.js
let Provider;
try {
  Provider = require('../models/Barber');
} catch (err) {
  try {
    Provider = require('../models/Business');
  } catch (err2) {
    Provider = null;
  }
}

// TODO: replace with your real mailer util
const { sendResetEmail } = require('../utils/mailer') || {
  sendResetEmail: async () => {
    console.warn('sendResetEmail not implemented — implement with SendGrid/SES/etc.');
  }
};

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
const ACCESS_EXPIRES = '7d';
const REFRESH_EXPIRES = '30d';

// Helper: generate access token
function generateAccessToken(id, type) {
  return jwt.sign({ id, type }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

// Helper: generate refresh token
function generateRefreshToken(id, type) {
  return jwt.sign({ id, type }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

// Helper: set refresh token cookie
function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}

// Register Customer
exports.registerCustomer = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existing = await Customer.findOne({ $or: [{ email }, { phone }] });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const customer = new Customer({
      name,
      email,
      phone,
      password: hashed,
      referralCode
    });

    await customer.save();

    const accessToken = generateAccessToken(customer._id, 'customer');
    const refreshToken = generateRefreshToken(customer._id, 'customer');
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      token: accessToken,
      user: { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone, type: 'customer' }
    });
  } catch (err) {
    console.error('registerCustomer error', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Register Provider (Barber / Beauty Parlour / Salon)
exports.registerProvider = async (req, res) => {
  if (!Provider) return res.status(500).json({ error: 'Provider model not available on server' });

  try {
    const { name, businessName, email, phone, password, latitude, longitude, address, businessType } = req.body;
    if (!name || !businessName || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existing = await Provider.findOne({ $or: [{ email }, { phone }] });
    if (existing) return res.status(400).json({ error: 'Provider already registered' });

    const hashed = await bcrypt.hash(password, 10);

    const provider = new Provider({
      name,
      businessName,
      businessType: businessType || 'barber',
      email,
      phone,
      password: hashed,
      address,
      location: (latitude && longitude) ? { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] } : undefined
    });

    await provider.save();

    const accessToken = generateAccessToken(provider._id, 'provider');
    const refreshToken = generateRefreshToken(provider._id, 'provider');
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      token: accessToken,
      provider: { id: provider._id, name: provider.name, businessName: provider.businessName, email: provider.email, type: 'provider' }
    });
  } catch (err) {
    console.error('registerProvider error', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Login (customer or provider)
exports.login = async (req, res) => {
  try {
    const { email, password, userType } = req.body;
    if (!email || !password || !userType) return res.status(400).json({ error: 'email, password and userType required' });

    let user = null;
    if (userType === 'customer') {
      user = await Customer.findOne({ email }).select('+password');
    } else if (userType === 'provider') {
      if (!Provider) return res.status(500).json({ error: 'Provider model not available' });
      user = await Provider.findOne({ email }).select('+password');
    } else {
      return res.status(400).json({ error: 'Invalid userType' });
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = generateAccessToken(user._id, userType);
    const refreshToken = generateRefreshToken(user._id, userType);
    setRefreshCookie(res, refreshToken);

    // return public user fields
    const publicUser = { id: user._id, name: user.name, email: user.email, type: userType };

    res.json({ success: true, token: accessToken, user: publicUser });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Refresh token endpoint
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: 'No refresh token' });

    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    const accessToken = generateAccessToken(decoded.id, decoded.type);
    // optional: issue new refresh token and set cookie
    const newRefresh = generateRefreshToken(decoded.id, decoded.type);
    setRefreshCookie(res, newRefresh);

    res.json({ success: true, token: accessToken });
  } catch (err) {
    console.error('refreshToken error', err);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// Logout (clear refresh cookie)
exports.logout = async (req, res) => {
  res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'Lax' });
  res.json({ success: true, message: 'Logged out' });
};

// Verify Access Token
exports.verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Forgot Password - create reset token (store hashed token in DB or in-memory store)
exports.forgotPassword = async (req, res) => {
  try {
    const { email, userType } = req.body;
    if (!email || !userType) return res.status(400).json({ error: 'email and userType required' });

    let user;
    if (userType === 'customer') user = await Customer.findOne({ email });
    else if (userType === 'provider') {
      if (!Provider) return res.status(500).json({ error: 'Provider model not available' });
      user = await Provider.findOne({ email });
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    // create reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // store hashed token + expiry on user (you must add fields to user model or separate collection)
    user.resetPasswordToken = resetHash;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await user.save();

    // build reset URL (frontend should implement reset page)
    const resetUrl = `${process.env.FRONTEND_URL || ''}/reset-password?token=${resetToken}&id=${user._id}&type=${userType}`;

    // send email (implement sendResetEmail util)
    await sendResetEmail(user.email, resetUrl);

    res.json({ success: true, message: 'Password reset email sent (if account exists)' });
  } catch (err) {
    console.error('forgotPassword error', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, id, userType, newPassword } = req.body;
    if (!token || !id || !userType || !newPassword) return res.status(400).json({ error: 'Missing params' });

    const hashed = crypto.createHash('sha256').update(token).digest('hex');

    let user;
    if (userType === 'customer') user = await Customer.findById(id).select('+password +resetPasswordToken +resetPasswordExpires');
    else if (userType === 'provider') {
      if (!Provider) return res.status(500).json({ error: 'Provider model not available' });
      user = await Provider.findById(id).select('+password +resetPasswordToken +resetPasswordExpires');
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.resetPasswordToken || user.resetPasswordToken !== hashed || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password has been reset' });
  } catch (err) {
    console.error('resetPassword error', err);
    res.status(500).json({ error: 'Server error' });
  }
};
