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

### 2. Pass-through USB Device (for Modbus RTU)

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

Enter the container:

```bash
pct enter <CTID>
```

Install modbus2mqtt from GitHub Release:

```bash
# Update Alpine repositories
apk update
apk upgrade

# Set version (visit GitHub Releases for latest version)
VERSION="0.16.56"

# Detect architecture
ARCH=$(uname -m)

# Download and install public signing key (architecture-independent)
wget https://github.com/modbus2mqtt/server/releases/download/v${VERSION}/packager.rsa.pub \
  -O /etc/apk/keys/packager-modbus2mqtt.rsa.pub

# Note: The published public key is IDENTICAL for all architectures (single key pair).

# Download and install package (architecture-specific)
wget https://github.com/modbus2mqtt/server/releases/download/v${VERSION}/modbus2mqtt-${VERSION}-r0-${ARCH}.apk
apk add modbus2mqtt-${VERSION}-r0-${ARCH}.apk

# The service is automatically enabled and started by the package installation

# Check service status
rc-service modbus2mqtt status
```

**Note:** Visit [GitHub Releases](https://github.com/modbus2mqtt/server/releases) to find the latest version number.

### Package Verification

The public key (`packager.rsa.pub`) verifies that packages are signed by the official build system. This ensures the integrity and authenticity of the downloaded package.

To verify the key fingerprint:

```bash
sha256sum /etc/apk/keys/packager-modbus2mqtt.rsa.pub
```

### Configuration

modbus2mqtt provides a Web UI for configuration. After installation, access it via:

```
http://<container-ip>:3000
```

If no configuration exists, the service starts with the root URL and guides you through the initial setup via the Web UI.

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
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Or using awall (Alpine Wall)
apk add awall
echo 'variable:
  port_ssh: 22
  port_modbus2mqtt: 3000
filter:
  - { in: internet, out: _fw, service: tcp/$port_ssh, action: accept }
  - { in: internet, out: _fw, service: tcp/$port_modbus2mqtt, action: accept }' > /etc/awall/optional/modbus2mqtt.json
awall enable modbus2mqtt
awall activate
```

## Autostart Configuration

Enable container autostart in Proxmox:

```bash
pct set <CTID> -onboot 1
```

The modbus2mqtt service is automatically configured and enabled during package installation.

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
