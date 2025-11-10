# Installation in Proxmox LXC Container

## Prerequisites

- Proxmox VE 7.0 or higher
- Basic knowledge of Proxmox and LXC containers

## Container Setup

### 1. Create LXC Container with Alpine Linux

In Proxmox web interface:

1. Click **Create CT**
2. Configure the container:
   - **General**
     - Hostname: `modbus2mqtt`
     - Password: Set a secure password
   - **Template**
     - Storage: Select your storage
     - Template: `alpine-3.19-default` or latest Alpine version
   - **Root Disk**
     - Disk size: 4 GB (minimum, Alpine is lightweight)
   - **CPU**
     - Cores: 2
   - **Memory**
     - Memory: 512 MB (Alpine requires less memory)
     - Swap: 512 MB
   - **Network**
     - IPv4: DHCP or static IP

3. Check **Start after created**
4. Click **Finish**

### 2. Enable Nesting (if needed)

For Docker support inside the container:

```bash
pct set <CTID> -features nesting=1
```

### 3. Pass-through USB Device (for Modbus RTU)

Identify the USB device on the Proxmox host:

```bash
lsusb
ls -l /dev/ttyUSB*
```

Edit the container configuration on the Proxmox host:

```bash
nano /etc/pve/lxc/<CTID>.conf
```

Add the following lines:

```
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.mount.entry: /dev/ttyUSB0 dev/ttyUSB0 none bind,optional,create=file
```

Restart the container:

```bash
pct reboot <CTID>
```

## Install modbus2mqtt

### Option 1: Native Installation with Alpine Package

Enter the container:

```bash
pct enter <CTID>
```

Install modbus2mqtt from Alpine package:

```bash
# Update Alpine repositories
apk update
apk upgrade

# Install modbus2mqtt
apk add modbus2mqtt

# Enable and start the service
rc-update add modbus2mqtt default
rc-service modbus2mqtt start
```

Configure modbus2mqtt:

```bash
# Edit configuration
vi /etc/modbus2mqtt/modbus2mqtt.yaml
```

### Option 2: Docker Inside LXC

Enter the container:

```bash
pct enter <CTID>
```

Install Docker on Alpine:

```bash
# Install Docker
apk add docker docker-compose

# Enable and start Docker
rc-update add docker default
rc-service docker start
```

Follow the [Docker installation guide](./installation-docker.md).

### Option 3: Native Installation with Node.js

Enter the container:

```bash
pct enter <CTID>
```

Install Node.js on Alpine:

```bash
# Install Node.js and dependencies
apk add nodejs npm git

# Clone and build modbus2mqtt
git clone https://github.com/modbus2mqtt/server.git /opt/modbus2mqtt
cd /opt/modbus2mqtt
npm install
npm run build
```

Follow the [Local installation guide](./installation-local.md) for configuration.

## Networking

### Port Forwarding

To access modbus2mqtt from outside Proxmox:

1. Note the container IP: `ip addr show`
2. On Proxmox host, add iptables rule:

```bash
iptables -t nat -A PREROUTING -p tcp --dport 3000 -j DNAT --to <container-ip>:3000
```

Or use Proxmox built-in port forwarding in the container settings.

### Firewall Rules (Alpine)

Alpine uses `iptables` or `awall` for firewall configuration:

```bash
# Using iptables
apk add iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Or using awall (Alpine Wall)
apk add awall
echo 'variable:
  port_modbus2mqtt: 3000
filter:
  - { in: internet, out: _fw, service: tcp/$port_modbus2mqtt, action: accept }' > /etc/awall/optional/modbus2mqtt.json
awall enable modbus2mqtt
awall activate
```

## Autostart Configuration

Enable container autostart in Proxmox:

```bash
pct set <CTID> -onboot 1
```

### For Alpine Package Installation

The service is automatically configured with OpenRC:

```bash
# Check service status
rc-service modbus2mqtt status

# Enable autostart
rc-update add modbus2mqtt default
```

### For Manual Node.js Installation

Create an OpenRC service for Alpine:

```bash
vi /etc/init.d/modbus2mqtt
```

```bash
#!/sbin/openrc-run

name="modbus2mqtt"
description="Modbus2MQTT Server"
command="/usr/bin/node"
command_args="/opt/modbus2mqtt/dist/modbus2mqtt.js"
command_background="yes"
pidfile="/run/${RC_SVCNAME}.pid"
directory="/opt/modbus2mqtt"

depend() {
    need net
    after firewall
}
```

Make it executable and enable:

```bash
chmod +x /etc/init.d/modbus2mqtt
rc-update add modbus2mqtt default
rc-service modbus2mqtt start
```

## Resource Management

Monitor resource usage:

```bash
pct status <CTID>
pct config <CTID>
```

Alpine Linux is very lightweight and efficient. Typical resource usage:
- Memory: 256-512 MB for modbus2mqtt
- Storage: 2-4 GB (Alpine base is ~130 MB)

Adjust resources if needed:

```bash
pct set <CTID> -memory 1024 -cores 2
```

## Backup and Restore

### Backup

```bash
vzdump <CTID> --compress zstd --storage local
```

### Restore

In Proxmox web interface:
1. Go to **Storage** → **Backups**
2. Select the backup
3. Click **Restore**

## Troubleshooting

### Container Won't Start

Check logs:

```bash
pct status <CTID>
cat /var/log/pve/tasks/active
```

### USB Device Not Visible

Verify device permissions in Alpine:

```bash
ls -l /dev/ttyUSB0
chmod 666 /dev/ttyUSB0  # temporary fix
```

For permanent fix with Alpine, add user to dialout group:

```bash
addgroup root dialout
```

Or create udev rule:

```bash
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", MODE="0666"' > /etc/udev/rules.d/99-usb-serial.rules
```

### Network Issues

Check network configuration in Alpine:

```bash
pct enter <CTID>
ip addr show
ping google.com

# Check Alpine networking
rc-service networking status
```

### Service Not Starting

Check OpenRC service status:

```bash
rc-service modbus2mqtt status
rc-service modbus2mqtt restart

# View logs
tail -f /var/log/modbus2mqtt.log
```

## Next Steps

- [Configuration Guide](./configuration.md)
- [Adding Devices](./adding-devices.md)
- [Creating Specifications](./creating-specifications.md)
