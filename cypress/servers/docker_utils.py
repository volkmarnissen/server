import subprocess
import tempfile
import os
import re
from command_utils import executeSyncCommand

def startDockerServers(docker_image=None):
    if docker_image is None:
        docker_image = "ghcr.io/modbus2mqtt/modbus2mqtt:latest"
    print("::group::Start modbustcp and mosquitto (local)")
    checkRequiredApps()
    with open("./cypress/servers/nginx.conf/nginx.conf", "r") as f:
        nginxConf = f.read()
        nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(), nginxConf)
    fb = tempfile.NamedTemporaryFile(delete_on_close=False)
    fb.write(nginxConf.encode('utf-8'))
    fb.close()
    tmpfile = "cypress/servers/tmpfiles"
    if os.path.exists(tmpfile):
        os.remove(tmpfile)
    with open('stderr.out', "a") as outfile:
        subprocess.Popen(["nohup", "nginx", "-c", fb.name, "-p", "."], stderr=outfile, stdout=outfile)
        subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"], stderr=outfile, stdout=outfile)
        subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/mosquitto"], stderr=outfile, stdout=outfile)
    print('::endgroup::')
    print("::group::Start modbus2mqtt in Docker")
    ssl_dir = tempfile.mkdtemp(prefix="modbus2mqtt-ssl-")
    data_dir = tempfile.mkdtemp(prefix="modbus2mqtt-data-")
    config_dir = tempfile.mkdtemp(prefix="modbus2mqtt-config-")
    docker_cmd = [
        "docker", "run", "-d",
        "--name", "modbus2mqtt-test",
        "-p", "3007:3000",
        "-v", f"{ssl_dir}:/ssl",
        "-v", f"{data_dir}:/data",
        "-v", f"{config_dir}:/config",
        docker_image
    ]
    try:
        subprocess.check_call(["docker", "rm", "-f", "modbus2mqtt-test"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    print(f"Running: {' '.join(docker_cmd)}")
    subprocess.check_call(docker_cmd)
    print('::endgroup::')

def killDockerContainer():
    try:
        subprocess.check_call(["docker", "rm", "-f", "modbus2mqtt-test"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Killed Docker container: modbus2mqtt-test")
    except Exception:
        print("No running Docker container found: modbus2mqtt-test")

def checkRequiredApps():
    # Dummy-Implementierung, bitte aus main übernehmen
    pass

def nginxGetMimesTypes():
    # Dummy-Implementierung, bitte aus main übernehmen
    return "/etc/nginx/mime.types"
