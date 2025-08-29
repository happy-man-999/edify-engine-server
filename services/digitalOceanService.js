import axios from 'axios';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

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
        user_data: `#cloud-config\nruncmd:\n  - certbot certonly --dns-digitalocean --dns-digitalocean-credentials /etc/letsencrypt/digitalocean.ini -d ${newDropletName}.edifyengine.com --non-interactive --agree-tos -m lovesuper.panda414@gmail.com\n\n  - cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak\n\n  - |\n    cat > /etc/nginx/sites-available/default << 'EOF'\n    ##################################################\n    # HTTP -> HTTPS REDIRECT\n    ##################################################\n    server {\n        listen 80;\n        listen [::]:80;\n        server_name ${newDropletName}.edifyengine.com;\n\n        return 301 https://$host$request_uri;\n    }\n\n    ##################################################\n    # HTTPS SERVER BLOCK\n    ##################################################\n    server {\n        listen 443 ssl;\n        listen [::]:443 ssl;\n        server_name app.edifyengine.com;\n\n        ssl_certificate     /etc/letsencrypt/live/${newDropletName}.edifyengine.com/fullchain.pem;\n        ssl_certificate_key /etc/letsencrypt/live/${newDropletName}.edifyengine.com/privkey.pem;\n\n        location / {\n            proxy_pass http://localhost:3000;\n            proxy_http_version 1.1;\n            proxy_set_header Upgrade $http_upgrade;\n            proxy_set_header Connection 'upgrade';\n            proxy_set_header Host $host;\n            proxy_cache_bypass $http_upgrade;\n            proxy_set_header X-Real-IP $remote_addr;\n            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n            proxy_set_header X-Forwarded-Proto $scheme;\n        }\n    }\n    EOF\n\n  - systemctl start nginx\n\n  - sed -i 's/world.edifyengine.com/${newDropletName}.edifyengine.com/g' /var/www/hyperfy/.env\n\n  - pm2 reload hyperfy --update-env`,
      };

      // Merge default config with provided config
      const config = { ...defaultConfig, ...dropletConfig };

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
  async completeDropletSetup(dropletId) {
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
      
      // Step 4: Make HTTP POST request to start hyperfy
      console.log(`Making HTTP request to start hyperfy on droplet ${dropletId}...`);
      const httpResult = await this.executeCommandViaHTTP(dropletIp, 'cd /var/www/hyperfy && pm2 start npm --name "hyperfy" -- run dev');
      
      if (httpResult.success) {
        console.log(`HTTP request to start hyperfy completed successfully for droplet ${dropletId}`);
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
  async setupCustomDomain(ipAddress, customDomain) {
    try {
      console.log(`Setting up custom domain ${customDomain} on droplet ${ipAddress}`);
      
      // Step 1: Create SSL certificate with certbot
      console.log(`Step 1: Creating SSL certificate for ${customDomain}`);
      const certbotResult = await this.executeCommandViaHTTP(ipAddress, `certbot certonly --dns-digitalocean --dns-digitalocean-credentials /etc/letsencrypt/digitalocean.ini -d ${customDomain} --non-interactive --agree-tos -m lovesuper.panda414@gmail.com`);
      
      if (!certbotResult.success) {
        console.error(`Certbot failed: ${certbotResult.message}`);
        return { success: false, message: `SSL certificate creation failed: ${certbotResult.message}` };
      }
      
      console.log(`SSL certificate created successfully for ${customDomain}`);
      
      // Step 2: Configure nginx for custom domain
      console.log(`Step 2: Configuring nginx for ${customDomain}`);
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
      
      console.log(`Nginx configured successfully for ${customDomain}`);
      
      // Step 3: Update hyperfy environment file
      console.log(`Step 3: Updating hyperfy environment file for ${customDomain}`);
      const envUpdateResult = await this.executeCommandViaHTTP(ipAddress, `sed -i 's/world.edifyengine.com/${customDomain}/g' /var/www/hyperfy/.env`);
      
      if (!envUpdateResult.success) {
        console.error(`Environment file update failed: ${envUpdateResult.message}`);
        return { success: false, message: `Environment file update failed: ${envUpdateResult.message}` };
      }
      
      console.log(`Environment file updated successfully for ${customDomain}`);
      
      // Step 4: Reload PM2 with updated environment
      console.log(`Step 4: Reloading PM2 with updated environment for ${customDomain}`);
      const pm2ReloadResult = await this.executeCommandViaHTTP(ipAddress, 'pm2 reload hyperfy --update-env');
      
      if (!pm2ReloadResult.success) {
        console.error(`PM2 reload failed: ${pm2ReloadResult.message}`);
        return { success: false, message: `PM2 reload failed: ${pm2ReloadResult.message}` };
      }
      
      console.log(`PM2 reloaded successfully for ${customDomain}`);
      
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

  // Generate nginx configuration for custom domain
  generateNginxConfig(domain) {
    return `##################################################
# HTTP -> HTTPS REDIRECT
##################################################
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    return 301 https://$host$request_uri;
}

##################################################
# HTTPS SERVER BLOCK
##################################################
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${domain};

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
  }

  // Create custom domain DNS record in DigitalOcean
  async createCustomDomainDNS(customDomain, dropletIp) {
    try {
      console.log(`Creating DNS record for custom domain ${customDomain} pointing to ${dropletIp}`);
      
      // Extract the domain and subdomain from the custom domain
      const domainParts = customDomain.split('.');
      if (domainParts.length < 2) {
        throw new Error(`Invalid custom domain format: ${customDomain}`);
      }
      
      // For custom domains like "example.com", we need to create an A record
      // For subdomains like "app.example.com", we need to create an A record with the subdomain name
      let domainName, subdomainName;
      
      if (domainParts.length === 2) {
        // Custom domain like "example.com"
        domainName = customDomain;
        subdomainName = '@'; // @ represents the root domain
      } else {
        // Subdomain like "app.example.com"
        const subdomain = domainParts.slice(0, -2).join('.');
        domainName = domainParts.slice(-2).join('.');
        subdomainName = subdomain;
      }
      
      console.log(`Domain: ${domainName}, Subdomain: ${subdomainName}`);
      
      // Check if the domain exists in DigitalOcean, create it if it doesn't exist
      let domainExists = false;
      try {
        const domainResponse = await axios.get(`https://api.digitalocean.com/v2/domains/${domainName}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          }
        });
        
        console.log(`Domain ${domainName} found in DigitalOcean`);
        domainExists = true;
      } catch (domainError) {
        if (domainError.response && domainError.response.status === 404) {
          console.log(`Domain ${domainName} not found in DigitalOcean, creating it now...`);
          
          try {
            // Create the domain in DigitalOcean
            const createDomainResponse = await axios.post('https://api.digitalocean.com/v2/domains', {
              name: domainName,
              ip_address: dropletIp // Set the default IP for the domain
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
              }
            });
            
            if (createDomainResponse.data && createDomainResponse.data.domain) {
              console.log(`Domain ${domainName} created successfully in DigitalOcean`);
              domainExists = true;
              
              // Wait a moment for the domain to be fully created
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              throw new Error('Failed to create domain - invalid response from DigitalOcean');
            }
          } catch (createError) {
            console.error(`Error creating domain ${domainName}:`, createError.message);
            throw new Error(`Failed to create domain ${domainName} in DigitalOcean: ${createError.message}`);
          }
        } else {
          throw new Error(`Error checking domain ${domainName}: ${domainError.message}`);
        }
      }
      
      if (!domainExists) {
        throw new Error(`Failed to ensure domain ${domainName} exists in DigitalOcean`);
      }
      
      // Create A record pointing to the droplet IP
      const dnsRecord = {
        type: 'A',
        name: subdomainName === '@' ? '@' : subdomainName,
        data: dropletIp,
        ttl: 300 // 5 minutes TTL for quick propagation
      };
      
      console.log(`Creating DNS record:`, dnsRecord);
      
      // If we just created the domain, we might need to wait a bit longer for it to be fully ready
      if (!domainExists) {
        console.log(`Waiting additional time for newly created domain ${domainName} to be ready...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 more seconds
      }
      
      let response;
      try {
        response = await axios.post(`https://api.digitalocean.com/v2/domains/${domainName}/records`, dnsRecord, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          }
        });
      } catch (dnsError) {
        console.error(`Error creating DNS record:`, dnsError.message);
        if (dnsError.response) {
          console.error(`DigitalOcean API error:`, dnsError.response.data);
        }
        throw new Error(`Failed to create DNS record: ${dnsError.message}`);
      }
      
      if (response.data && response.data.domain_record) {
        console.log(`DNS record created successfully for ${customDomain}`);
        return {
          success: true,
          message: `DNS record created for ${customDomain}`,
          recordId: response.data.domain_record.id,
          domain: domainName,
          subdomain: subdomainName,
          ipAddress: dropletIp,
          domainCreated: !domainExists,
          domainName: domainName
        };
      } else {
        throw new Error('Failed to create DNS record - invalid response from DigitalOcean');
      }
      
    } catch (error) {
      console.error(`Error creating DNS record for ${customDomain}:`, error.message);
      return {
        success: false,
        message: `Failed to create DNS record: ${error.message}`,
        error: error.message
      };
    }
  }

  // Complete custom domain setup workflow
  async processCustomDomainSetup(sessionId, userId, customDomain, dropletId, dropletService, emitWebhookEvent) {
    try {
      console.log(`Starting custom domain setup workflow for ${customDomain}`);
      
      // Step 1: Check if custom domain is already in use by another droplet
      console.log(`Step 1: Checking if custom domain ${customDomain} is already in use`);
      const existingDroplet = await dropletService.getDropletByCustomDomain(customDomain);
      
      if (existingDroplet) {
        const errorMessage = `Custom domain ${customDomain} is already in use by droplet ${existingDroplet.dropletId}`;
        console.error(errorMessage);
        
        // Emit webhook event for frontend with error if function is provided
        if (emitWebhookEvent && typeof emitWebhookEvent === 'function') {
          emitWebhookEvent(userId, 'custom-domain-setup-failed', {
            sessionId,
            customDomain: customDomain,
            error: errorMessage,
            status: 'failed',
            reason: 'domain_already_in_use',
            existingDropletId: existingDroplet.dropletId
          });
        }
        
        throw new Error(errorMessage);
      }
      
      console.log(`Custom domain ${customDomain} is available for use`);
      
      // Step 3: Get droplet IP address
      console.log(`Step 3: Getting droplet IP address`);
      let dropletIp;
      try {
        dropletIp = await this.getDropletPublicNetwork(dropletId);
        console.log(`Droplet ${dropletId} IP address: ${dropletIp}`);
      } catch (ipError) {
        console.error('Error getting droplet IP:', ipError.message);
        throw new Error('Failed to get droplet IP address');
      }
      
      // Step 4: Create DNS record in DigitalOcean
      console.log(`Step 4: Creating DNS record in DigitalOcean`);
      const dnsResult = await this.createCustomDomainDNS(customDomain, dropletIp);
      
      if (!dnsResult.success) {
        throw new Error(`DNS record creation failed: ${dnsResult.message}`);
      }
      
      console.log(`DNS record created successfully: ${dnsResult.message}`);
      
      // Step 5: Setup custom domain on the droplet
      console.log(`Step 5: Setting up custom domain on droplet`);
      const setupResult = await this.setupCustomDomain(dropletIp, customDomain);
      
      if (setupResult.success) {
        console.log(`Custom domain ${customDomain} setup completed successfully`);
        
        // Step 6: Update droplet record with custom domain
        console.log(`Step 6: Updating droplet record with custom domain`);
        try {
          await dropletService.updateDropletSubdomain(dropletId, customDomain);
          console.log(`Droplet ${dropletId} updated with custom domain ${customDomain}`);
        } catch (updateError) {
          console.error('Error updating droplet with custom domain:', updateError.message);
          // Don't fail the entire process if database update fails
        }
        
        // Emit webhook event for frontend if function is provided
        if (emitWebhookEvent && typeof emitWebhookEvent === 'function') {
          emitWebhookEvent(userId, 'custom-domain-setup-completed', {
            sessionId,
            dropletId: dropletId,
            customDomain: customDomain,
            status: 'completed'
          });
        }
        
        return {
          success: true,
          message: `Custom domain ${customDomain} setup completed successfully`,
          customDomain: customDomain,
          dropletId: dropletId,
          ipAddress: dropletIp,
          dnsRecordId: dnsResult.recordId
        };
        
      } else {
        throw new Error(`Custom domain setup failed: ${setupResult.message}`);
      }
      
    } catch (error) {
      console.error(`Error in custom domain setup workflow for ${customDomain}:`, error.message);
      
      // Emit webhook event for frontend with error if function is provided
      if (emitWebhookEvent && typeof emitWebhookEvent === 'function') {
        emitWebhookEvent(userId, 'custom-domain-setup-failed', {
          sessionId,
          customDomain: customDomain,
          error: error.message,
          status: 'failed'
        });
      }
      
      throw new Error(`Failed to complete custom domain setup: ${error.message}`);
    }
  }
}

export default DigitalOceanService;