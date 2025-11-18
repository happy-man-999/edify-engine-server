import axios from 'axios';
import Action from '../models/Action.js';
import Droplet from '../models/Droplet.js';
import DropletService from './dropletService.js';
import LogService from './logService.js';
import webhookService from './webhookService.js';
import Settings from '../models/Settings.js';
import dotenv from 'dotenv';

dotenv.config();

class DigitalOceanService {
  constructor(token, sshKeyId) {
    this.token = token;
    this.sshKeyId = sshKeyId;
  }

  async createNewDroplet(dropletConfig = {}) {
    try {
      const newDropletName = dropletConfig?.name?.toLowerCase() || 'new-world';
      // Default configuration
      const defaultConfig = {
        name: "new-world",
        region: "nyc3",
        size: "s-1vcpu-1gb",
        image: 195000837,
        backups: true,
        ipv6: true,
        monitoring: true,
        tags: ["cloned", "world"],
        ssh_keys: [this.sshKeyId],
        user_data: `#cloud-config\nruncmd:\n  - certbot certonly --dns-digitalocean --dns-digitalocean-credentials /etc/letsencrypt/digitalocean.ini -d ${newDropletName}.edifyengine.com --non-interactive --agree-tos -m lovesuper.panda414@gmail.com\n\n  - cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak\n\n  - |\n    cat > /etc/nginx/sites-available/default << 'EOF'\n    ##################################################\n    # HTTP -> HTTPS REDIRECT\n    ##################################################\n    server {\n        listen 80;\n        listen [::]:80;\n        server_name ${newDropletName}.edifyengine.com;\n\n        # Redirect all HTTP requests to HTTPS\n        return 301 https://$host$request_uri;\n    }\n\n    ##################################################\n    # HTTPS SERVER BLOCK\n    ##################################################\n    server {\n        listen 443 ssl;        # Enable SSL on IPv4\n        listen [::]:443 ssl;   # Enable SSL on IPv6\n        server_name ${newDropletName}.edifyengine.com;\n\n        # Your SSL certificate files (adjust paths as needed)\n        ssl_certificate     /etc/letsencrypt/live/${newDropletName}.edifyengine.com/fullchain.pem;\n        ssl_certificate_key /etc/letsencrypt/live/${newDropletName}.edifyengine.com/privkey.pem;\n\n        # Allow up to 50 MB uploads\n        client_max_body_size 50M;\n\n        # (Optional) If clients are slow, give the upstream more time\n        proxy_read_timeout 300s;\n        proxy_send_timeout 300s;\n\n        # Proxy all requests to your Node.js app\n        location / {\n            proxy_pass http://localhost:3000;  # Change 3000 if your app uses a different port\n            proxy_http_version 1.1;\n            proxy_set_header Upgrade $http_upgrade;\n            proxy_set_header Connection 'upgrade';\n            proxy_set_header Host $host;\n            proxy_cache_bypass $http_upgrade;\n            proxy_set_header X-Real-IP $remote_addr;\n            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n            proxy_set_header X-Forwarded-Proto $scheme;\n        }\n\n        location = /editor {\n            return 301 /editor/;\n        }\n\n        location /editor/ {\n            proxy_pass http://127.0.0.1:8080/;\n\n            proxy_http_version 1.1;\n            proxy_set_header Upgrade $http_upgrade;\n            proxy_set_header Connection "upgrade";\n            proxy_set_header Host $host;\n\n            # forward client IP info\n            proxy_set_header X-Real-IP $remote_addr;\n            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n            proxy_set_header X-Forwarded-Proto $scheme;\n\n            # optional: disable buffering to improve terminal responsiveness\n            proxy_buffering off;\n        }\n    }\n    EOF\n\n  - systemctl start nginx\n\n  - sleep 10`,
      };

      // Merge default config with provided config
      const config = { ...defaultConfig, ...dropletConfig };console.log('Creating droplet with config:', config);

      const response = await axios.post('https://api.digitalocean.com/v2/droplets', config, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('DigitalOcean API error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }
  async getDropletInfo(dropletId) {
    const response = await axios.get(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }
  async getDropletPublicNetwork(dropletId) {
    let dropletInfo
    while (true) {
      dropletInfo = await this.getDropletInfo(dropletId)
      if (dropletInfo.droplet && dropletInfo.droplet.networks 
        && dropletInfo.droplet.networks.v4 
        && dropletInfo.droplet.networks.v4.length > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const dropletIp = dropletInfo.droplet.networks.v4.find(ethernet => ethernet.type === 'public')?.ip_address;
    return dropletIp;
  }
  async assignSubdomain(dropletId, domain, subdomain) {
    const dropletIp = await this.getDropletPublicNetwork(dropletId);
    
    const response = await axios.post(`https://api.digitalocean.com/v2/domains/${domain}/records`, {
      type: 'A',
      name: subdomain,
      data: dropletIp
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }

  async removeSubdomain(domain, subdomain) {
    try {
      // First, get all records for the domain to find the subdomain record
      const response = await axios.get(`https://api.digitalocean.com/v2/domains/${domain}/records`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      // Find the record with the matching subdomain name
      const record = response.data.domain_records.find(record => record.name === subdomain);
      
      if (record) {
        // Delete the found record
        await axios.delete(`https://api.digitalocean.com/v2/domains/${domain}/records/${record.id}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          }
        });
        
        return { success: true, message: `Subdomain ${subdomain} removed successfully` };
      } else {
        return { success: false, message: `Subdomain ${subdomain} not found` };
      }
    } catch (error) {
      console.error('Error removing subdomain:', error.message);
      return { success: false, message: `Failed to remove subdomain: ${error.message}` };
    }
  }

  async getSubdomains(domain) {
    try {
      const response = await axios.get(`https://api.digitalocean.com/v2/domains/${domain}/records`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      return {
        success: true,
        subdomains: response.data.domain_records.map(record => ({
          id: record.id,
          name: record.name,
          type: record.type,
          data: record.data
        }))
      };
    } catch (error) {
      console.error('Error getting subdomains:', error.message);
      return { success: false, message: `Failed to get subdomains: ${error.message}` };
    }
  }
  async powerOnDroplet(dropletId) {
    const response = await axios.post(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
      type: 'power_on'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }

  async powerOffDroplet(dropletId) {
    const response = await axios.post(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
      type: 'power_off'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }

  async rebootDroplet(dropletId) {
    const response = await axios.post(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
      type: 'reboot'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }

  async deleteDroplet(dropletId) {
    const response = await axios.delete(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data;
  }

  async getDroplet(dropletId) {
    const response = await axios.get(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    });

    return response.data.droplet;
  }

  // Complete droplet setup workflow: power on, wait for readiness, SSH access, PM2 management
  async completeDropletSetup(dropletId, newDropletName, sourceDomain = null) {
    try {
      console.log(`Starting complete setup workflow for droplet ${dropletId}`);
      
      // Step 1: Power on the droplet
      console.log(`Powering on droplet ${dropletId}...`);
      await this.powerOnDroplet(dropletId);
      console.log(`Droplet ${dropletId} power on initiated`);
      
      // Step 2: Get droplet IP address
      console.log(`Getting IP address for droplet ${dropletId}...`);
      const dropletIp = await this.getDropletPublicNetwork(dropletId);
      console.log(`Droplet ${dropletId} IP address: ${dropletIp}`);
      
      // Step 3: Wait for 2 minutes as requested
      console.log(`Waiting 2 minutes before making HTTP request...`);
      await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
      
      // Step 4: Make HTTP POST request to update .env and start hyperfy
      console.log(`Making HTTP request to start hyperfy on droplet ${dropletId}...`);
      
      // Determine which domain to replace in .env file
      const domainToReplace = sourceDomain || 'world.edifyengine.com';
      console.log(`Replacing domain in .env: ${domainToReplace} -> ${newDropletName}.edifyengine.com`);
      
      await this.executeCommandViaHTTP(dropletIp, `sed -i 's/${domainToReplace}/${newDropletName}.edifyengine.com/g' /var/www/hyperfy/.env`);
      const httpResult = await this.executeCommandViaHTTP(dropletIp, 'cd /var/www/hyperfy && pm2 start npm --name "hyperfy" -- run dev');
      
      // Step 5: Wait for 2 minutes and reload nginx
      console.log(`Waiting 2 minutes before reloading nginx...`);
      await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
      // Reload nginx to apply any configuration changes
      console.log(`Reloading nginx for droplet ${dropletId}...`);
      try {
        const nginxReloadResult = await this.executeCommandViaHTTP(dropletIp, 'systemctl reload nginx');
        if (nginxReloadResult.success) {
          console.log(`Nginx reloaded successfully for droplet ${dropletId}`);
        } else {
          console.log(`Nginx reload failed for droplet ${dropletId}: ${nginxReloadResult.message}`);
        }
      } catch (nginxError) {
        console.warn(`Error reloading nginx for droplet ${dropletId}: ${nginxError.message}`);
      }

      if (httpResult.success) {
        console.log(`HTTP request to start hyperfy completed successfully for droplet ${dropletId}`);
        
        // Save PM2 configuration to persist across reboots
        console.log(`Saving PM2 configuration for droplet ${dropletId}...`);
        const pm2SaveResult = await this.executeCommandViaHTTP(dropletIp, 'pm2 save');
        if (pm2SaveResult.success) {
          console.log(`PM2 configuration saved successfully for droplet ${dropletId}`);
        } else {
          console.log(`PM2 save failed for droplet ${dropletId}: ${pm2SaveResult.message}`);
        }
        
        return { success: true, message: 'Droplet setup completed successfully', ipAddress: dropletIp };
      } else {
        console.log(`HTTP request to start hyperfy failed for droplet ${dropletId}: ${httpResult.message}`);
        return { success: false, message: `Droplet setup completed but hyperfy start failed: ${httpResult.message}`, ipAddress: dropletIp };
      }
      
    } catch (error) {
      console.error(`Error in complete droplet setup for ${dropletId}:`, error.message);
      throw new Error(`Failed to complete droplet setup: ${error.message}`);
    }
  }

  // Setup custom domain: certbot, nginx, env update, and PM2 reload
  async setupCustomDomain(ipAddress, customDomain, subdomain) {
    try {      
      // Step 1: Create SSL certificate with certbot
      const certbotResult = await this.executeCommandViaHTTP(ipAddress, `sudo certbot certonly --nginx -d ${customDomain} -m lovesuper.panda414@gmail.com --agree-tos --non-interactive`);
      
      if (!certbotResult.success) {
        console.error(`Certbot failed: ${certbotResult.message}`);
        return { success: false, message: `SSL certificate creation failed: ${certbotResult.message}` };
      }
            
      // Step 2: Configure nginx for custom domain
      const nginxConfig = this.generateNginxConfig(customDomain);
      const nginxResult = await this.executeCommandViaHTTP(ipAddress, `echo '${nginxConfig}' > /etc/nginx/sites-available/${customDomain}`);
      
      if (!nginxResult.success) {
        console.error(`Nginx config creation failed: ${nginxResult.message}`);
        return { success: false, message: `Nginx configuration failed: ${nginxResult.message}` };
      }
      
      // Enable the site
      const enableSiteResult = await this.executeCommandViaHTTP(ipAddress, `ln -sf /etc/nginx/sites-available/${customDomain} /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default`);
      
      if (!enableSiteResult.success) {
        console.error(`Nginx site enable failed: ${enableSiteResult.message}`);
        return { success: false, message: `Nginx site enable failed: ${enableSiteResult.message}` };
      }
      
      // Test nginx configuration
      const nginxTestResult = await this.executeCommandViaHTTP(ipAddress, 'nginx -t');
      if (!nginxTestResult.success) {
        console.error(`Nginx configuration test failed: ${nginxTestResult.message}`);
        return { success: false, message: `Nginx configuration test failed: ${nginxTestResult.message}` };
      }
      
      // Reload nginx
      const nginxReloadResult = await this.executeCommandViaHTTP(ipAddress, 'systemctl reload nginx');
      if (!nginxReloadResult.success) {
        console.error(`Nginx reload failed: ${nginxReloadResult.message}`);
        return { success: false, message: `Nginx reload failed: ${nginxReloadResult.message}` };
      }
      
      // Step 3: Update hyperfy environment file
      
      // Determine the search string based on subdomain type
      let searchString;
      if (subdomain && subdomain.includes('.')) {
        // Full domain (e.g., "example.com")
        searchString = subdomain;
      } else {
        // Subdomain part (e.g., "myapp" -> "myapp.edifyengine.com")
        searchString = subdomain ? `${subdomain}.edifyengine.com` : 'world.edifyengine.com';
      }
      
      const envUpdateResult = await this.executeCommandViaHTTP(ipAddress, `sed -i 's/${searchString}/${customDomain}/g' /var/www/hyperfy/.env`);
      
      if (!envUpdateResult.success) {
        console.error(`Environment file update failed: ${envUpdateResult.message}`);
        return { success: false, message: `Environment file update failed: ${envUpdateResult.message}` };
      }
      
      // Step 4: Reload PM2 with updated environment
      const pm2ReloadResult = await this.executeCommandViaHTTP(ipAddress, 'pm2 reload hyperfy --update-env');
      
      if (!pm2ReloadResult.success) {
        console.error(`PM2 reload failed: ${pm2ReloadResult.message}`);
        return { success: false, message: `PM2 reload failed: ${pm2ReloadResult.message}` };
      }
      
      // Save PM2 configuration to persist across reboots
      const pm2SaveResult = await this.executeCommandViaHTTP(ipAddress, 'pm2 save');
      if (!pm2SaveResult.success) {
        console.error(`PM2 configuration save failed: ${pm2SaveResult.message}`);
        return { success: false, message: `PM2 configuration save failed: ${pm2SaveResult.message}` };
      }
      
      return {
        success: true,
        message: `Custom domain ${customDomain} setup completed successfully`,
        customDomain: customDomain
      };
      
    } catch (error) {
      console.error(`Error setting up custom domain ${customDomain}:`, error.message);
      return { success: false, message: `Custom domain setup failed: ${error.message}` };
    }
  }

  // Execute command via HTTP request to port 2999
  async executeCommandViaHTTP(ipAddress, command) {
    try {
      const url = `http://${ipAddress}:2999/run`;
      const payload = {
        command: command
      };
      
      console.log(`Executing command via HTTP: ${command}`);
      
      const response = await axios.post(url, payload, {
        timeout: 60000, // 60 second timeout for longer operations
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Command execution result:`, {
        status: response.status,
        data: response.data
      });
      
      return {
        success: true,
        status: response.status,
        data: response.data,
        message: 'Command executed successfully'
      };
      
    } catch (error) {
      console.error(`Command execution failed:`, error.message);
      
      if (error.response) {
        return {
          success: false,
          status: error.response.status,
          message: `Server error: ${error.response.status} ${error.response.statusText}`,
          data: error.response.data
        };
      } else if (error.request) {
        return {
          success: false,
          message: 'No response received from server - connection timeout or server unreachable',
          error: error.message
        };
      } else {
        return {
          success: false,
          message: `Request setup failed: ${error.message}`,
          error: error.message
        };
      }
    }
  }

  async createSnapshot(dropletId, snapshotName) {
    try {
      console.log(`Creating snapshot '${snapshotName}' for droplet ${dropletId}...`);
      
      const response = await axios.post(`https://api.digitalocean.com/v2/droplets/${dropletId}/actions`, {
        type: 'snapshot',
        name: snapshotName
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (response.status === 201) {
        const actionId = response.data.action.id;
        console.log(`Snapshot creation initiated with action ID: ${actionId}`);
        return { 
          success: true, 
          actionId: actionId,
          message: `Snapshot '${snapshotName}' creation initiated successfully` 
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error creating snapshot for droplet ${dropletId}:`, error);
      
      if (error.response?.status === 404) {
        throw new Error(`Droplet ${dropletId} not found`);
      } else if (error.response?.status === 422) {
        throw new Error(`Cannot create snapshot for droplet ${dropletId} (may be powered on)`);
      } else if (error.response?.status === 429) {
        throw new Error(`Rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`Failed to create snapshot for droplet ${dropletId}: ${error.message}`);
      }
    }
  }

  async checkActionStatus(actionId) {
    try {
      console.log(`Checking action status for action ID: ${actionId}...`);
      
      const response = await axios.get(`https://api.digitalocean.com/v2/actions/${actionId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (response.status === 200) {
        const action = response.data.action;
        console.log(`Action ${actionId} status: ${action.status}`);
        return { 
          success: true, 
          status: action.status,
          message: action.message || `Action status: ${action.status}`,
          startedAt: action.started_at,
          completedAt: action.completed_at
        };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error checking action status for action ${actionId}:`, error);
      
      if (error.response?.status === 404) {
        throw new Error(`Action ${actionId} not found`);
      } else if (error.response?.status === 429) {
        throw new Error(`Rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`Failed to check action status for action ${actionId}: ${error.message}`);
      }
    }
  }

  async findSnapshotByName(dropletId, snapshotName) {
    try {
      console.log(`Finding snapshot '${snapshotName}' for droplet ${dropletId}...`);
      
      const response = await axios.get('https://api.digitalocean.com/v2/snapshots', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        params: {
          resource_type: 'droplet',
          resource_id: dropletId
        }
      });

      if (response.status === 200) {
        const snapshots = response.data.snapshots;
        const targetSnapshot = snapshots
          .filter(snapshot => snapshot.name === snapshotName)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        if (targetSnapshot) {
          console.log(`Found snapshot '${snapshotName}' with ID: ${targetSnapshot.id}`);
          return { 
            success: true, 
            snapshotId: targetSnapshot.id,
            snapshot: targetSnapshot,
            message: `Snapshot '${snapshotName}' found successfully` 
          };
        } else {
          return { 
            success: false, 
            message: `Snapshot '${snapshotName}' not found for droplet ${dropletId}` 
          };
        }
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error finding snapshot '${snapshotName}' for droplet ${dropletId}:`, error);
      
      if (error.response?.status === 404) {
        throw new Error(`Droplet ${dropletId} not found`);
      } else if (error.response?.status === 429) {
        throw new Error(`Rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`Failed to find snapshot '${snapshotName}' for droplet ${dropletId}: ${error.message}`);
      }
    }
  }

  async deleteSnapshot(snapshotId) {
    try {
      console.log(`Deleting snapshot ${snapshotId}...`);
      
      const response = await axios.delete(`https://api.digitalocean.com/v2/snapshots/${snapshotId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (response.status === 204) {
        console.log(`Snapshot ${snapshotId} deleted successfully`);
        return { success: true, message: `Snapshot ${snapshotId} deleted successfully` };
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error deleting snapshot ${snapshotId}:`, error);
      
      if (error.response?.status === 404) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      } else if (error.response?.status === 422) {
        throw new Error(`Snapshot ${snapshotId} cannot be deleted (may be in use)`);
      } else {
        throw new Error(`Failed to delete snapshot ${snapshotId}: ${error.message}`);
      }
    }
  }

  // Generate nginx configuration for custom domain
  generateNginxConfig(domain) {
    return `##################################################
# HTTP -> HTTPS REDIRECT
##################################################
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

##################################################
# HTTPS SERVER BLOCK
##################################################
server {
    listen 443 ssl;        # Enable SSL on IPv4
    listen [::]:443 ssl;   # Enable SSL on IPv6
    server_name ${domain};

    # Your SSL certificate files (adjust paths as needed)
    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    # Allow up to 50 MB uploads
    client_max_body_size 50M;

    # (Optional) If clients are slow, give the upstream more time
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # Proxy all requests to your Node.js app
    location / {
        proxy_pass http://localhost:3000;  # Change 3000 if your app uses a different port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /editor {
        return 301 /editor/;
    }

    location /editor/ {
        proxy_pass http://127.0.0.1:8080/;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;

        # forward client IP info
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # optional: disable buffering to improve terminal responsiveness
        proxy_buffering off;
    }
}`;
  }

  // Complete custom domain setup workflow
  async processCustomDomainSetup(sessionId, userId, customDomain, dropletId, dropletService) {
    try {      
      // Step 1: Get droplet IP address and subdomain
      let dropletIp, subdomain;
      try {
        dropletIp = await this.getDropletPublicNetwork(dropletId);
        
        // Get droplet info to retrieve subdomain
        const droplet = await dropletService.getDropletById(dropletId);
        subdomain = droplet.subdomain;
      } catch (ipError) {
        console.error('Error getting droplet IP:', ipError.message);
        throw new Error('Failed to get droplet IP address');
      }
      
      // Step 2: Setup custom domain on the droplet
      const setupResult = await this.setupCustomDomain(dropletIp, customDomain, subdomain);
      
      if (setupResult.success) {
        try {
          await dropletService.updateDropletByDropletId(dropletId, { customDomain: customDomain, name: customDomain });
        } catch (updateError) {
          console.error('Error updating droplet with custom domain:', updateError.message);
        }
        
        return {
          success: true,
          message: `Custom domain ${customDomain} setup completed successfully`,
          customDomain: customDomain,
          dropletId: dropletId,
          ipAddress: dropletIp,
        };
        
      } else {
        throw new Error(`Custom domain setup failed: ${setupResult.message}`);
      }
      
    } catch (error) {
      console.error(`Error in custom domain setup workflow for ${customDomain}:`, error.message);
      
      throw new Error(`Failed to complete custom domain setup: ${error.message}`);
    }
  }

  async startSnapshotUpdateProcess(actionId, userId) {
    try {
      console.log(`Starting background snapshot update process for action: ${actionId}`);
            
      // Update action status to in_progress
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Starting snapshot update process...',
        progress: 10
      });
      
      // Step 1: Power off the sample droplet
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Powering off sample droplet...',
        progress: 20
      });
      
      const sampleDropletId = process.env.DIGITAL_OCEAN_SAMPLE_DROPLET_ID;
      if (!sampleDropletId) {
        await Action.updateStatus(actionId, 'failed', {
          error: {
            message: 'Default droplet ID not configured in settings',
            code: 'CONFIG_ERROR'
          },
          progressMessage: 'Failed: Default droplet ID not configured'
        });
        return;
      }
      
      await this.powerOffDroplet(sampleDropletId);
      
      // Wait for droplet to be powered off
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Waiting for droplet to power off...',
        progress: 30
      });
      
      let dropletInfo;
      while (true) {
        dropletInfo = await this.getDropletInfo(sampleDropletId);
        if (dropletInfo.droplet.status === 'off') {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Step 2: Create a new snapshot
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Creating new snapshot...',
        progress: 40
      });
      
      const snapshotResult = await this.createSnapshot(sampleDropletId, process.env.DIGITAL_OCEAN_SAMPLE_SNAPSHOT_NAME);
      const actualActionId = snapshotResult.actionId;
      
      // Step 3: Monitor snapshot creation
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Snapshot creation in progress...',
        progress: 50
      });
      
      let snapshotCompleted = false;
      let snapshotId = null;
      
      while (!snapshotCompleted) {
        const actionResult = await this.checkActionStatus(actualActionId);
        
        if (actionResult.status === 'completed') {
          snapshotCompleted = true;
          
          // Get the snapshot ID
          const snapshotResult = await this.findSnapshotByName(sampleDropletId, process.env.DIGITAL_OCEAN_SAMPLE_SNAPSHOT_NAME);
          if (snapshotResult.success) {
            snapshotId = snapshotResult.snapshotId;
          } else {
            await Action.updateStatus(actionId, 'failed', {
              error: {
                message: 'Failed to find the newly created snapshot',
                code: 'SNAPSHOT_NOT_FOUND'
              },
              progressMessage: 'Failed: Could not find created snapshot'
            });
            return;
          }
        } else if (actionResult.status === 'errored') {
          await Action.updateStatus(actionId, 'failed', {
            error: {
              message: `Snapshot creation failed: ${actionResult.message || 'Unknown error'}`,
              code: 'DIGITALOCEAN_ERROR'
            },
            progressMessage: 'Failed: Snapshot creation errored'
          });
          return;
        } else {
          await Action.updateStatus(actionId, 'in_progress', {
            progressMessage: `Snapshot status: ${actionResult.status}`,
            progress: 60
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Step 4: Power on the sample droplet
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Powering on sample droplet...',
        progress: 70
      });
      
      await this.powerOnDroplet(sampleDropletId);
      
      // Wait for droplet to be powered on
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Waiting for droplet to power on...',
        progress: 80
      });
      
      while (true) {
        dropletInfo = await this.getDropletInfo(sampleDropletId);
        if (dropletInfo.droplet.status === 'active') {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Step 5: Update settings and mark as completed
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Updating system settings...',
        progress: 85
      });
      
      // Update the default snapshot ID in settings
      const settings = await Settings.getSettings();
      const oldSnapshotId = settings.defaultSnapshotId;
      
      await Settings.findOneAndUpdate(
        {}, 
        { defaultSnapshotId: snapshotId },
        { new: true }
      );
      
      console.log(`Snapshot updated successfully. Old ID: ${oldSnapshotId}, New ID: ${snapshotId}`);
      
      // Delete the old snapshot
      if (oldSnapshotId && oldSnapshotId !== snapshotId) {
        try {
          await Action.updateStatus(actionId, 'in_progress', {
            progressMessage: 'Cleaning up old snapshot...',
            progress: 90
          });
          
          await this.deleteSnapshot(oldSnapshotId);
          console.log(`Old snapshot ${oldSnapshotId} deleted successfully`);
        } catch (deleteError) {
          console.warn(`Failed to delete old snapshot ${oldSnapshotId}:`, deleteError.message);
          // Don't fail the entire process if old snapshot deletion fails
        }
      }
      
      // Log the settings update
      try {
        await LogService.logSettingsUpdated(userId, {
          defaultSnapshotId: { old: oldSnapshotId, new: snapshotId },
          snapshotUpdate: { 
            actionId: actionId, 
            status: 'completed',
            message: `Snapshot update completed. New ID: ${snapshotId}`
          }
        });
      } catch (logError) {
        console.error('Error logging snapshot update completion:', logError);
      }
      
      // Final step: Wait 2 minutes and start the application
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Waiting 2 minutes before starting application...',
        progress: 95
      });
      
      console.log('Waiting 2 minutes before starting application...');
      await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
      
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Starting application via PM2...',
        progress: 99
      });
      
      try {
        // Get the sample droplet IP address
        const dropletIp = await this.getDropletPublicNetwork(sampleDropletId);
        
        if (dropletIp) {
          console.log(`Starting application on droplet IP: ${dropletIp}:2999`);
          
          // Make HTTP request to start the application
          const startAppResult = await this.executeCommandViaHTTP(
            dropletIp, 
            'cd /var/www/hyperfy && pm2 start npm --name "hyperfy" -- run dev'
          );
          
          if (startAppResult.success) {
            console.log('Application started successfully via PM2');
            await Action.updateStatus(actionId, 'in_progress', {
              progressMessage: 'Application started successfully!',
              progress: 99
            });
          } else {
            console.warn('Failed to start application via PM2:', startAppResult.message);
            await Action.updateStatus(actionId, 'in_progress', {
              progressMessage: 'Warning: Application start may have failed',
              progress: 99
            });
          }
        } else {
          console.warn('Could not determine droplet IP address for application start');
          await Action.updateStatus(actionId, 'in_progress', {
            progressMessage: 'Warning: Could not determine droplet IP',
            progress: 99
          });
        }
      } catch (appStartError) {
        console.warn('Error starting application:', appStartError.message);
        await Action.updateStatus(actionId, 'in_progress', {
          progressMessage: 'Warning: Application start encountered an error',
          progress: 99
        });
        // Don't fail the entire process if app start fails
      }
      
      // Mark action as completed
      await Action.updateStatus(actionId, 'completed', {
        result: {
          snapshotId: snapshotId,
          message: `Snapshot updated successfully. New snapshot ID: ${snapshotId}`,
          oldSnapshotId: oldSnapshotId,
          applicationStarted: true
        },
        progressMessage: 'Snapshot update and application start completed successfully!',
        progress: 100
      });
      
      console.log(`Background snapshot update process completed for action: ${actionId}`);
      
    } catch (error) {
      console.error(`Error in background snapshot update process for action ${actionId}:`, error);
           
      // Update action as failed
      await Action.updateStatus(actionId, 'failed', {
        error: {
          message: error.message,
          code: 'PROCESS_ERROR',
          details: error.stack
        },
        progressMessage: `Failed: ${error.message}`
      });
    }
  }

  async startTryWorldUpdateProcess(actionId, userId) {
    const tryWorldHost = 'try.edifyengine.com';

    const rsyncCommand =
      `rsync -avz --exclude='/.env' -e "ssh -i /root/.ssh/hyperfy_rsync_key" root@world.edifyengine.com:/var/www/hyperfy/ /var/www/hyperfy/`;
    const pm2ReloadCommand = 'pm2 reload hyperfy --update-env';

    const markFailed = async (
      message,
      code = 'TRY_WORLD_UPDATE_ERROR',
      details = null,
      progress = 0
    ) => {
      await Action.updateStatus(actionId, 'failed', {
        progressMessage: message,
        error: {
          message,
          code,
          details
        },
        progress
      });
    };

    try {
      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Preparing Try world sync...',
        progress: 10
      });

      if (!tryWorldHost) {
        await markFailed(
          'Failed: Try world host is not configured',
          'TRY_WORLD_CONFIG_ERROR',
          null,
          10
        );
        return;
      }

      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Syncing latest Hyperfy build to Try world...',
        progress: 40
      });

      const rsyncResult = await this.executeCommandViaHTTP(tryWorldHost, rsyncCommand);

      const rsyncSucceeded =
        rsyncResult &&
        rsyncResult.success &&
        (rsyncResult.data?.success === undefined || rsyncResult.data.success === true);

      if (!rsyncSucceeded) {
        await markFailed(
          'Failed: Unable to sync Hyperfy files to Try world',
          'TRY_WORLD_RSYNC_FAILED',
          rsyncResult?.data || rsyncResult,
          40
        );
        return;
      }

      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Reloading Hyperfy service on Try world...',
        progress: 70
      });

      const reloadResult = await this.executeCommandViaHTTP(tryWorldHost, pm2ReloadCommand);

      const reloadSucceeded =
        reloadResult &&
        reloadResult.success &&
        (reloadResult.data?.success === undefined || reloadResult.data.success === true);

      if (!reloadSucceeded) {
        await markFailed(
          'Failed: Unable to reload Hyperfy service on Try world',
          'TRY_WORLD_PM2_RELOAD_FAILED',
          reloadResult?.data || reloadResult,
          70
        );
        return;
      }

      await Action.updateStatus(actionId, 'in_progress', {
        progressMessage: 'Finalizing Try world update...',
        progress: 90
      });

      try {
        await LogService.logSettingsUpdated(userId, {
          tryWorldUpdate: {
            status: 'completed',
            host: tryWorldHost,
            commands: [rsyncCommand, pm2ReloadCommand]
          }
        });
      } catch (logError) {
        console.error('Error logging Try world update completion:', logError);
      }

      await Action.updateStatus(actionId, 'completed', {
        progressMessage: 'Try world updated successfully!',
        progress: 100,
        result: {
          host: tryWorldHost,
          rsync: rsyncResult?.data || null,
          pm2: reloadResult?.data || null
        }
      });
    } catch (error) {
      console.error('Error during Try world update process:', error);
      await markFailed(
        error.message || 'Failed: Try world update encountered an unexpected error',
        'TRY_WORLD_UPDATE_ERROR',
        null,
        0
      );
    }
  }
}

export default DigitalOceanService;