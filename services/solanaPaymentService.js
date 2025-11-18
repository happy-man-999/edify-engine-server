import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import Settings from '../models/Settings.js';
import dotenv from 'dotenv';

dotenv.config();

class SolanaPaymentService {
  constructor() {
    this.connection = null;
    this.network = null;
  }

  async getConnection() {
    if (this.connection) {
      return this.connection;
    }

    // Get network from settings
    const settings = await Settings.getSettings();
    const solanaMode = settings.solanaMode || 'devnet';
    const isTestMode = settings.isTestMode || false;
    
    // If test mode is enabled, force devnet
    const effectiveSolanaMode = isTestMode ? 'devnet' : solanaMode;
    this.network = effectiveSolanaMode;

    const endpoint = effectiveSolanaMode === 'mainnet'
      ? process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com'
      : process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';

    this.connection = new Connection(endpoint, 'confirmed');
    return this.connection;
  }

  async sendSOL(recipientAddress, amountSOL, memo = '') {
    try {
      const connection = await this.getConnection();

      // Get sender keypair from environment variable
      const senderPrivateKey = process.env.SOLANA_PRIVATE_KEY;
      if (!senderPrivateKey) {
        throw new Error('SOLANA_PRIVATE_KEY not configured in environment variables');
      }

      // Decode private key (can be base58 string or JSON array)
      let secretKey;
      try {
        // Try parsing as JSON array first
        secretKey = JSON.parse(senderPrivateKey);
        if (!Array.isArray(secretKey)) {
          throw new Error('Invalid format');
        }
        secretKey = Uint8Array.from(secretKey);
      } catch {
        // If not JSON, assume it's base58 encoded
        try {
          secretKey = bs58.decode(senderPrivateKey);
        } catch (error) {
          throw new Error('SOLANA_PRIVATE_KEY must be either a JSON array or base58 string');
        }
      }
      
      const senderKeypair = Keypair.fromSecretKey(secretKey);

      // Validate recipient address
      let recipientPubkey;
      try {
        recipientPubkey = new PublicKey(recipientAddress);
      } catch (error) {
        throw new Error('Invalid recipient address');
      }

      // Convert SOL to lamports
      const lamports = Math.round(amountSOL * 1e9);

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports,
        })
      );

      // Add memo if provided
      if (memo) {
        const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        transaction.add({
          keys: [],
          programId: memoProgram,
          data: Buffer.from(memo, 'utf8'),
        });
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderKeypair.publicKey;

      // Sign and send transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [senderKeypair],
        {
          commitment: 'confirmed',
          skipPreflight: false,
        }
      );

      return {
        success: true,
        signature,
        network: this.network
      };
    } catch (error) {
      console.error('Error sending SOL payment:', error);
      throw new Error(`Failed to send SOL payment: ${error.message}`);
    }
  }

  // Convert USD to SOL (you may want to fetch current price from an API)
  async convertUsdToSol(usdAmount) {
    // For now, using a simple conversion rate
    // In production, you should fetch the current SOL price from an API
    const SOL_PRICE_USD = parseFloat(process.env.SOL_PRICE_USD) || 100; // Default to $100 if not set
    return usdAmount / SOL_PRICE_USD;
  }
}

export default new SolanaPaymentService();

