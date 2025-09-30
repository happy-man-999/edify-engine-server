import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import dns from 'dns';
import { promisify } from 'util';
import Droplet from '../models/Droplet.js';
import axios from 'axios';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import LogService from '../services/logService.js';
import { authenticateToken } from '../middleware/auth.js';

dotenv.config();

const dropletService = new DropletService();
const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);

// Promisify DNS lookup for async/await usage
const lookup = promisify(dns.lookup);

const router = express.Router();

// Check domain health endpoint
router.get('/check-health', async (req, res) => {
  try {
    const { domain, dropletId } = req.query;
    let droplet = null, originalDomain = null;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    try {
      droplet = await dropletService.getDropletById(dropletId);
      originalDomain = droplet.customDomain || `${droplet.subdomain}.edifyengine.com`;
      if (!droplet) {
        return res.status(404).json({ error: 'Droplet not found' });
      }
    } catch (error) {
      console.error('Error finding droplet:', error);
      return res.status(500).json({ error: 'Failed to find droplet' });
    }

    const healthUrl = `https://${domain}/env.js`;
    console.log('Server checking domain health at:', healthUrl);

    // Create an insecure HTTPS agent (equivalent to curl --insecure)
    const insecureAgent = new https.Agent({
      rejectUnauthorized: false
    });

    let healthStatus = 'disconnected';
    let dnsConnected = false;

    try {
      // Check if domain IP matches droplet IP (DNS connection check)
      const domainLookup = await lookup(domain);
      if (domainLookup.address === droplet.ipAddress) {
        dnsConnected = true;
        console.log(`DNS check passed: ${domain} (${domainLookup.address}) matches droplet IP (${droplet.ipAddress})`);
      } else {
        console.log(`DNS check failed: ${domain} (${domainLookup.address}) does not match droplet IP (${droplet.ipAddress})`);
      }
    } catch (dnsError) {
      console.log(`DNS lookup failed for ${domain}:`, dnsError.message);
    }

    try {
      const {data} = await axios.get(healthUrl, {
        httpsAgent: insecureAgent
      });
      
      // Determine status based on both DNS and HTTP response
      if (data.includes(`https://${originalDomain}`)) {
        healthStatus = 'connected';
      } else if (data.includes(`https://${domain}`)) {
        healthStatus = 'certified';
      } else if (dnsConnected) {
        healthStatus = 'connected'; // New status for DNS-only connection
      } else {
        healthStatus = 'disconnected';
      }
    } catch (httpError) {
      console.log(`HTTP health check failed for ${domain}:`, httpError.message);
      // If HTTP fails but DNS is connected, still report DNS connection
      if (dnsConnected) {
        healthStatus = 'connected';
      }
    }
    
    res.json({
      success: true,
      status: healthStatus,
      domain,
      dnsConnected,
      dropletIp: droplet.ipAddress
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.json({
      success: false,
      status: 'error',
      domain: req.query.domain,
      protocol: req.query.protocol,
      message: error.message
    });
  }
});

// Get droplet IP address endpoint
router.get('/droplet/:dropletId/ip', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    if (!dropletId) {
      return res.status(400).json({ error: 'Droplet ID parameter is required' });
    }

    // Find the droplet in the database
    const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
    
    if (!droplet) {
      return res.status(404).json({ 
        error: 'Droplet not found',
        message: `Droplet with ID ${dropletId} not found`
      });
    }

    if (!droplet.ipAddress) {
      return res.status(404).json({ 
        error: 'IP address not available',
        message: `Droplet ${dropletId} does not have an IP address yet. It may still be being created.`
      });
    }

    res.json({
      dropletId: droplet.dropletId,
      name: droplet.name,
      ipAddress: droplet.ipAddress,
      status: droplet.status
    });
    
  } catch (error) {
    console.error('Get droplet IP error:', error);
    res.status(500).json({ 
      error: 'Failed to get droplet IP address',
      message: error.message 
    });
  }
});

// Entri authentication endpoint
router.post('/entri/token', async (req, res) => {
  try {
    const response = await fetch('https://api.goentri.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // These values come from the Entri dashboard
        applicationId: process.env.ENTRI_APPLICATION_ID,
        secret: process.env.ENTRI_SECRET
      }),
    });

    if (!response.ok) {
      throw new Error(`Entri API error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.auth_token) {
      res.json({
        success: true,
        auth_token: data.auth_token
      });
    } else {
      throw new Error('No auth token received from Entri API');
    }
    
  } catch (error) {
    console.error('Entri authentication error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to authenticate with Entri',
      message: error.message 
    });
  }
});

// Custom domain setup endpoint
router.post('/custom-domain/setup', authenticateToken, async (req, res) => {
  try {
    const { dropletId, customDomain } = req.body;
    const userId = req.user._id;

    if (!dropletId || !customDomain) {
      return res.status(400).json({ 
        error: 'Droplet ID and custom domain are required' 
      });
    }

    // Process custom domain setup with await
    const result = await digitalOceanService.processCustomDomainSetup(
      `custom-domain-${Date.now()}`, // sessionId
      userId, 
      customDomain, 
      dropletId, 
      dropletService
    );

    res.json({ 
      success: true, 
      message: result.message,
      customDomain: result.customDomain,
      dropletId: result.dropletId,
      ipAddress: result.ipAddress,
      processing: false
    });
    
  } catch (error) {
    console.error('Error initiating custom domain setup:', error);
    
    LogService.logError({
      message: 'Custom domain setup failed',
      error: error.message,
      context: 'custom_domain_setup',
      userId: userId
    });

    res.status(500).json({ 
      success: false,
      error: 'Failed to initiate custom domain setup',
      message: error.message 
    });
  }
});

export default router;
