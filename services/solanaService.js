import { Connection, clusterApiUrl } from '@solana/web3.js';

class SolanaService {
  constructor(network = 'devnet') {
    this.connection = new Connection(clusterApiUrl(network), 'confirmed');
  }

  async getTransactionInfo(signature) {
    try {
      const txInfo = await this.connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });

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
      const memo = memoLog?.match(/"(.+?)"/)?.[1]; // Extract the memo string in quotes

      return {
        sender,
        amount,
        memo
      };
    } catch (error) {
      throw new Error(`Failed to fetch transaction info: ${error.message}`);
    }
  }
}

export default SolanaService;