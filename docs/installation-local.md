# Local Installation

## Prerequisites

- Node.js 20 or higher
- npm or yarn package manager
- Git (for cloning the repository)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/modbus2mqtt/server.git
cd server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Git Hooks (for contributors)

```bash
npm run install-hooks
```

This will set up pre-commit hooks that automatically format code with Prettier.

### 4. Build the Application

```bash
npm run build
```

For development builds:

```bash
npm run build.dev
```

## Running the Application

### Production Mode

```bash
npm start
```

or directly:

```bash
node dist/modbus2mqtt.js
```

### Development Mode

```bash
npm run server
```

With custom configuration:

```bash
node dist/modbus2mqtt.js -c /path/to/config -d /path/to/data
```

## Command Line Options

- `-c, --config <path>` - Configuration directory (default: `./config`)
- `-d, --data <path>` - Data directory (default: `./data`)
- `-p, --port <port>` - HTTP server port (default: `3000`)
- `-h, --help` - Display help information

## Configuration

### Configuration Files

Configuration files are stored in the config directory:

```
config/
├── modbus2mqtt/
│   ├── modbus2mqtt.yaml    # Main configuration
│   ├── specifications/     # Device specifications
│   └── busses/            # Bus configurations
```

### MQTT Configuration

Edit `config/modbus2mqtt/modbus2mqtt.yaml`:

```yaml
mqttconnect:
  mqttserverurl: mqtt://localhost:1883
  mqttusername: your-username
  mqttpassword: your-password

httpport: 3000
```

## Running Tests

### Unit Tests

```bash
npm test
```

### E2E Tests

Start the test servers:

```bash
npm run e2e:start
```

Run Cypress tests:

```bash
npm run cypress:open
```

Stop test servers:

```bash
npm run e2e:stop
```

## Development Workflow

### Watch Mode

For automatic rebuilds during development:

```bash
npm run build.dev -- --watch
```

### Code Formatting

Format all code:

```bash
npm run prettier
```

### Running in VS Code

1. Open the project in VS Code
2. Press `F5` to start debugging
3. The application will start with the debugger attached

## Troubleshooting

### Port Already in Use

Change the port in the configuration or use the `-p` flag:

```bash
node dist/modbus2mqtt.js -p 3001
```

### Missing Dependencies

Reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Serial Port Permissions (Linux)

Add your user to the `dialout` group:

```bash
sudo usermod -a -G dialout $USER
```

Log out and back in for changes to take effect.

## Next Steps

- [Configuration Guide](./configuration.md)
- [Adding Devices](./adding-devices.md)
- [Creating Specifications](./creating-specifications.md)
- [Development Setup](./development.md)
