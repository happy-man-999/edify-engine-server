import { Router } from 'express';
import SolanaService from '../services/solanaService.js';
import DigitalOceanService from '../services/digitalOceanService.js';

const router = Router();

const tempHeap = {}

router.post('/transaction', async (req, res) => {
  const authHeader = req.headers['authorization'];
  
  if (authHeader === process.env.HELIUS_WEBHOOK_AUTH) {
    const { type, signature } = Array.isArray(req.body) ? req.body[0] : req.body;
    if (type === 'TRANSFER' && signature) {
      if (tempHeap[signature]) {
        return res.status(200).json({ message: 'Transaction already processed' });
      }
      tempHeap[signature] = true;

      try {
        const solanaService = new SolanaService();
        const txInfo = await solanaService.getTransactionInfo(signature);
        console.log('Transaction Info:', txInfo);
      } catch (error) {
        console.error('Error fetching transaction info:', error.message);
        return res.status(500).json({ error: 'Failed to process transaction' });
      }

      let dropletId;
      
      try {
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        const result = await digitalOceanService.createNewDroplet({
          name: signature.slice(0, 6),
          image: process.env.SAMPLE_DROPLET_SNAPSHOT_ID
        });

        if (!result.droplet || !result.droplet.id) {
          return res.status(500).json({ error: 'Failed to create droplet' });
        }
        dropletId = result.droplet.id;
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