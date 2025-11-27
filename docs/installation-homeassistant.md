# Installing the Modbus2MQTT Addon in Home Assistant

## Addon Repository Setup

To install the Modbus2MQTT addon in Home Assistant, first add the repository:

1. Open Home Assistant in your browser.
2. Go to **Settings → Add-ons → Add-on Store**.
3. Click the three dots (⋮) at the bottom right and select **Add repository**.
4. Enter the following URL:
   ```
   https://github.com/modbus2mqtt/hassio-addon-repository
   ```
5. Confirm by clicking **Add**.
6. If you want to be able to install patches or older versions, install the following additional repository if not already done:
   ```
   https://github.com/hassio-addons
   ```
7. Search for "modbus2mqtt" and install the addon.

## Logging into the Addon via SSH

To log into the addon via SSH, it is recommended to use the official SSH & Web Terminal addon:

1. Install the [SSH & Web Terminal](https://github.com/hassio-addons/addon-ssh) addon from the Add-on Store.
See the previous chapter if this addon is not listed.
2. Configure a username and password or an SSH key pair.
3. Start the SSH addon.
4. Open an SSH connection to Home Assistant (e.g., with `ssh <user>@<homeassistant-ip>` or via the web terminal).
5. Enter the addon container with:
   ```
   docker exec -it $(docker ps -a --filter label=org.opencontainers.image.source=https://github.com/modbus2mqtt/modbus2mqtt --format "{{.ID}}") sh
   ```
   (You can find `<addon_id>` using `docker ps` or in the Supervisor log.)
6. Install the desired version:
   ```
   npm install -g modbus2mqtt
   # or a specific version:
   npm install -g modbus2mqtt@<version>
   # Example:
   npm install -g modbus2mqtt@0.17.1
   ```
7. Restart the addon

## Installing a Patch or Older Version with Docker

As with the Home Assistant installation, patches can be installed as npm packages in the docker container:

1. Make sure the container is running.
2. Log into the container via SSH (see above) or via `docker exec -it`.
3. Install the desired version:
   ```
   npm install -g modbus2mqtt
   # or a specific version:
   npm install -g modbus2mqtt@<version>
   # Example:
   npm install -g modbus2mqtt@0.17.1
   ```
4. Restart the container/addon if necessary for the changes to take effect.
   ```docker stop <container id>``` and
   ```docker start <container id>``` or any other command that restarts this container.
   

---

For more information, see the [Docker installation guide](./installation-docker.md).
