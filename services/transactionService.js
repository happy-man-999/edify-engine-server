import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Item from '../models/Item.js';
import LogService from './logService.js';

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
        item: transactionData.item,
        itemType: transactionData.itemType,
        cartItems: transactionData.cartItems
      });
      
      await transaction.save();
      
      // Log transaction creation
      try {
        await LogService.logTransactionCreated(transactionData.user, transaction._id, {
          signature: transactionData.signature,
          amount: transactionData.amount,
          paymentMethod: transactionData.paymentMethod,
          status: transactionData.status,
          currency: transactionData.currency || 'USD'
        });
      } catch (logError) {
        console.error('Error logging transaction creation:', logError);
      }
      
      return transaction;
    } catch (error) {
      console.error('Error creating transaction:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to create transaction',
          error: error.message,
          context: 'transaction_creation',
          userId: transactionData.user
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
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

  // Get transaction by signature (for checking if already processed)
  async getTransactionBySignature(signature) {
    try {
      const transaction = await Transaction.findOne({ signature: signature });
      return transaction; // Returns null if not found
    } catch (error) {
      console.error('Error fetching transaction by signature:', error);
      return null; // Return null on error to allow processing to continue
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
      
      // Remove search from query since we'll handle it in aggregation
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
      
      if (search) {
        // Use aggregation pipeline to search in user fields
        const aggregationPipeline = [
          {
            $match: query // Apply non-search filters first
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user',
              foreignField: '_id',
              as: 'userDetails'
            }
          },
          {
            $unwind: {
              path: '$userDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $match: {
              $or: [
                { signature: { $regex: search, $options: 'i' } },
                { 'userDetails.firstName': { $regex: search, $options: 'i' } },
                { 'userDetails.lastName': { $regex: search, $options: 'i' } },
                { 'userDetails.email': { $regex: search, $options: 'i' } }
              ]
            }
          },
          {
            $sort: sort
          },
          {
            $skip: skip
          },
          {
            $limit: parseInt(limit)
          }
        ];

        // Get total count for pagination
        const countPipeline = [
          {
            $match: query // Apply non-search filters first
          },
          {
            $lookup: {
              from: 'users',
              localField: 'user',
              foreignField: '_id',
              as: 'userDetails'
            }
          },
          {
            $unwind: {
              path: '$userDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $match: {
              $or: [
                { signature: { $regex: search, $options: 'i' } },
                { 'userDetails.firstName': { $regex: search, $options: 'i' } },
                { 'userDetails.lastName': { $regex: search, $options: 'i' } },
                { 'userDetails.email': { $regex: search, $options: 'i' } }
              ]
            }
          }
        ];

        countPipeline.push({ $count: 'total' });

        const totalResult = await Transaction.aggregate(countPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        // Execute main aggregation
        const transactions = await Transaction.aggregate(aggregationPipeline);

        // Transform data for frontend
        const transformedTransactions = transactions.map(tx => ({
          id: tx.signature,
          amount: tx.amount,
          currency: tx.paymentMethod === 'solana' ? 'SOL' : 'USD',
          date: tx.date,
          user: tx.userDetails ? `${tx.userDetails.firstName} ${tx.userDetails.lastName}` : 'Unknown User',
          userEmail: tx.userDetails ? tx.userDetails.email : null,
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
      } else {
        // No search term - use regular query for better performance
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
      }
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