# modbus2mqtt

[![GitHub release](https://img.shields.io/github/release/modbus2mqtt/server.svg)](https://github.com/modbus2mqtt/server/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Bridge between Modbus devices and MQTT with automatic Home Assistant discovery.

## Overview

modbus2mqtt enables seamless integration of Modbus devices (RTU/TCP) into your smart home system via MQTT. It features a user-friendly web interface, automatic Home Assistant discovery, and community-driven device specifications.

**Key Features:**
- Web-based configuration UI
- Modbus RTU & TCP support
- MQTT integration with Home Assistant discovery
- Community device specifications
- Real-time monitoring

## Quick Start

### Installation

Choose your preferred method:

- **[Home Assistant Add-on](https://github.com/modbus2mqtt/hassio-addon-repository)** - Direct Home Assistant integration.
Best option for home assistant users.
- **[Docker](docs/installation-docker.md)** - Recommended for all other users
- **[Proxmox LXC](docs/installation-proxmox.md)** - Deploy in Proxmox container
- **[Local Installation](docs/installation-local.md)** - Run with Node.js



### Usage

After installation, access the web interface at `http://localhost:3000` and follow the [Getting Started Guide](docs/getting-started.md).

## Documentation

- **[Getting Started](docs/getting-started.md)** - First steps and basic configuration
- **[Contributing](docs/contributing.md)** - How to contribute to the project
- **[Installation Guides](docs/)** - Detailed installation instructions

For complete documentation, see the [docs/](docs/) directory.

## Development

```bash
# Clone and install
git clone https://github.com/modbus2mqtt/server.git
cd server
npm install
npm run install-hooks

# Build and test
npm run build.dev
npm test
```

See the [Contributing Guide](docs/contributing.md) for detailed development instructions.

## Support

- **[Documentation](docs/)** - Comprehensive guides
- **[GitHub Issues](https://github.com/modbus2mqtt/server/issues)** - Bug reports and feature requests
- **[GitHub Discussions](https://github.com/modbus2mqtt/server/discussions)** - Community support

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ by the modbus2mqtt community
