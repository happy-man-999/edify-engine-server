import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Item from '../models/Item.js';

class TransactionService {
  // Create a new transaction
  async createTransaction(transactionData) {
    try {
      const transaction = new Transaction({
        signature: transactionData.signature,
        user: transactionData.user,
        amount: transactionData.amount,
        paymentMethod: transactionData.paymentMethod,
        status: transactionData.status,
        date: transactionData.date || new Date(),
        item: transactionData.item
      });
      
      await transaction.save();
      return transaction;
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }

  // Get transaction by ID with populated user and item details
  async getTransactionById(transactionId) {
    try {
      const transaction = await Transaction.findOne({ signature: transactionId })
        .populate('user', 'firstName lastName email')
        .populate('item', 'name description');
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      return transaction;
    } catch (error) {
      console.error('Error fetching transaction:', error);
      throw error;
    }
  }

  // Get all transactions with filtering and pagination
  async getTransactions(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        paymentMethod = '',
        status = '',
        sortBy = 'date',
        sortOrder = 'desc',
        amountOperator = '',
        amountMin = '',
        amountMax = '',
        dateFrom = '',
        dateTo = '',
        currency = ''
      } = filters;

      // Build query
      const query = {};
      
      if (search) {
        query.$or = [
          { signature: { $regex: search, $options: 'i' } },
          { user: { $regex: search, $options: 'i' } }
        ];
      }

      if (paymentMethod && paymentMethod !== 'all') {
        query.paymentMethod = paymentMethod;
      }

      if (status && status !== 'all') {
        query.status = status;
      }

      // Amount filtering
      if (amountOperator && amountOperator !== 'all') {
        if (amountOperator === 'greater' && amountMin) {
          query.amount = { $gt: parseFloat(amountMin) };
        } else if (amountOperator === 'less' && amountMax) {
          query.amount = { $lt: parseFloat(amountMax) };
        } else if (amountOperator === 'between') {
          const amountQuery = {};
          if (amountMin) amountQuery.$gte = parseFloat(amountMin);
          if (amountMax) amountQuery.$lte = parseFloat(amountMax);
          if (Object.keys(amountQuery).length > 0) {
            query.amount = amountQuery;
          }
        }
      }

      // Date range filtering
      if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) {
          query.date.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          query.date.$lte = new Date(dateTo + 'T23:59:59.999Z');
        }
      }

      // Currency filtering
      if (currency && currency !== 'all') {
        if (currency === 'USD') {
          query.paymentMethod = 'stripe';
        } else if (currency === 'SOL') {
          query.paymentMethod = 'solana';
        }
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Get total count
      const total = await Transaction.countDocuments(query);
      
      // Get transactions with user details
      const transactions = await Transaction.find(query)
        .populate('user', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      // Transform data for frontend
      const transformedTransactions = transactions.map(tx => ({
        id: tx.signature,
        amount: tx.amount,
        currency: tx.paymentMethod === 'solana' ? 'SOL' : 'USD',
        date: tx.date,
        user: tx.user ? `${tx.user.firstName} ${tx.user.lastName}` : 'Unknown User',
        userEmail: tx.user ? tx.user.email : null,
        paymentMethod: tx.paymentMethod === 'solana' ? 'Solana' : 'Stripe',
        status: tx.status,
        txHash: tx.paymentMethod === 'solana' ? tx.signature : null,
        refunded: false, // Add refund logic later if needed
        item: tx.item ? tx.item.name : null
      }));

      return {
        transactions: transformedTransactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  // Get transaction statistics
  async getTransactionStats() {
    try {
      // Get total revenue in USD and SOL
      const stripeTransactions = await Transaction.find({ paymentMethod: 'stripe', status: 'success' });
      const solanaTransactions = await Transaction.find({ paymentMethod: 'solana', status: 'success' });
      
      const totalUSD = stripeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      const totalSOL = solanaTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      // Get success/failed counts
      const successfulCount = await Transaction.countDocuments({ status: 'success' });
      const failedCount = await Transaction.countDocuments({ status: 'failed' });
      const pendingCount = await Transaction.countDocuments({ status: 'pending' });
      
      // Get recent transactions (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentTransactions = await Transaction.countDocuments({
        date: { $gte: thirtyDaysAgo }
      });

      return {
        totalUSD: totalUSD.toFixed(2),
        totalSOL: totalSOL.toFixed(4),
        successful: successfulCount,
        failed: failedCount,
        pending: pendingCount,
        recent: recentTransactions
      };
    } catch (error) {
      console.error('Error fetching transaction stats:', error);
      throw error;
    }
  }

  // Transform transaction for frontend display
  transformTransactionForFrontend(transaction) {
    return {
      id: transaction.signature,
      amount: transaction.amount,
      currency: transaction.paymentMethod === 'solana' ? 'SOL' : 'USD',
      date: transaction.date,
      user: transaction.user ? `${transaction.user.firstName} ${transaction.user.lastName}` : 'Unknown User',
      userEmail: transaction.user ? transaction.user.email : null,
      paymentMethod: transaction.paymentMethod === 'solana' ? 'Solana' : 'Stripe',
      status: transaction.status,
      txHash: transaction.paymentMethod === 'solana' ? transaction.signature : null,
      refunded: false,
      item: transaction.item ? transaction.item.name : null
    };
  }
}

export default TransactionService; 