import express from 'express';
import Droplet from '../models/Droplet.js';
import Proceed from '../models/Proceed.js';
import Settings from '../models/Settings.js';

const router = express.Router();

/**
 * Check world owner's proceed status by domain
 * Used by hyperfy client to check if world owner needs to connect wallet
 */
router.post('/check-world-owner-proceed', async (req, res) => {
  try {
    const { domain, walletName } = req.body;

    if (!domain || !walletName) {
      return res.status(400).json({
        success: false,
        message: 'Domain and walletName are required'
      });
    }

    // Get default DNS domain from settings
    const settings = await Settings.getSettings();
    const defaultDnsDomain = settings.defaultDnsDomain || 'edifyengine.com';

    // Find droplet by domain (either custom domain or subdomain)
    let droplet = null;

    // Check if it's a custom domain
    droplet = await Droplet.findOne({
      customDomain: domain,
      status: { $in: ['new', 'active'] }
    }).populate('user', 'email');

    // If not found, check if it's a subdomain
    if (!droplet && domain.endsWith(`.${defaultDnsDomain}`)) {
      const subdomain = domain.replace(`.${defaultDnsDomain}`, '');
      droplet = await Droplet.findOne({
        subdomain: subdomain,
        status: { $in: ['new', 'active'] }
      }).populate('user', 'email');
    }

    // If still not found, try just the domain as subdomain
    if (!droplet) {
      droplet = await Droplet.findOne({
        subdomain: domain,
        status: { $in: ['new', 'active'] }
      }).populate('user', 'email');
    }

    if (!droplet) {
      return res.status(404).json({
        success: false,
        message: 'World not found for this domain',
        exists: false,
        hasValidCredentials: false
      });
    }

    // Get owner email
    const ownerEmail = droplet.user?.email;
    if (!ownerEmail) {
      return res.status(404).json({
        success: false,
        message: 'World owner email not found',
        exists: false,
        hasValidCredentials: false
      });
    }

    // Check proceed collection for owner
    const proceedEntry = await Proceed.findOne({
      email: ownerEmail.toLowerCase(),
      walletName: walletName.trim()
    });

    const exists = !!proceedEntry;

    // Check if proceed entry has valid mnemonic or private key
    let hasValidCredentials = false;
    if (proceedEntry) {
      // Check for valid mnemonic (12 or 24 words)
      if (proceedEntry.mnemonic) {
        const words = proceedEntry.mnemonic.trim().split(/\s+/);
        if (words.length === 12 || words.length === 24) {
          hasValidCredentials = true;
        }
      }

      // Check for valid private key (non-empty)
      if (!hasValidCredentials && proceedEntry.privateKey && proceedEntry.privateKey.trim().length > 0) {
        hasValidCredentials = true;
      }
    }

    res.json({
      success: true,
      exists,
      hasValidCredentials,
      email: ownerEmail.toLowerCase(),
      walletName: walletName.trim()
    });
  } catch (error) {
    console.error('Error checking world owner proceed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check world owner proceed',
      error: error.message
    });
  }
});

export default router;

