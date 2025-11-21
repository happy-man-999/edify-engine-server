import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Withdrawal from '../models/Withdrawal.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Settings from '../models/Settings.js';
import { requireAdmin } from '../middleware/admin.js';
import solanaPaymentService from '../services/solanaPaymentService.js';
import emailService from '../services/emailService.js';

const router = express.Router();

// Create withdrawal request (user)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { amount, solanaAddress } = req.body;
    
    // Get minimum withdrawal amount from settings
    const settings = await Settings.getSettings();
    const MIN_WITHDRAWAL_AMOUNT_SOL = settings.requiredWithdrawAmount || 0.33333;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (amount < MIN_WITHDRAWAL_AMOUNT_SOL) {
      return res.status(400).json({ error: `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT_SOL} SOL` });
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

    // Send admin notification if contributor requested the withdrawal (not admin)
    if (req.user.role !== 'admin' && req.user.isContributor) {
      try {
        await emailService.sendAdminWithdrawalRequestNotification({
          amount: withdrawal.amount,
          contributorName: `${req.user.firstName} ${req.user.lastName}`,
          contributorEmail: req.user.email,
          solanaAddress: withdrawal.solanaAddress,
          withdrawalId: withdrawal._id.toString(),
          status: withdrawal.status
        });
      } catch (emailError) {
        console.error('Error sending admin withdrawal request notification:', emailError);
        // Don't fail the request if email fails
      }
    }

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
      .populate('user', 'firstName lastName email balance')
      .populate('processedBy', 'firstName lastName email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate total earned and total withdrawn for each user
    const withdrawalsWithStats = await Promise.all(
      withdrawals.map(async (withdrawal) => {
        const userId = withdrawal.user._id;
        
        // Get total withdrawn amount (sum of all approved withdrawals)
        const totalWithdrawnResult = await Withdrawal.aggregate([
          { $match: { user: userId, status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalWithdrawn = totalWithdrawnResult.length > 0 ? totalWithdrawnResult[0].total : 0;
        
        // Calculate total earned from transactions (all purchases are SOL-only)
        // Find all items created by this user
        const userItems = await Item.find({
          'creator.id': userId
        }).select('_id priceUSD').lean();
        
        const userItemIds = userItems.map(item => item._id);
        const userItemIdsStr = userItemIds.map(id => id.toString());
        
        let totalEarned = 0;
        
        if (userItemIds.length > 0) {
          // Get all successful transactions for items created by this user
          const transactions = await Transaction.find({
            status: 'success',
            $or: [
              { item: { $in: userItemIds } },
              { cartItems: { $in: userItemIds } }
            ]
          }).lean();
          
          // Calculate earnings from single item purchases
          // For single item purchases, creator earns 80% of transaction amount (which is in SOL)
          const singleItemTransactions = transactions.filter(t => 
            t.itemType === 'item-purchase' && 
            t.item && 
            userItemIdsStr.includes(t.item.toString())
          );
          
          const singleItemEarnings = singleItemTransactions.reduce((sum, tx) => {
            return sum + (tx.amount * 0.8);
          }, 0);
          
          // Calculate earnings from cart purchases
          // For cart purchases, calculate proportional earnings based on item prices
          const cartTransactions = transactions.filter(t => 
            t.itemType === 'cart-purchase' && 
            t.cartItems && 
            Array.isArray(t.cartItems) &&
            t.cartItems.some(itemId => userItemIdsStr.includes(itemId.toString()))
          );
          
          let cartEarnings = 0;
          for (const tx of cartTransactions) {
            if (tx.cartItems && Array.isArray(tx.cartItems)) {
              const cartItemIds = tx.cartItems.map(id => id.toString());
              
              // Find which items in the cart belong to this creator
              const creatorItemsInCart = userItems.filter(item => 
                cartItemIds.includes(item._id.toString())
              );
              
              if (creatorItemsInCart.length > 0) {
                // Get all items in the cart to calculate proportions
                const allCartItems = await Item.find({ 
                  _id: { $in: tx.cartItems } 
                }).select('priceUSD').lean();
                
                const totalCartValueUSD = allCartItems.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
                const creatorItemsValueUSD = creatorItemsInCart.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
                
                if (totalCartValueUSD > 0) {
                  // Calculate proportion of creator's items in the cart
                  const proportion = creatorItemsValueUSD / totalCartValueUSD;
                  // transaction.amount is in SOL, creator earns 80% of their proportion
                  cartEarnings += tx.amount * proportion * 0.8;
                }
              }
            }
          }
          
          totalEarned = singleItemEarnings + cartEarnings;
        }
        
        // Convert to plain object and add stats
        const withdrawalObj = withdrawal.toObject();
        withdrawalObj.totalEarned = totalEarned;
        withdrawalObj.totalWithdrawn = totalWithdrawn;
        
        return withdrawalObj;
      })
    );

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      withdrawals: withdrawalsWithStats,
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

// Get withdrawal approval details (for frontend payment) - admin only
router.get('/:id/approve-details', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

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

    // Amount is already in SOL, no conversion needed
    res.json({
      success: true,
      withdrawalId: withdrawal._id,
      amountSOL: withdrawal.amount, // Amount is already in SOL
      solanaAddress: solanaAddress,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email
    });
  } catch (error) {
    console.error('Error getting withdrawal approval details:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Confirm withdrawal payment after frontend payment (admin only)
router.put('/:id/confirm-payment', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentSignature, notes } = req.body;

    if (!paymentSignature) {
      return res.status(400).json({ error: 'Payment signature is required' });
    }

    const withdrawal = await Withdrawal.findById(id).populate('user');
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Withdrawal request is not pending' });
    }

    // Update withdrawal status
    withdrawal.status = 'approved';
    withdrawal.processedAt = new Date();
    withdrawal.processedBy = req.user._id;
    withdrawal.paymentSignature = paymentSignature;
    if (notes) {
      withdrawal.notes = notes;
    }
    await withdrawal.save();

    // Send approval notification email to user
    try {
      await emailService.sendWithdrawalApprovalNotification({
        userEmail: withdrawal.user.email,
        userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
        amount: withdrawal.amount,
        solanaAddress: withdrawal.solanaAddress,
        paymentSignature: withdrawal.paymentSignature,
        withdrawalId: withdrawal._id.toString(),
        processedAt: withdrawal.processedAt
      });
    } catch (emailError) {
      console.error('Error sending withdrawal approval notification:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      withdrawal: withdrawal,
      message: 'Withdrawal request approved successfully'
    });
  } catch (error) {
    console.error('Error confirming withdrawal payment:', error);
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

    // Send rejection notification email to user
    try {
      await emailService.sendWithdrawalRejectionNotification({
        userEmail: withdrawal.user.email,
        userName: `${withdrawal.user.firstName} ${withdrawal.user.lastName}`,
        amount: withdrawal.amount,
        solanaAddress: withdrawal.solanaAddress,
        rejectionReason: withdrawal.rejectionReason,
        withdrawalId: withdrawal._id.toString(),
        processedAt: withdrawal.processedAt
      });
    } catch (emailError) {
      console.error('Error sending withdrawal rejection notification:', emailError);
      // Don't fail the request if email fails
    }

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

