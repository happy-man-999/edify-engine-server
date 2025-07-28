import { Router } from 'express';
import SolanaService from '../services/solanaService.js';

const router = Router();

router.post('/transaction', async (req, res) => {
  const authHeader = req.headers['authorization'];
  
  if (authHeader === process.env.HELIUS_WEBHOOK_AUTH) {
    const { type, signature } = Array.isArray(req.body) ? req.body[0] : req.body;
    if (type === 'TRANSFER' && signature) {
      try {
        const solanaService = new SolanaService();
        const txInfo = await solanaService.getTransactionInfo(signature)
        console.log('Transaction Info:', txInfo);
      }
      catch (error) {
        console.error('Error fetching transaction info:', error);
        return res.status(500).json({ error: 'Failed to fetch transaction info' });
      }
    }
    res.status(200).json({ message: 'Transaction processed successfully' });
  }
  else {
    console.log('Authorization failed');
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;