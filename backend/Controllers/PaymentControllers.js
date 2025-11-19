// backend/controllers/paymentController.js

const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Customer = require('../models/Customer');
const Booking = require('../models/Booking');

// Try to require Barber or Business for any payout/refund logic if needed
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

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper: consistent error response
function handleError(res, err) {
  console.error(err);
  return res.status(500).json({ success: false, error: err.message || 'Server error' });
}

/**
 * Create a Razorpay order to add money to wallet.
 * Request body: { customerId, amount }
 * Response: { orderId, amount, key }
 */
exports.addMoneyToWallet = async (req, res) => {
  try {
    const { customerId, amount } = req.body;
    if (!customerId || !amount) return res.status(400).json({ success: false, error: 'customerId and amount required' });

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

    // optional: enforce minimum top-up
    const MIN_TOPUP = Number(process.env.MIN_TOPUP) || 100;
    if (numericAmount < MIN_TOPUP) {
      return res.status(400).json({ success: false, error: `Minimum amount is ₹${MIN_TOPUP}` });
    }

    // create razorpay order (amount in paise)
    const order = await razorpay.orders.create({
      amount: Math.round(numericAmount * 100),
      currency: 'INR',
      receipt: `wallet_${customerId}_${Date.now()}`,
      notes: { customerId }
    });

    return res.json({
      success: true,
      orderId: order.id,
      amount: numericAmount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * Verify wallet payment (after client-side checkout)
 * Request body: { orderId, paymentId, signature, customerId, amount }
 * On success: credit customer's wallet and record transaction
 */
exports.verifyWalletPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId, paymentId, signature, customerId, amount } = req.body;
    if (!orderId || !paymentId || !signature || !customerId || !amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    // Verify signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');

    if (expectedSignature !== signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    const customer = await Customer.findById(customerId).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const prev = Number(customer.wallet?.balance || 0);
    const creditAmount = Number(amount);

    customer.wallet = customer.wallet || { balance: 0, transactions: [] };
    customer.wallet.balance = prev + creditAmount;

    customer.wallet.transactions = customer.wallet.transactions || [];
    customer.wallet.transactions.push({
      type: 'add_money',
      amount: creditAmount,
      previousBalance: prev,
      newBalance: customer.wallet.balance,
      reference: paymentId,
      date: new Date()
    });

    await customer.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: 'Payment verified and wallet credited',
      newBalance: customer.wallet.balance
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return handleError(res, err);
  }
};

/**
 * Process booking payment.
 * - Wallet: deduct and mark booking paid
 * - Online (upi/card): create Razorpay order and return orderId for client checkout
 *
 * Request body: { bookingId, customerId, paymentMethod }
 */
exports.processBookingPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { bookingId, customerId, paymentMethod } = req.body;
    if (!bookingId || !customerId || !paymentMethod) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'bookingId, customerId and paymentMethod required' });
    }

    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.paymentStatus === 'paid') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Booking already paid' });
    }

    const customer = await Customer.findById(customerId).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const amount = Number(booking.totalAmount || 0);
    if (isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Invalid booking amount' });
    }

    if (paymentMethod === 'wallet') {
      // Ensure sufficient balance
      customer.wallet = customer.wallet || { balance: 0, transactions: [] };
      if (customer.wallet.balance < amount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
      }

      const prevBalance = customer.wallet.balance;
      customer.wallet.balance = prevBalance - amount;
      customer.wallet.transactions.push({
        type: 'booking_payment',
        amount: -amount,
        previousBalance: prevBalance,
        newBalance: customer.wallet.balance,
        reference: bookingId,
        date: new Date()
      });

      // mark booking paid
      booking.paymentStatus = 'paid';
      booking.transactionId = `WALLET_${Date.now()}`;
      await customer.save({ session });
      await booking.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: 'Payment processed via wallet',
        newBalance: customer.wallet.balance,
        bookingId: booking._id
      });
    }

    // For online payment (upi/card/netbanking) create razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `booking_${bookingId}_${Date.now()}`,
      notes: { bookingId, customerId }
    });

    // commit nothing changed (read-only for now)
    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      orderId: order.id,
      amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return handleError(res, err);
  }
};

/**
 * Verify booking payment (client sends returned razorpay fields)
 * Request body: { orderId, paymentId, signature, bookingId, customerId }
 * On success: mark booking paymentStatus: 'paid', save transactionId
 */
exports.verifyBookingPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId, paymentId, signature, bookingId, customerId } = req.body;
    if (!orderId || !paymentId || !signature || !bookingId || !customerId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    // Verify signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expectedSignature !== signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    const booking = await Booking.findById(bookingId).session(session);
    const customer = await Customer.findById(customerId).session(session);

    if (!booking || !customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: 'Booking or Customer not found' });
    }

    // mark booking paid
    booking.paymentStatus = 'paid';
    booking.transactionId = paymentId;
    await booking.save({ session });

    // Optionally credit barber pending payout, update booking status etc.
    // commit
    await session.commitTransaction();
    session.endSession();

    return res.json({ success: true, message: 'Payment verified and booking marked paid', bookingId: booking._id });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return handleError(res, err);
  }
};

/**
 * Refund endpoint (simple flow)
 * Request body: { paymentId, amount, reason, bookingId }
 * Note: you should validate permissions (admin / owner) before issuing refunds.
 */
exports.refundPayment = async (req, res) => {
  try {
    const { paymentId, amount, reason, bookingId } = req.body;
    if (!paymentId || !amount) return res.status(400).json({ success: false, error: 'paymentId and amount required' });

    // Create refund via Razorpay
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(Number(amount) * 100),
      notes: { reason: reason || 'refund', bookingId: bookingId || '' }
    });

    // Optionally update booking/payment status and wallet/transactions
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking) {
        booking.paymentStatus = 'refunded';
        booking.refundInfo = booking.refundInfo || {};
        booking.refundInfo.lastRefund = {
          refundId: refund.id,
          amount,
          reason,
          createdAt: new Date()
        };
        await booking.save();
      }
    }

    return res.json({ success: true, refund });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * Get wallet balance & latest transactions
 * GET /api/payment/wallet-balance/:customerId
 */
exports.getWalletBalance = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!customerId) return res.status(400).json({ success: false, error: 'customerId required' });

    const customer = await Customer.findById(customerId).select('wallet');
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

    const transactions = (customer.wallet.transactions || []).slice(-20).reverse();

    return res.json({
      success: true,
      balance: customer.wallet.balance || 0,
      transactions
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * Optional: Razorpay webhook handler (verify signature header)
 * - Register webhook in Razorpay dashboard
 * - Set webhook secret as RAZORPAY_WEBHOOK_SECRET
 *
 * POST /api/payment/webhook
 */
exports.razorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = JSON.stringify(req.body);
    const signature = req.headers['x-razorpay-signature'];

    if (!signature || !secret) {
      return res.status(400).send('Missing signature or secret');
    }

    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (expected !== signature) {
      return res.status(400).send('Invalid signature');
    }

    // Process webhook events as needed: payment.captured, payment.refunded etc.
    const event = req.body;
    // example:
    // if (event.event === 'payment.captured') { ... }

    res.json({ success: true });
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).send('server error');
  }
};
