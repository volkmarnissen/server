# Installation with Docker

## Prerequisites

- Docker installed on your system
- Docker Compose (optional, but recommended)

## Quick Start

### Using Docker Run

```bash
docker run -d \
  --name modbus2mqtt \
  -p 3000:3000 \
  -v /path/to/config:/config \
  -v /path/to/data:/data \
  --device=/dev/ttyUSB0 \
  modbus2mqtt/server:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  modbus2mqtt:
    image: modbus2mqtt/server:latest
    container_name: modbus2mqtt
    ports:
      - "3000:3000"
    volumes:
      - ./config:/config
      - ./data:/data
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  mosquitto:
    image: eclipse-mosquitto:latest
    container_name: mosquitto
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
    restart: unless-stopped
```

Start the services:

```bash
docker-compose up -d
```

## Configuration

### Volume Mounts

- `/config` - Configuration files (specifications, bus configuration)
- `/data` - Data directory (logs, runtime data)

### Device Access

For Modbus RTU (USB devices), you need to mount the serial device:

```bash
--device=/dev/ttyUSB0
```

Find your device with:

```bash
ls -l /dev/ttyUSB*
# or
ls -l /dev/ttyACM*
```

### Environment Variables

- `NODE_ENV` - Set to `production` for production use
- `MQTT_URL` - MQTT broker URL (default: `mqtt://localhost:1883`)
- `HTTP_PORT` - HTTP server port (default: `3000`)

## Accessing the UI

Open your browser and navigate to:

```
http://localhost:3000
```

## Updating

Pull the latest image:

```bash
docker pull modbus2mqtt/server:latest
docker-compose down
docker-compose up -d
```

## Troubleshooting

### Check Logs

```bash
docker logs modbus2mqtt
```

### Permission Issues with Serial Devices

Add the container user to the `dialout` group or run with appropriate permissions.

## Next Steps

- [Configuration Guide](./configuration.md)
- [Adding Devices](./adding-devices.md)
- [Creating Specifications](./creating-specifications.md)
