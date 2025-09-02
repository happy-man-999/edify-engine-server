import Droplet from '../models/Droplet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Settings from '../models/Settings.js';
import DigitalOceanService from './digitalOceanService.js';
import LogService from './logService.js';
import mongoose from 'mongoose';

class DropletService {
  constructor() {
    this.digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);
  }

  // Create a new droplet record
  async createDroplet(dropletData) {
    try {
      const droplet = new Droplet({
        dropletId: dropletData.dropletId,
        name: dropletData.name,
        sizeSlug: dropletData.sizeSlug,
        regionSlug: dropletData.regionSlug,
        status: dropletData.status,
        createdAt: dropletData.createdAt,
        user: dropletData.user,
        transaction: dropletData.transaction,
        ipAddress: dropletData.ipAddress,
        memory: dropletData.memory,
        vcpus: dropletData.vcpus,
        disk: dropletData.disk,
        priceMonthly: dropletData.priceMonthly,
        tags: dropletData.tags || [],
        subdomain: dropletData.subdomain
      });
      
      await droplet.save();
      
      // Log droplet creation
      try {
        await LogService.logDropletCreated(dropletData.user, dropletData.dropletId, {
          name: dropletData.name,
          sizeSlug: dropletData.sizeSlug,
          regionSlug: dropletData.regionSlug,
          ipAddress: dropletData.ipAddress,
          memory: dropletData.memory,
          vcpus: dropletData.vcpus,
          disk: dropletData.disk
        });
      } catch (logError) {
        console.error('Error logging droplet creation:', logError);
      }
      
      return droplet;
    } catch (error) {
      console.error('Error creating droplet record:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to create droplet record',
          error: error.message,
          context: 'droplet_creation',
          userId: dropletData.user
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
      throw error;
    }
  }

  // Get all droplets with filtering and pagination
  async getDroplets(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status = '',
        sizeSlug = '',
        regionSlug = '',
        userId = '',
        createdAtFrom = '',
        createdAtTo = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build query
      const query = {};
      
      // Add status filter
      if (status && status !== 'all') {
        query.status = status;
      }

      // Add size filter
      if (sizeSlug) {
        query.sizeSlug = sizeSlug;
      }

      // Add region filter
      if (regionSlug) {
        query.regionSlug = regionSlug;
      }

      // Add user filter
      if (userId) {
        // Check if userId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(userId)) {
          query.user = new mongoose.Types.ObjectId(userId);
        } else {
          console.warn('Invalid userId provided:', userId);
        }
      }

      // Add date range filter
      if (createdAtFrom || createdAtTo) {
        query.createdAt = {};
        if (createdAtFrom) {
          // Ensure proper date formatting
          const fromDate = new Date(createdAtFrom);
          if (!isNaN(fromDate.getTime())) {
            query.createdAt.$gte = fromDate;
          }
        }
        if (createdAtTo) {
          // Ensure proper date formatting and set to end of day
          const toDate = new Date(createdAtTo);
          if (!isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            query.createdAt.$lte = toDate;
          }
        }
      }
      
      if (search) {
        // Search in droplet fields and user names
        // We need to use aggregation to search in populated user fields
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
                { name: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } },
                { 'userDetails.firstName': { $regex: search, $options: 'i' } },
                { 'userDetails.lastName': { $regex: search, $options: 'i' } },
                { 'userDetails.email': { $regex: search, $options: 'i' } }
              ]
            }
          },
          {
            $lookup: {
              from: 'transactions',
              localField: 'transaction',
              foreignField: '_id',
              as: 'transactionDetails'
            }
          },
          {
            $unwind: {
              path: '$transactionDetails',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $sort: {
              [sortBy]: sortOrder === 'desc' ? -1 : 1
            }
          },
          {
            $skip: (parseInt(page) - 1) * parseInt(limit)
          },
          {
            $limit: parseInt(limit)
          },
          {
            $project: {
              _id: 1,
              dropletId: 1,
              name: 1,
              sizeSlug: 1,
              regionSlug: 1,
              status: 1,
              createdAt: 1,
              user: 1,
              userDetails: 1,
              transaction: 1,
              transactionDetails: 1,
              ipAddress: 1,
              memory: 1,
              vcpus: 1,
              disk: 1,
              priceMonthly: 1,
              tags: 1
            }
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
                { name: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } },
                { 'userDetails.firstName': { $regex: search, $options: 'i' } },
                { 'userDetails.lastName': { $regex: search, $options: 'i' } },
                { 'userDetails.email': { $regex: search, $options: 'i' } }
              ]
            }
          }
        ];

        countPipeline.push({ $count: 'total' });

        const totalResult = await Droplet.aggregate(countPipeline);
        const total = totalResult.length > 0 ? totalResult[0].total : 0;

        // Execute main aggregation
        const droplets = await Droplet.aggregate(aggregationPipeline);

        // Transform data for frontend
        const transformedDroplets = droplets.map(droplet => ({
          id: droplet.dropletId,
          dropletId: droplet.dropletId, // Keep original field for clarity
          name: droplet.name,
          sizeSlug: droplet.sizeSlug,
          regionSlug: droplet.regionSlug,
          status: droplet.status,
          createdAt: droplet.createdAt,
          user: droplet.userDetails ? `${droplet.userDetails.firstName} ${droplet.userDetails.lastName}` : 'Unknown User',
          userEmail: droplet.userDetails ? droplet.userDetails.email : null,
          transaction: droplet.transactionDetails ? droplet.transactionDetails.signature : null,
          ipAddress: droplet.ipAddress,
          memory: droplet.memory,
          vcpus: droplet.vcpus,
          disk: droplet.disk,
          priceMonthly: droplet.priceMonthly,
          tags: droplet.tags
        }));

        return {
          droplets: transformedDroplets,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        };
      } else {        
        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Get total count
        const total = await Droplet.countDocuments(query);
        
        // Get droplets with user details
        const droplets = await Droplet.find(query)
          .populate('user', 'firstName lastName email')
          .populate('transaction', 'signature amount')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit));

        // Transform data for frontend
        const transformedDroplets = droplets.map(droplet => ({
          id: droplet.dropletId,
          dropletId: droplet.dropletId, // Keep original field for clarity
          name: droplet.name,
          sizeSlug: droplet.sizeSlug,
          regionSlug: droplet.regionSlug,
          status: droplet.status,
          createdAt: droplet.createdAt,
          user: droplet.user ? `${droplet.user.firstName} ${droplet.user.lastName}` : 'Unknown User',
          userEmail: droplet.user ? droplet.user.email : null,
          transaction: droplet.transaction ? droplet.transaction.signature : null,
          ipAddress: droplet.ipAddress,
          memory: droplet.memory,
          vcpus: droplet.vcpus,
          disk: droplet.disk,
          priceMonthly: droplet.priceMonthly,
          tags: droplet.tags
        }));

        return {
          droplets: transformedDroplets,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        };
      }
    } catch (error) {
      console.error('Error fetching droplets:', error);
      throw error;
    }
  }

  // Get droplet by ID
  async getDropletById(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) })
        .populate('user', 'firstName lastName email')
        .populate('transaction', 'signature amount paymentMethod');
      
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      return droplet;
    } catch (error) {
      console.error('Error fetching droplet:', error);
      throw error;
    }
  }

  // Get droplet statistics
  async getDropletStats() {
    try {
      const totalDroplets = await Droplet.countDocuments();
      const activeDroplets = await Droplet.countDocuments({ status: 'active' });
      const newDroplets = await Droplet.countDocuments({ status: 'new' });
      const offDroplets = await Droplet.countDocuments({ status: 'off' });
      
      // Get droplets created in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentDroplets = await Droplet.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });

      // Calculate total monthly cost
      const allDroplets = await Droplet.find({});
      const totalMonthlyCost = allDroplets.reduce((sum, droplet) => {
        return sum + (droplet.priceMonthly || 0);
      }, 0);

      return {
        totalDroplets,
        activeDroplets,
        newDroplets,
        offDroplets,
        recentDroplets,
        totalMonthlyCost: totalMonthlyCost.toFixed(2)
      };
    } catch (error) {
      console.error('Error fetching droplet stats:', error);
      throw error;
    }
  }

  // Update droplet status from DigitalOcean
  async syncDropletStatus(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      // Get current status from DigitalOcean
      const doDroplet = await this.digitalOceanService.getDroplet(dropletId);
      
      // Update local status
      droplet.status = doDroplet.status;
      droplet.ipAddress = doDroplet.networks?.v4?.[0]?.ip_address || droplet.ipAddress;
      
      await droplet.save();
      return droplet;
    } catch (error) {
      console.error('Error syncing droplet status:', error);
      throw error;
    }
  }

  // Transform droplet for frontend display
  transformDropletForFrontend(droplet) {
    return {
      id: droplet.dropletId,
      dropletId: droplet.dropletId, // Keep original field for clarity
      name: droplet.name,
      sizeSlug: droplet.sizeSlug,
      regionSlug: droplet.regionSlug,
      status: droplet.status,
      createdAt: droplet.createdAt,
      user: droplet.user ? `${droplet.user.firstName} ${droplet.user.lastName}` : 'Unknown User',
      userEmail: droplet.user ? droplet.user.email : null,
      transaction: droplet.transaction ? droplet.transaction.signature : null,
      ipAddress: droplet.ipAddress,
      memory: droplet.memory,
      vcpus: droplet.vcpus,
      disk: droplet.disk,
      priceMonthly: droplet.priceMonthly,
      tags: droplet.tags
    };
  }

  // Restart droplet
  async restartDroplet(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) }).populate('user');
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      const previousStatus = droplet.status;

      // Restart via DigitalOcean
      await this.digitalOceanService.rebootDroplet(dropletId);
      
      // Update local status
      droplet.status = 'new'; // Will be updated to 'active' when synced
      await droplet.save();
      
      // Log droplet restart
      try {
        await LogService.logDropletRestarted(droplet.user._id, dropletId, {
          name: droplet.name,
          previousStatus: previousStatus,
          newStatus: droplet.status
        });
      } catch (logError) {
        console.error('Error logging droplet restart:', logError);
      }
      
      return droplet;
    } catch (error) {
      console.error('Error restarting droplet:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to restart droplet',
          error: error.message,
          context: 'droplet_restart',
          userId: null
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
      throw error;
    }
  }

  // Terminate droplet (power off)
  async terminateDroplet(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) }).populate('user');
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      const previousStatus = droplet.status;

      // Power off via DigitalOcean
      await this.digitalOceanService.powerOffDroplet(dropletId);
      
      // Update local status
      droplet.status = 'off';
      await droplet.save();
      
      // Log droplet termination
      try {
        await LogService.logDropletTerminated(droplet.user._id, dropletId, {
          name: droplet.name,
          previousStatus: previousStatus,
          newStatus: droplet.status
        });
      } catch (logError) {
        console.error('Error logging droplet termination:', logError);
      }
      
      return droplet;
    } catch (error) {
      console.error('Error terminating droplet:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to terminate droplet',
          error: error.message,
          context: 'droplet_termination',
          userId: null
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
      throw error;
    }
  }

  // Reprovision droplet (power on)
  async reprovisionDroplet(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) }).populate('user');
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      const previousStatus = droplet.status;

      // Power on and complete setup via DigitalOcean
      try {
        await this.digitalOceanService.completeDropletSetup(dropletId);
        console.log(`Complete droplet setup completed for reprovisioned droplet ${dropletId}`);
      } catch (setupError) {
        console.error(`Complete droplet setup failed for reprovisioned droplet ${dropletId}:`, setupError.message);
        // Log the setup error but don't fail the reprovision process
        try {
          await LogService.logError({
            message: 'Complete droplet setup failed during reprovisioning',
            error: setupError.message,
            context: 'droplet_reprovisioning_setup',
            userId: droplet.user._id
          });
        } catch (logError) {
          console.error('Error logging setup error during reprovisioning:', logError);
        }
      }
      
      // Update local status
      droplet.status = 'new'; // Will be updated to 'active' when synced
      await droplet.save();
      
      // Log droplet reprovisioning
      try {
        await LogService.logDropletReprovisioned(droplet.user._id, dropletId, {
          name: droplet.name,
          previousStatus: previousStatus,
          newStatus: droplet.status
        });
      } catch (logError) {
        console.error('Error logging droplet reprovisioning:', logError);
      }
      
      return droplet;
    } catch (error) {
      console.error('Error reprovisioning droplet:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to reprovision droplet',
          error: error.message,
          context: 'droplet_reprovisioning',
          userId: null
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
      throw error;
    }
  }

  // Delete droplet
  async deleteDroplet(dropletId) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) }).populate('user');
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      const previousStatus = droplet.status;

      // Remove subdomain if it exists
      if (droplet.subdomain) {
        try {
          console.log(`Attempting to remove subdomain ${droplet.subdomain} for droplet ${dropletId}`);
          const settings = await Settings.findOne();
          
          if (settings && settings.defaultDnsDomain) {
            const result = await this.digitalOceanService.removeSubdomain(settings.defaultDnsDomain, droplet.subdomain);
            if (result.success) {
              console.log(`Subdomain ${droplet.subdomain} removed successfully for droplet ${dropletId}`);
            } else {
              console.warn(`Subdomain removal warning for droplet ${dropletId}: ${result.message}`);
            }
          } else {
            console.warn(`No default DNS domain found in settings, skipping subdomain removal for droplet ${dropletId}`);
          }
        } catch (subdomainError) {
          console.error(`Error removing subdomain for droplet ${dropletId}:`, subdomainError.message);
          // Don't fail the entire process if subdomain removal fails
        }
      } else {
        console.log(`No subdomain found for droplet ${dropletId}, skipping subdomain removal`);
      }

      // Delete via DigitalOcean
      await this.digitalOceanService.deleteDroplet(dropletId);
      
      // Log droplet deletion
      try {
        await LogService.logDropletDeleted(droplet.user._id, dropletId, {
          name: droplet.name,
          previousStatus: previousStatus
        });
      } catch (logError) {
        console.error('Error logging droplet deletion:', logError);
      }
      
      // Delete from local database
      await Droplet.findByIdAndDelete(droplet._id);
      
      return { message: 'Droplet deleted successfully' };
    } catch (error) {
      console.error('Error deleting droplet:', error);
      
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to delete droplet',
          error: error.message,
          context: 'droplet_deletion',
          userId: null
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      
      throw error;
    }
  }

  // Count droplets for a specific user
  async countUserDroplets(userId) {
    try {
      const count = await Droplet.countDocuments({ user: userId });
      return count;
    } catch (error) {
      console.error('Error counting user droplets:', error);
      throw error;
    }
  }

  // Update droplet subdomain
  async updateDropletSubdomain(dropletId, subdomain) {
    try {
      const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
      if (!droplet) {
        throw new Error('Droplet not found');
      }

      // Update subdomain
      droplet.subdomain = subdomain;
      droplet.name = subdomain;
      await droplet.save();
      
      console.log(`Droplet ${dropletId} subdomain updated to: ${subdomain}`);
      
      // Log subdomain update
      try {
        await LogService.logDropletSubdomainUpdated(droplet.user, dropletId, {
          name: droplet.name,
          oldSubdomain: droplet.subdomain,
          newSubdomain: subdomain
        });
      } catch (logError) {
        console.error('Error logging subdomain update:', logError);
      }
      
      return droplet;
    } catch (error) {
      console.error('Error updating droplet subdomain:', error);
      throw error;
    }
  }

  // Get droplet by custom domain
  async getDropletByCustomDomain(customDomain) {
    try {
      const droplet = await Droplet.findOne({ subdomain: customDomain });
      return droplet;
    } catch (error) {
      console.error('Error getting droplet by custom domain:', error);
      return null;
    }
  }
}

export default DropletService; 