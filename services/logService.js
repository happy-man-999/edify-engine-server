import Log from '../models/Log.js';

class LogService {
  // Create a new log entry
  static async createLog(logData) {
    try {
      const log = new Log(logData);
      await log.save();
      return log;
    } catch (error) {
      console.error('Error creating log:', error);
      throw error;
    }
  }

  // Log user signup
  static async logUserSignup(userId, userData) {
    return await this.createLog({
      level: 'success',
      type: 'user_signup',
      message: `New user signed up: ${userData.email}`,
      details: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName
      },
      status: 'completed',
      userId: userId,
      metadata: {
        signupMethod: userData.googleId ? 'google' : 'email'
      }
    });
  }

  // Log user creation by admin
  static async logUserCreated(adminId, userData) {
    return await this.createLog({
      level: 'success',
      type: 'user_created',
      message: `Admin created new user: ${userData.email}`,
      details: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      status: 'completed',
      userId: adminId,
      metadata: {
        createdBy: 'admin',
        timestamp: new Date()
      }
    });
  }

  // Log user update by admin
  static async logUserUpdated(adminId, userData, changes) {
    return await this.createLog({
      level: 'success',
      type: 'user_updated',
      message: `Admin updated user: ${userData.email}`,
      details: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        changes: changes
      },
      status: 'completed',
      userId: adminId,
      metadata: {
        updatedBy: 'admin',
        timestamp: new Date()
      }
    });
  }

  // Log user deletion by admin
  static async logUserDeleted(adminId, userData) {
    return await this.createLog({
      level: 'success',
      type: 'user_deleted',
      message: `Admin deleted user: ${userData.email}`,
      details: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role
      },
      status: 'completed',
      userId: adminId,
      metadata: {
        deletedBy: 'admin',
        timestamp: new Date()
      }
    });
  }

  // Log user role change by admin
  static async logUserRoleChanged(adminId, userData, oldRole, newRole) {
    return await this.createLog({
      level: 'success',
      type: 'user_role_changed',
      message: `Admin changed user role: ${userData.email} (${oldRole} → ${newRole})`,
      details: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        oldRole: oldRole,
        newRole: newRole
      },
      status: 'completed',
      userId: adminId,
      metadata: {
        changedBy: 'admin',
        timestamp: new Date()
      }
    });
  }

  // Log purchase
  static async logPurchase(userId, itemId, transactionId, purchaseData) {
    return await this.createLog({
      level: 'success',
      type: 'purchase',
      message: `User purchased item: ${purchaseData.itemName}`,
      details: {
        itemName: purchaseData.itemName,
        amount: purchaseData.amount,
        paymentMethod: purchaseData.paymentMethod,
        signature: purchaseData.signature
      },
      status: 'completed',
      userId: userId,
      itemId: itemId,
      transactionId: transactionId,
      metadata: {
        currency: purchaseData.currency || 'USD'
      }
    });
  }

  // Log transaction creation
  static async logTransactionCreated(userId, transactionId, transactionData) {
    return await this.createLog({
      level: 'success',
      type: 'transaction_created',
      message: `Transaction created: ${transactionData.signature}`,
      details: {
        signature: transactionData.signature,
        amount: transactionData.amount,
        paymentMethod: transactionData.paymentMethod,
        status: transactionData.status
      },
      status: 'completed',
      userId: userId,
      transactionId: transactionId,
      metadata: {
        currency: transactionData.currency || 'USD',
        timestamp: new Date()
      }
    });
  }

  // Log droplet creation
  static async logDropletCreated(userId, dropletId, dropletData) {
    return await this.createLog({
      level: 'success',
      type: 'droplet_created',
      message: `Droplet created successfully: ${dropletData.name}`,
      details: {
        dropletName: dropletData.name,
        size: dropletData.sizeSlug,
        region: dropletData.regionSlug,
        ipAddress: dropletData.ipAddress
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        memory: dropletData.memory,
        vcpus: dropletData.vcpus,
        disk: dropletData.disk
      }
    });
  }

  // Log subdomain assignment
  static async logSubdomainAssigned(userId, subdomainData) {
    return await this.createLog({
      level: 'success',
      type: 'subdomain_assigned',
      message: `Subdomain assigned: ${subdomainData.subdomain}`,
      details: {
        subdomain: subdomainData.subdomain,
        dropletId: subdomainData.dropletId
      },
      status: 'completed',
      userId: userId,
      dropletId: subdomainData.dropletId
    });
  }

  // Log subdomain update
  static async logDropletSubdomainUpdated(userId, dropletId, subdomainData) {
    return await this.createLog({
      level: 'success',
      type: 'subdomain_updated',
      message: `Droplet subdomain updated: ${subdomainData.subdomain}`,
      details: {
        subdomain: subdomainData.subdomain,
        dropletId: dropletId,
        previousSubdomain: subdomainData.previousSubdomain
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        action: 'subdomain_update',
        timestamp: new Date()
      }
    });
  }

  // Log error
  static async logError(errorData) {
    return await this.createLog({
      level: 'error',
      type: 'error',
      message: errorData.message,
      details: {
        error: errorData.error,
        stack: errorData.stack
      },
      status: 'failed',
      userId: errorData.userId,
      error: errorData.error,
      metadata: {
        context: errorData.context,
        timestamp: new Date()
      }
    });
  }

  // Log webhook
  static async logWebhook(webhookData) {
    return await this.createLog({
      level: 'info',
      type: 'webhook',
      message: `Webhook received: ${webhookData.type}`,
      details: {
        webhookType: webhookData.type,
        source: webhookData.source,
        payload: webhookData.payload
      },
      status: webhookData.status || 'completed',
      metadata: {
        headers: webhookData.headers
      }
    });
  }

  // Log provisioning
  static async logProvisioning(provisioningData) {
    return await this.createLog({
      level: provisioningData.success ? 'success' : 'error',
      type: 'provisioning',
      message: provisioningData.message,
      details: {
        action: provisioningData.action,
        resource: provisioningData.resource,
        duration: provisioningData.duration
      },
      status: provisioningData.success ? 'completed' : 'failed',
      userId: provisioningData.userId,
      dropletId: provisioningData.dropletId,
      metadata: {
        provider: provisioningData.provider,
        region: provisioningData.region
      }
    });
  }

  // Log droplet restart
  static async logDropletRestarted(userId, dropletId, dropletData) {
    return await this.createLog({
      level: 'success',
      type: 'droplet_restarted',
      message: `Droplet restarted successfully: ${dropletData.name}`,
      details: {
        dropletName: dropletData.name,
        dropletId: dropletId,
        previousStatus: dropletData.previousStatus,
        newStatus: dropletData.newStatus
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        action: 'restart',
        timestamp: new Date()
      }
    });
  }

  // Log droplet termination
  static async logDropletTerminated(userId, dropletId, dropletData) {
    return await this.createLog({
      level: 'success',
      type: 'droplet_terminated',
      message: `Droplet terminated successfully: ${dropletData.name}`,
      details: {
        dropletName: dropletData.name,
        dropletId: dropletId,
        previousStatus: dropletData.previousStatus,
        newStatus: dropletData.newStatus
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        action: 'terminate',
        timestamp: new Date()
      }
    });
  }

  // Log droplet reprovisioning
  static async logDropletReprovisioned(userId, dropletId, dropletData) {
    return await this.createLog({
      level: 'success',
      type: 'droplet_reprovisioned',
      message: `Droplet reprovisioned successfully: ${dropletData.name}`,
      details: {
        dropletName: dropletData.name,
        dropletId: dropletId,
        previousStatus: dropletData.previousStatus,
        newStatus: dropletData.newStatus
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        action: 'reprovision',
        timestamp: new Date()
      }
    });
  }

  // Log droplet deletion
  static async logDropletDeleted(userId, dropletId, dropletData) {
    return await this.createLog({
      level: 'success',
      type: 'droplet_deleted',
      message: `Droplet deleted successfully: ${dropletData.name}`,
      details: {
        dropletName: dropletData.name,
        dropletId: dropletId,
        previousStatus: dropletData.previousStatus
      },
      status: 'completed',
      userId: userId,
      dropletId: dropletId,
      metadata: {
        action: 'delete',
        timestamp: new Date()
      }
    });
  }

  // Get logs with filters
  static async getLogs(filters = {}) {
    const query = {};

    if (filters.level && filters.level !== 'all') {
      query.level = filters.level;
    }

    if (filters.type && filters.type !== 'all') {
      query.type = filters.type;
    }


    if (filters.search) {
      query.$or = [
        { message: { $regex: filters.search, $options: 'i' } },
        { 'details.error': { $regex: filters.search, $options: 'i' } }
      ];
    }

    if (filters.startDate && filters.endDate) {
      query.timestamp = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    const logs = await Log.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('itemId', 'name price')
      .populate('transactionId', 'signature amount')
      .sort({ timestamp: -1 })
      .limit(filters.limit || 100);

    return logs;
  }

  // Get logs with pagination and filters
  static async getLogsPaginated(filters = {}) {
    const query = {};

    if (filters.level && filters.level !== 'all') {
      query.level = filters.level;
    }

    if (filters.type && filters.type !== 'all') {
      query.type = filters.type;
    }


    if (filters.search) {
      query.$or = [
        { message: { $regex: filters.search, $options: 'i' } },
        { 'details.error': { $regex: filters.search, $options: 'i' } }
      ];
    }

    if (filters.startDate && filters.endDate) {
      query.timestamp = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    const page = parseInt(filters.page || 1);
    const limit = parseInt(filters.limit || 50);
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      Log.countDocuments(query),
      Log.find(query)
        .populate('userId', 'firstName lastName email')
        .populate('itemId', 'name price')
        .populate('transactionId', 'signature amount')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    return {
      logs,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit))
    };
  }

  // Get log statistics
  static async getLogStats() {
    const stats = await Log.aggregate([
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$level', 'error'] }, 1, 0] }
          },
          successCount: {
            $sum: { $cond: [{ $eq: ['$level', 'success'] }, 1, 0] }
          },
          warningCount: {
            $sum: { $cond: [{ $eq: ['$level', 'warning'] }, 1, 0] }
          },
          infoCount: {
            $sum: { $cond: [{ $eq: ['$level', 'info'] }, 1, 0] }
          }
        }
      }
    ]);

    return stats[0] || {
      totalLogs: 0,
      errorCount: 0,
      successCount: 0,
      warningCount: 0,
      infoCount: 0
    };
  }

  // Get logs by type
  static async getLogsByType(type, limit = 50) {
    return await Log.find({ type })
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  // Get recent errors
  static async getRecentErrors(limit = 20) {
    return await Log.find({ level: 'error' })
      .populate('userId', 'firstName lastName email')
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  // Log settings update by admin
  static async logSettingsUpdated(adminId, changes) {
    return await this.createLog({
      level: 'success',
      type: 'settings_updated',
      message: 'System settings updated by admin',
      details: {
        changes: changes
      },
      status: 'completed',
      userId: adminId,
      metadata: {
        updatedBy: 'admin',
        timestamp: new Date()
      }
    });
  }

  // Generic action logger
  static async logAction(actionData) {
    return await this.createLog({
      level: actionData.level || 'info',
      type: actionData.type,
      message: actionData.message,
      details: actionData.details || {},
      status: actionData.status || 'completed',
      userId: actionData.userId,
      itemId: actionData.itemId,
      transactionId: actionData.transactionId,
      dropletId: actionData.dropletId,
      metadata: {
        ...actionData.metadata,
        timestamp: new Date()
      }
    });
  }
}

export default LogService; 