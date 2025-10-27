import { Connection, clusterApiUrl } from '@solana/web3.js';
import Settings from '../models/Settings.js';

class SolanaService {
  constructor(network = null) {
    this.network = network;
    this.connection = null;
    this.lastSettingsHash = null;
  }

  // Generate a hash of current settings to detect changes
  async getSettingsHash() {
    try {
      const settings = await Settings.getSettings();
      return `${settings.solanaMode}-${settings.isTestMode}`;
    } catch (error) {
      console.error('Error getting settings hash:', error);
      return null;
    }
  }

  async initializeConnection() {
    try {
      const settings = await Settings.getSettings();
      
      // Determine network based on settings
      let targetNetwork = this.network;
      if (!targetNetwork) {
        // If test mode is enabled, force devnet
        if (settings.isTestMode) {
          targetNetwork = 'devnet';
        } else {
          targetNetwork = settings.solanaMode;
        }
      }
      
      // If network changed, reset connection
      if (this.network !== targetNetwork) {
        this.network = targetNetwork;
        this.connection = null;
      }
      
      if (!this.connection) {
        let endpoint;
        if (this.network === 'mainnet') {
          // Use Helius RPC for mainnet - API key should be in .env file
          const heliusApiKey = process.env.HELIUS_API_KEY;
          if (!heliusApiKey) {
            console.warn('Helius API key not found in environment variables');
            // Fallback to a free endpoint if no API key
            endpoint = 'https://ssc-dao.genesysgo.net/';
          } else {
            endpoint = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
          }
        } else {
          endpoint = 'https://api.devnet.solana.com';
        }
        
        this.connection = new Connection(endpoint, 'confirmed');
        console.log(`Solana connection initialized for ${this.network.toUpperCase()}`);
      }
      
      return this.connection;
    } catch (error) {
      console.error('Error initializing Solana connection:', error);
      // Fallback to devnet if settings fail
      this.network = 'devnet';
      this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      return this.connection;
    }
  }

  async getConnection() {
    // Check if settings have changed and refresh if needed
    const currentHash = await this.getSettingsHash();
    if (currentHash !== this.lastSettingsHash) {
      this.lastSettingsHash = currentHash;
      this.connection = null; // Force reconnection
      console.log('Solana settings changed, refreshing connection...');
    }
    
    if (!this.connection) {
      await this.initializeConnection();
    }
    return this.connection;
  }

  // Get current network mode for debugging
  async getCurrentNetwork() {
    await this.getConnection();
    return this.network;
  }

  // Force refresh connection (useful for admin settings changes)
  async refreshConnection() {
    this.connection = null;
    this.lastSettingsHash = null;
    return await this.initializeConnection();
  }

  async getTransactionInfo(signature) {
    try {
      const connection = await this.getConnection();
      const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });

      const accountKeys = txInfo.transaction.message.accountKeys.map(k => k.toString());

      // Pre and post balances for each account
      const preBalances = txInfo.meta.preBalances;
      const postBalances = txInfo.meta.postBalances;

      // Loop over accounts to find who lost SOL (payer)
      let transfers = [];
      for (let i = 0; i < accountKeys.length; i++) {
        const delta = preBalances[i] - postBalances[i];
        if (delta > 0) {
          transfers.push({
            sender: accountKeys[i],
            amountSOL: delta / 1e9 // Convert lamports to SOL
          });
        }
      }

      // You can take the first one as sender (most likely)
      const sender = transfers[0]?.sender;
      const amount = transfers[0]?.amountSOL;

      const memoLog = txInfo.meta.logMessages.find(log => log.startsWith("Program log: Memo"));
      // Extract memo from first " to end of string (not just to last ")
      const memo = memoLog?.match(/"(.+)"/)?.[1]; // Extract the memo string in quotes
      
      // Parse memo more robustly - handle cases where userId might contain hyphens
      let userId, itemId, metadata = null;
      if (memo) {
        // Check if memo contains metadata (indicated by | separator)
        const pipeIndex = memo.indexOf('|');
        
        if (pipeIndex !== -1) {
          // Memo contains metadata
          const mainPart = memo.substring(0, pipeIndex);
          const metadataString = memo.substring(pipeIndex + 1);
          
          // Parse main part (userId*itemId)
          const lastHyphenIndex = mainPart.lastIndexOf('*');
          if (lastHyphenIndex !== -1) {
            userId = mainPart.substring(0, lastHyphenIndex);
            itemId = mainPart.substring(lastHyphenIndex + 1);
          } else {
            userId = mainPart;
            itemId = null;
          }
          
          // Parse metadata JSON
          try {
            metadata = JSON.parse(metadataString.replace(/\\"/g, '"'));
          } catch (error) {
            console.warn('Failed to parse metadata from memo:', error);
          }
        } else {
          // No metadata, just parse userId*itemId
          const lastHyphenIndex = memo.lastIndexOf('*');
          if (lastHyphenIndex !== -1) {
            userId = memo.substring(0, lastHyphenIndex);
            itemId = memo.substring(lastHyphenIndex + 1);
          } else {
            userId = memo;
            itemId = null;
          }
        }
      }

      return {
        sender,
        amount,
        userId,
        itemId,
        metadata
      };
    } catch (error) {
      throw new Error(`Failed to fetch transaction info: ${error.message}`);
    }
  }
}

export default SolanaService;