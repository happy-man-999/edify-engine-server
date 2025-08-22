import axios from 'axios';

class DigitalOceanService {
  constructor(token) {
    this.token = token;
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
        user_data: `#cloud-config\nruncmd:\n  - certbot certonly --dns-digitalocean --dns-digitalocean-credentials /etc/letsencrypt/digitalocean.ini -d ${newDropletName}.edifyengine.com --non-interactive --agree-tos -m edifyengine@gmail.com\n\n  - cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak\n\n  - |\n    cat > /etc/nginx/sites-available/default << 'EOF'\n    ##################################################\n    # HTTP -> HTTPS REDIRECT\n    ##################################################\n    server {\n        listen 80;\n        listen [::]:80;\n        server_name ${newDropletName}.edifyengine.com;\n\n        return 301 https://$host$request_uri;\n    }\n\n    ##################################################\n    # HTTPS SERVER BLOCK\n    ##################################################\n    server {\n        listen 443 ssl;\n        listen [::]:443 ssl;\n        server_name app.edifyengine.com;\n\n        ssl_certificate     /etc/letsencrypt/live/${newDropletName}.edifyengine.com/fullchain.pem;\n        ssl_certificate_key /etc/letsencrypt/live/${newDropletName}.edifyengine.com/privkey.pem;\n\n        location / {\n            proxy_pass http://localhost:3000;\n            proxy_http_version 1.1;\n            proxy_set_header Upgrade $http_upgrade;\n            proxy_set_header Connection 'upgrade';\n            proxy_set_header Host $host;\n            proxy_cache_bypass $http_upgrade;\n            proxy_set_header X-Real-IP $remote_addr;\n            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n            proxy_set_header X-Forwarded-Proto $scheme;\n        }\n    }\n    EOF\n\n  - systemctl start nginx`
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
}

export default DigitalOceanService;