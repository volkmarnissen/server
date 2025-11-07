# Cypress End-to-End Testing Documentation

## Overview

This documentation describes the end-to-end (E2E) tests for modbus2mqtt and their manual execution.

The end-to-end tests **will** ensure, that all for all supported configurations, 
- a configuration, 
- creation of a specification
- MQTT publishing

will work.

End-to-end tests **will not** cover all aspects of the UI and the server.
The UI parts are to be covered in **Cypress component tests**. 

:construction: However, currently, they are only available for a limited set of the functionality.
> :warning:
> New features in the UI should get their own cypress component test.
> Fixes in the UI should also be covered by component tests.

The server parts are covered in **jest** tests.

## Test Infrastructure

The tests need a complete infrastructure consisting of
- A Modbus TCP server which fakes Modbus devices behind Modbus TCP interface.
- A nginx server which fakes the Home Assistant supervisor API and act's as a proxy server in ingress scenario.
- A mosquitto server 
- Several modbus2mqtt servers for different scenarios. 

### Used Ports

| Service | Port | Description |
|---------|------|-------------|
| nginx (Addon Proxy) | 3006 | Nginx reverse proxy for Home Assistant Addon |
| modbus2mqtt (Ingress) | 3004 | modbus2mqtt with Home Assistant Ingress (via nginx:3006) |
| modbusTCP Server | 3002 | Test Modbus TCP Server |
| modbus2mqtt (E2E) | 3005 | modbus2mqtt main test instance |
| mosquitto (with Auth) | 3001 | MQTT Broker with authentication |
| mosquitto (without Auth) | 3003 | MQTT Broker without authentication |
| modbus2mqtt (MQTT NoAuth) | 3007 | modbus2mqtt with NoAuth MQTT |
| browser debugger | 9222 | Debugging angular in vscode |

### Credentials

| Port |-|Authentication | URL | Username | Password |
|------|-|---------------|-----|----------|----------|
| 3001 |MQTT| Required | `mqtt://127.0.0.1:3001` | `homeassistant` | `homeassistant` |
| 3003 |MQTT| None | `mqtt://127.0.0.1:3003` | - | - |
| 3005 |modbus2mqtt| Optional | `http://localhost:3005` | test | test |

**Note:** modbus2mqtt HTTP interfaces (ports 3004, 3005, 3006, 3007) do not require authentication in the test environment.

### HTTP Endpoints

