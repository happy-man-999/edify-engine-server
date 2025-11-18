import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Withdrawal from '../models/Withdrawal.js';
import User from '../models/User.js';
import { requireAdmin } from '../middleware/admin.js';
import solanaPaymentService from '../services/solanaPaymentService.js';

const router = express.Router();

// Create withdrawal request (user)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { amount, solanaAddress } = req.body;
    const MIN_WITHDRAWAL_AMOUNT = 50;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({ error: `Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}` });
    }

    if (!solanaAddress || solanaAddress.trim() === '') {
      return res.status(400).json({ error: 'Solana address is required' });
    }

    // Basic Solana address validation (44 characters, base58)
    if (solanaAddress.length !== 44) {
      return res.status(400).json({ error: 'Invalid Solana address format' });
    }

    // Get user with current balance
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Save Solana address to user profile if not already set
    if (!user.solanaAddress) {
      user.solanaAddress = solanaAddress.trim();
    }

    // Deduct balance immediately when withdrawal is requested
    user.balance -= amount;
    await user.save();

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      user: req.user._id,
      amount: amount,
      solanaAddress: solanaAddress.trim(),
      status: 'pending'
    });

    await withdrawal.save();

    res.status(201).json({
      success: true,
      withdrawal: withdrawal,
      message: 'Withdrawal request submitted successfully'
    });
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Get user's withdrawal requests
router.get('/my-withdrawals', authenticateToken, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user._id })
      .sort({ requestedAt: -1 })
      .populate('processedBy', 'firstName lastName email');

    res.json({
      success: true,
      withdrawals: withdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Get user's current balance
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('balance');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: user.balance || 0
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Get all withdrawal requests (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const withdrawals = await Withdrawal.find(query)
      .populate('user', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      withdrawals: withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Approve withdrawal request (admin only)
router.put('/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const withdrawal = await Withdrawal.findById(id).populate('user');
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Withdrawal request is not pending' });
    }

    // Get user
    const user = await User.findById(withdrawal.user._id);
    
    // Check if user has a Solana address (from withdrawal or user profile)
    const solanaAddress = withdrawal.solanaAddress || user.solanaAddress;
    if (!solanaAddress) {
      return res.status(400).json({ error: 'User has no Solana address linked. Cannot process withdrawal.' });
    }

    // Note: Balance was already deducted when withdrawal was created, so we don't deduct again

    // Convert USD amount to SOL
    let amountSOL;
    try {
      amountSOL = await solanaPaymentService.convertUsdToSol(withdrawal.amount);
    } catch (error) {
      console.error('Error converting USD to SOL:', error);
      return res.status(500).json({ error: 'Failed to convert amount to SOL' });
    }

    // Send SOL payment to user's address
    let paymentSignature = null;
    try {
      const memo = `Withdrawal-${withdrawal._id}`;
      const paymentResult = await solanaPaymentService.sendSOL(solanaAddress, amountSOL, memo);
      paymentSignature = paymentResult.signature;
      console.log(`SOL payment sent: ${paymentSignature} to ${solanaAddress}`);
    } catch (error) {
      console.error('Error sending SOL payment:', error);
      return res.status(500).json({ 
        error: 'Failed to send SOL payment', 
        details: error.message 
      });
    }

    // Balance was already deducted when withdrawal was created, no need to deduct again

    // Update withdrawal status
    withdrawal.status = 'approved';
    withdrawal.processedAt = new Date();
    withdrawal.processedBy = req.user._id;
    withdrawal.paymentSignature = paymentSignature;
    if (notes) {
      withdrawal.notes = notes;
    }
    await withdrawal.save();

    res.json({
      success: true,
      withdrawal: withdrawal,
      paymentSignature: paymentSignature,
      amountSOL: amountSOL,
      message: 'Withdrawal request approved and payment sent successfully'
    });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Reject withdrawal request (admin only)
router.put('/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, notes } = req.body;

    const withdrawal = await Withdrawal.findById(id).populate('user');
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Withdrawal request is not pending' });
    }

    // Restore balance to user since withdrawal is rejected
    const user = await User.findById(withdrawal.user._id);
    user.balance += withdrawal.amount;
    await user.save();

    // Update withdrawal status
    withdrawal.status = 'rejected';
    withdrawal.processedAt = new Date();
    withdrawal.processedBy = req.user._id;
    if (rejectionReason) {
      withdrawal.rejectionReason = rejectionReason;
    }
    if (notes) {
      withdrawal.notes = notes;
    }
    await withdrawal.save();

    res.json({
      success: true,
      withdrawal: withdrawal,
      message: 'Withdrawal request rejected'
    });
  } catch (error) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

export default router;

