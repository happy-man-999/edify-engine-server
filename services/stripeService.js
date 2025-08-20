import Stripe from 'stripe';
import Settings from '../models/Settings.js';

class StripeService {
  constructor() {
    this.stripe = null;
    this.lastSettingsHash = null;
    this.lastStripeKey = null;
  }

  // Generate a hash of current settings to detect changes
  async getSettingsHash() {
    try {
      const settings = await Settings.getSettings();
      return `${settings.stripeMode}-${settings.isTestMode}-${settings.stripeSecretKey}`;
    } catch (error) {
      console.error('Error getting settings hash:', error);
      return null;
    }
  }

  // Initialize Stripe with settings from MongoDB
  async initializeStripe() {
    try {
      const settings = await Settings.getSettings();
      
      // Check if we should use test mode based on settings
      const isTestMode = settings.isTestMode || settings.stripeMode === 'test';
      
      if (settings.stripeSecretKey && settings.stripeSecretKey !== this.lastStripeKey) {
        let secretKey = settings.stripeSecretKey;
        
        // If test mode is enabled, ensure we're using test keys
        if (isTestMode) {
          if (secretKey.startsWith('sk_live_')) {
            // Convert live key to test key format
            secretKey = secretKey.replace('sk_live_', 'sk_test_');
          }
          // If it's already a test key, use it as is
        } else {
          // Live mode - ensure we're using live keys
          if (secretKey.startsWith('sk_test_')) {
            // Convert test key to live key format
            secretKey = secretKey.replace('sk_test_', 'sk_live_');
          }
          // If it's already a live key, use it as is
        }
        
        this.stripe = new Stripe(secretKey);
        this.lastStripeKey = secretKey;
        
        console.log(`Stripe initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode`);
        console.log(`Using key: ${secretKey.substring(0, 10)}...`);
      } else if (!settings.stripeSecretKey) {
        console.log('Stripe secret key not found in settings. Payment functionality will be disabled.');
        this.stripe = null;
      }
    } catch (error) {
      console.error('Error initializing Stripe from settings:', error);
      this.stripe = null;
    }
  }

  // Get Stripe instance, refreshing if settings have changed
  async getStripe() {
    // Check if settings have changed and refresh if needed
    const currentHash = await this.getSettingsHash();
    if (currentHash !== this.lastSettingsHash) {
      this.lastSettingsHash = currentHash;
      this.stripe = null; // Force reinitialization
      console.log('Stripe settings changed, refreshing instance...');
    }
    
    if (!this.stripe) {
      await this.initializeStripe();
    }
    return this.stripe;
  }

  // Force refresh Stripe instance (useful for admin settings changes)
  async refreshStripe() {
    this.stripe = null;
    this.lastSettingsHash = null;
    this.lastStripeKey = null;
    return await this.initializeStripe();
  }

  // Check if Stripe is properly configured
  async isConfigured() {
    try {
      const stripe = await this.getStripe();
      return !!stripe;
    } catch (error) {
      return false;
    }
  }

  // Get current mode for debugging
  async getCurrentMode() {
    try {
      const settings = await Settings.getSettings();
      return {
        stripeMode: settings.stripeMode,
        isTestMode: settings.isTestMode,
        configured: await this.isConfigured()
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Export a singleton instance
const stripeService = new StripeService();
export default stripeService; 