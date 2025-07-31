import axios from 'axios';

class DigitalOceanService {
  constructor(token) {
    this.token = token;
  }

  async createNewDroplet(dropletConfig = {}) {
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
console.log(dropletInfo.droplet.networks.v4);
    const dropletIp = dropletInfo.droplet.networks.v4.find(ethernet => ethernet.type === 'public')?.ip_address;
    return dropletIp;
  }
  async assignSubdomain(dropletId, domain, subdomain) {
    const dropletIp = await this.getDropletPublicNetwork(dropletId);
    console.log("IP: ", dropletId)
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
}

export default DigitalOceanService;