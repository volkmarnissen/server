# Devcontainer for modbus2mqtt

## Included Services and Ports
- **mosquitto** (MQTT broker, ports: 3001, 3003)
- **nginx** (reverse proxy, port: 3006)
- **modbusTCP server** (port: 3002)
- **modbus2mqtt** (ports: 3004, 3005, 3007)
- **browser debugger** (port: 9222)

All ports are automatically forwarded to localhost.

## Usage
- After opening in the devcontainer, all dependencies are installed automatically (`npm install`).
- E2E tests can be run directly in the container using `npm run e2e:start` and `npm run e2e:stop`.
- The infrastructure (mosquitto, nginx, etc.) is preinstalled in the container.

## Notes
- The Python scripts for starting/stopping the test servers work in the container, since all required system tools (nginx, mosquitto, python3, etc.) are installed.
- The ports are exposed as described in the documentation in `cypress/E2E-TESTING.md`.
