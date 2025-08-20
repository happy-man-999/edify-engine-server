import stripeService from './stripeService.js';
import SolanaService from './solanaService.js';

class SettingsRefreshService {
  constructor() {
    this.services = new Map();
    this.solanaServices = new Map(); // Track multiple Solana service instances
  }

  // Register a service for automatic refresh
  registerService(serviceName, serviceInstance) {
    this.services.set(serviceName, serviceInstance);
  }

  // Register a Solana service instance (they can have different network configs)
  registerSolanaService(serviceId, serviceInstance) {
    this.solanaServices.set(serviceId, serviceInstance);
  }

  // Refresh all registered services
  async refreshAllServices() {
    const refreshPromises = [];
    const results = {
      stripe: null,
      solana: {}
    };
    
    // Refresh Stripe service
    if (this.services.has('stripe')) {
      console.log('💳 Refreshing Stripe service...');
      refreshPromises.push(
        stripeService.refreshStripe()
          .then(() => {
            console.log('✅ Stripe service refreshed successfully');
            results.stripe = 'success';
          })
          .catch(err => {
            console.error('❌ Error refreshing Stripe service:', err);
            results.stripe = { error: err.message };
          })
      );
    } else {
      console.log('⚠️  Stripe service not registered for auto-refresh');
    }
    
    // Refresh all Solana services
    for (const [serviceId, service] of this.solanaServices) {
      console.log(`🔗 Refreshing Solana service: ${serviceId}`);
      refreshPromises.push(
        service.refreshConnection()
          .then(() => {
            console.log(`✅ Solana service ${serviceId} refreshed successfully`);
            results.solana[serviceId] = 'success';
          })
          .catch(err => {
            console.error(`❌ Error refreshing Solana service ${serviceId}:`, err);
            results.solana[serviceId] = { error: err.message };
          })
      );
    }
    
    // Wait for all refreshes to complete
    try {
      await Promise.allSettled(refreshPromises);
      console.log('🎉 All services refresh completed');
      console.log('📋 Refresh results:', results);
    } catch (error) {
      console.error('💥 Error during service refresh:', error);
    }
    
    return results;
  }

  // Get status of all services
  async getServicesStatus() {
    console.log('🔍 Getting status of all services...');
    const status = {};
    
    // Check Stripe service
    if (this.services.has('stripe')) {
      try {
        const stripeMode = await stripeService.getCurrentMode();
        status.stripe = stripeMode;
        console.log('💳 Stripe service status:', stripeMode);
      } catch (error) {
        status.stripe = { error: error.message };
        console.error('❌ Error getting Stripe service status:', error);
      }
    } else {
      console.log('⚠️  Stripe service not registered');
    }
    
    // Check Solana services
    status.solana = {};
    for (const [serviceId, service] of this.solanaServices) {
      try {
        const network = await service.getCurrentNetwork();
        status.solana[serviceId] = network;
      } catch (error) {
        status.solana[serviceId] = { error: error.message };
        console.error(`❌ Error getting Solana service ${serviceId} status:`, error);
      }
    }

    return status;
  }

  // Get summary of registered services
  getRegisteredServices() {
    return {
      generalServices: Array.from(this.services.keys()),
      solanaServices: Array.from(this.solanaServices.keys()),
      totalServices: this.services.size + this.solanaServices.size
    };
  }
}

// Export a singleton instance
const settingsRefreshService = new SettingsRefreshService();

// Auto-register the Stripe service
settingsRefreshService.registerService('stripe', stripeService);

export default settingsRefreshService; 