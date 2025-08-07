import { Router } from 'express';
import SolanaService from '../services/solanaService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';

const transactionService = new TransactionService();
const dropletService = new DropletService();

const router = Router();

const tempHeap = {}

// Test endpoint to verify route is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Solana route is working', timestamp: new Date().toISOString() });
});

router.post('/transaction', async (req, res) => {  
  // Check required environment variables
  if (!process.env.HELIUS_WEBHOOK_AUTH) {
    console.error('HELIUS_WEBHOOK_AUTH environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  const authHeader = req.headers['authorization'];
  
  if (authHeader === process.env.HELIUS_WEBHOOK_AUTH) {
    const { type, signature } = Array.isArray(req.body) ? req.body[0] : req.body;
    if (type === 'TRANSFER' && signature) {
      if (tempHeap[signature]) {
        return res.status(200).json({ message: 'Transaction already processed' });
      }
      tempHeap[signature] = true;

      let txInfo;
      try {
        const solanaService = new SolanaService();
        txInfo = await solanaService.getTransactionInfo(signature);
      } catch (error) {
        console.error('Error fetching transaction info:', error.message);
        return res.status(500).json({ error: 'Failed to fetch transaction info' });
      }

      // Save transaction to MongoDB using transaction service
      try {
        await transactionService.createTransaction({
          signature: signature,
          user: txInfo.userId,
          amount: txInfo.amount,
          paymentMethod: 'solana',
          status: 'success',
          date: new Date(),
          item: txInfo.itemId
        });
      } catch (error) {
        console.error('Error saving transaction to database:', error.message);
        return res.status(500).json({ error: 'Failed to save transaction' });
      }

      let dropletId;
      
      try {
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        const result = await digitalOceanService.createNewDroplet({
          name: signature.slice(0, 6),
          image: process.env.SAMPLE_DROPLET_SNAPSHOT_ID
        });
        console.log(result)

        if (!result.droplet || !result.droplet.id) {
          return res.status(500).json({ error: 'Failed to create droplet' });
        }
        dropletId = result.droplet.id;

        // Save droplet information to database
        try {
          await dropletService.createDroplet({
            dropletId: result.droplet.id,
            name: result.droplet.name,
            sizeSlug: result.droplet.size_slug,
            regionSlug: result.droplet.region.slug,
            status: result.droplet.status,
            createdAt: new Date(result.droplet.created_at),
            user: txInfo.userId,
            transaction: transaction._id, // Save reference to the transaction
            memory: result.droplet.memory,
            vcpus: result.droplet.vcpus,
            disk: result.droplet.disk,
            priceMonthly: result.droplet.size.price_monthly,
            tags: result.droplet.tags || []
          });
        } catch (error) {
          console.error('Error saving droplet to database:', error.message);
          // Don't fail the entire process if droplet save fails
        }
      } catch (error) {
        console.error('Error creating droplet:', error.message);
        return res.status(500).json({ error: 'Failed to create droplet' });
      }

      try {
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        await digitalOceanService.assignSubdomain(dropletId, process.env.DOMAIN, "new."+signature.slice(0, 6));
      } catch (error) {
        console.error('Error assigning subdomain:', error.message);
        return res.status(500).json({ error: 'Failed to assign subdomain' });
      }

      try {
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        await digitalOceanService.powerOnDroplet(dropletId);
      } catch (error) {
        console.error('Error running droplet:', error.message);
        return res.status(500).json({ error: 'Failed to run droplet' });
      }
    }
    res.status(200).json({ message: 'Transaction processed successfully' });
  } else {
    console.log('Authorization failed');
    res.status(401).json({ error: 'Unauthorized' });
  }
});

export default router;