| Scenario | Description |
|----------|-------------|
| [Standard E2E (3005)](http://localhost:3005) | Main modbus2mqtt test instance |
| [Home Assistant Ingress (3006)](http://localhost:3006/ingress) | modbus2mqtt behind Home Assistant ingress |
| [Nginx  (3006)](http://localhost:3006) | Nginx reverse proxy for Home Assistant Addon and supervisor simulator|
| [MQTT NoAuth Test (3007)](http://localhost:3007) | modbus2mqtt with NoAuth MQTT broker |
| Modbus TCP Server (`tcp://localhost:3002`) | Test Modbus TCP server (not HTTP) |

## Starting and Stopping Servers

| Action | Command | Description |
|--------|---------|-------------|
| Start/restart all servers | `npm run e2e:[re]start` | Starts/Restarts nginx, modbustcp, mosquitto and modbus2mqtt |
| Start/restart nginx and modbustcp only | `npm run e2e:[re]start -- --permanent` | Nginx and tcp won't be reconfigured during tests, so no restart required before reiterating tests |
| Start/restart modbus2mqtt and mosquitto only | `npm run e2e:[re]start -- --restart` | Nginx must be available before hassio tests run. For iterations, it's better to restart only modbus2mqtt |
| Stop all servers | `npm run e2e:stop` | Stops all test servers. ```e2e:stop``` has the same options as ```e2e:start``` |

## Running Tests

| Test Type | Command | Description |
|-----------|---------|-------------|
| Jest tests | `npm run e2e:test` | Builds the application and runs all **jest** tests |
| Cypress Component tests | `npm run e2e:cypress` | Builds the application and runs all **cypress component** tests |
| Cypress E2E tests | `npm run e2e:start`<br>`npx cypress run` | Starts all servers, then runs Cypress E2E tests |
| Cypress interactive mode | `npm run e2e:start`<br>`npx cypress open` | Starts all servers, then opens Cypress in interactive mode |
| Retest (after changes) | `npm run e2e:start -- --restart` | Restarts only modbus2mqtt and mosquitto. Hassio scenario needs nginx at startup |

## Debugging

### Server log Files

Test servers log files are located in the root of the package directory ```e2e/modbus2mqtt_<port>.out``` 

### Debugging angular (not server)
Debugging the cypress works by 
- Start cypress
  ```npm run cypress:open``` 
  This is configured to open a browser with debug port ```9222```
  > 👉 This does not work with npx cypress open alone. It needs the environment variable ```CYPRESS_REMOTE_DEBUGGING_PORT=9222``` to be set.

- opening the debugging panel in vscode and launching ```Attach to Chrome(cypress)```
  ```
   This is the launch configuration
   {
        "request": "attach",
        "name": "Attach to Chrome(cypress)",
        "type": "chrome",
        "port":9222,
        "webRoot": "${workspaceFolder}",
        "sourceMaps": true,
        "outFiles": [
            "${workspaceRoot}/dist/angular/**/*.js"
        ]
   }

### Debugging server
- Setup

  - Start the permanent servers only
    ```
    npm run e2e:start -- --permanent
    ```
  - Start the modbus2mqtt server in vscode 
  - Start the other servers
    - for debugging standalone scenario
      ```
      e2e:server.debug 
      ```
    - for debugging hassio scenario
      ```
      e2e:server.debug.ingress 
      ```
- Start the other modbus2mqtt servers
  ```
  npm run e2e:start -- --release
  ```
- Open cypress
  ```
  npm run cypress:open
  ```
- Optional: For debugging Angular code:
  Open the debugging panel in vscode and launching ```Attach to Chrome(cypress)

- Execute the desired Spec

#### Iterations:

Before starting a new e2e cypress test, it is required to restart the modbus2mqtt servers, because the tests require  empty config directories.

This is the procedure:

- Stop the debugged server in vscode
- Remove the content in the configuration directory.
  Check the launch configuration to find out which directory it is.
- Restart the server in vscode again
- Restart the modbus2mqtt services for scenarios which are not debugged 
  ```
  npm run e2e:stop && npm run e2e:start -- --restart
  ```
### Debugging both
Proceed as described in [Debugging Server](#Debugging%20server) but execute option **"For debugging Angular code"**

## Manual Verification

### 1. Test modbus2mqtt Web Interface

**Main instance (Port 3005):**
```bash
curl http://localhost:3005/
```

**Ingress instance (Port 3004):**
```bash
curl http://localhost:3004/
```

**Via nginx proxy (Port 3006):**
```bash
curl http://localhost:3006/
```

### 2. Test MQTT Connection

**With authentication (Port 3001):**
```bash
# Subscribe
mosquitto_sub -h localhost -p 3001 -u homeassistant -P homeassistant -t 'modbus2mqtt/#' -v

# Publish
mosquitto_pub -h localhost -p 3001 -u homeassistant -P homeassistant -t 'modbus2mqtt/test' -m 'Hello'
```

**Without authentication (Port 3003):**
```bash
# Subscribe
mosquitto_sub -h localhost -p 3003 -t 'modbus2mqtt/#' -v

# Publish
mosquitto_pub -h localhost -p 3003 -t 'modbus2mqtt/test' -m 'Hello'
```

### 3. Test Modbus TCP Connection

The test Modbus TCP server runs on port 3002. You can test the connection with a Modbus client:
```bash
# Check if port is open
nc -zv localhost 3002
```

### 4. Check Processes

Show all running test servers:
```bash
lsof -i -P | grep LISTEN | grep -E ':(3001|3002|3003|3004|3005|3006|3007)'
```


### Nginx Configuration

The nginx configuration is located at:
```
./cypress/servers/nginx.conf/nginx.conf
```

During execution, a temporary file with adjusted paths is created.

## Cypress Configuration

The Cypress configuration can be found in `cypress.config.js`:

### Important Environment Variables
from **cypress.config.js**
```javascript
env: {
  logstartup: false,           // Enable startup logging
  logservers: true,            // Enable server logging
  nginxAddonHttpPort: 3006,
  modbus2mqttAddonHttpPort: 3004,
  modbusTcpHttpPort: 3002,
  modbus2mqttE2eHttpPort: 3005,
  mosquittoAuthMqttPort: 3001,
  mosquittoNoAuthMqttPort: 3003,
  modbus2mqttMqttNoAuthPort: 3007,
  mqttconnect: {
    mqttserverurl: 'mqtt://127.0.0.1:3001',
    username: 'homeassistant',
    password: 'homeassistant',
  }
}
```

## Architecture

### Server Types

**Permanent servers (--permanent):**
- nginx (Port 3006)
- modbustcp (Port 3002)

**Restart servers (--restart):**
- mosquitto (Port 3001, 3003)
- modbus2mqtt instances (Port 3004, 3005, 3007)

### Test Scenarios

1. **Standard tests:** All servers are started
2. **Permanent tests:** Only nginx and modbustcp
3. **Restart tests:** Only MQTT and modbus2mqtt (requires existing permanent servers)

## Troubleshooting

### Port already in use
```bash
# Stop all test servers
npm run e2e:stop

# Manually check which process is using the port
lsof -i :3005
```

### Server doesn't start
1. Check the logs in `stderr.out`
2. Make sure all dependencies are installed
3. Check if the required ports are available

### Tests fail
1. Restart servers: `npm run e2e:stop && npm run e2e:start`
2. Check if all servers are running: `lsof -i -P | grep LISTEN | grep -E ':(3001|3002|3003|3004|3005|3006|3007)'`
3. Check logs: `tail -f stderr.out`

## Development

### Adding a new test

Cypress E2E tests are located in:
```
cypress/e2e/
```

### Using MQTT Helper

In tests, you can perform MQTT operations via Cypress tasks:

```javascript
// Connect
cy.task('mqttConnect', { 
  mqttserverurl: 'mqtt://127.0.0.1:3001',
  username: 'homeassistant',
  password: 'homeassistant'
})

// Subscribe to topic
cy.task('mqttSubscribe', 'modbus2mqtt/#')

// Send message
cy.task('mqttPublish', 'modbus2mqtt/test', 'payload')

// Get received messages
cy.task('mqttGetTopicAndPayloads').then((messages) => {
  // Process messages
})

// Close connection
cy.task('mqttClose')
```

## Further Information

- **Cypress Documentation:** https://docs.cypress.io
- **modbus2mqtt Documentation:** ../README.md
- **Test Scripts:** `cypress/servers/testall.py`
