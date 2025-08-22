import axios from 'axios';

class DigitalOceanService {
  constructor(token) {
    this.token = token;
  }

  async createNewDroplet(dropletConfig = {}) {
    try {
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
        user_data: "#cloud-config\nruncmd:\n  - certbot certonly --dns-digitalocean --dns-digitalocean-credentials /etc/letsencrypt/secrets/digitalocean.ini -d \"*.edifyengine.com\" -d edifyengine.com --non-interactive --agree-tos -m edifyengine@gmail.com\n  - systemctl start nginx"
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