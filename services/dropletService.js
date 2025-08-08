import Droplet from '../models/Droplet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import DigitalOceanService from './digitalOceanService.js';
import LogService from './logService.js';

class DropletService {
  constructor() {
    this.digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
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
        tags: dropletData.tags || []
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
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build query
      const query = {};
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { dropletId: { $regex: search, $options: 'i' } }
        ];
      }

      if (status && status !== 'all') {
        query.status = status;
      }

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

      // Power on via DigitalOcean
      await this.digitalOceanService.powerOnDroplet(dropletId);
      
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
}

export default DropletService; 