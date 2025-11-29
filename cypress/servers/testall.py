#!/usr/bin/env python3

import argparse
import sys
import time
import os
from threading import Thread
import shutil
import tempfile
from typing import List
 
class SyncException(Exception):
    pass

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# Type hints verbessern
def executeCommand(cmdArgs: List[str], *args, **kwargs) -> bytes:
    ignoreErrors = kwargs.get('ignoreErrors', None)
    result = subprocess.Popen(cmdArgs,
	cwd=os.getcwd(),
 	stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = result.communicate()
    err = err.decode("utf-8")
    return_code = result.returncode
    if err != b'' and err != '' and not ignoreErrors:
        eprint(err)
    if return_code != 0:
        if out != b'':
            eprint(out.decode("utf-8"))
        return "".encode('utf-8')
    else:
        if out.decode("utf-8") == '':
            return '{"status": "OK"}'.encode('utf-8')
    return out

class StreamThread ( Thread ):
    def __init__(self, buffer):
        Thread.__init__(self)
        self.buffer = buffer
    def run ( self ):
        while 1:
            line = self.buffer.readline()
            eprint(line,end="")
            sys.stderr.flush()
            if line == '':
                break
def executeSyncCommandWithCwd(cmdArgs: List[str], cwdP:str, *args, **kwargs)-> bytes:
            
    if cwdP == None:
        cwdP = os.getcwd()
    proc = subprocess.Popen(cmdArgs,
    cwd=cwdP,
    stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = proc.communicate()
    proc.returncode
    if proc.returncode != 0:
        raise SyncException( cwdP +':'+ err.decode("utf-8"), ' '.join(cmdArgs), out.decode("utf-8"))
    if len(err)>0:    
        eprint(err.decode("utf-8"))
    return out
def executeCommandWithOutputs(cmdArgs: List[str], stdout, stderr,  *args, **kwargs):
   proc = subprocess.Popen(cmdArgs, stdout=stdout, stderr=stderr)
   proc.wait()
   if proc.returncode != 0:
        raise SyncException( os.getcwd() +':'+' '.join(cmdArgs) + " exited with rc= " + str( proc.returncode))

def executeSyncCommand(cmdArgs: List[str], *args, **kwargs)-> bytes:
    return executeSyncCommandWithCwd(cmdArgs, os.getcwd(), *args, **kwargs)
   

 # Define constants at the top
MAX_PORT_RETRIES = 12
MAX_LOG_SIZE = 100000
PERMANENT_PORTS = [3002, 3006]
RESTART_PORTS = [3001, 3003, 3004, 3005, 3007]

def isOpen(ip: str, port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect((ip, int(port)))
        s.shutdown(2)
        return True
    except (socket.error, ConnectionRefusedError):
        return False

def isCallable(command:str):
    try:
        nginxPath = executeSyncCommand(["which", command]).decode("utf-8")
    except Exception as err:
        raise SyncException( command + " must be installed!")
 
 
defaultMimeTypes = "/etc/nginx/mime.types"
defaultLibDir = "/var/lib/nginx"
    
def nginxGetMimesTypes():
    if  not os.path.exists(defaultMimeTypes):
        return "/opt/homebrew/" + defaultMimeTypes
    return defaultMimeTypes

def nginxGetLibDir():
    if  not os.path.isdir(defaultLibDir):
         return "/opt/homebrew/var/homebrew/linked/nginx"
    return defaultLibDir
   
def checkRequiredApps():
    # nginx must be preinstalled
    isCallable("nginx")
    ngxinlib = nginxGetLibDir()
    if not os.path.isdir(ngxinlib) :
        raise SyncException( nginxGetLibDir() + " directory not found!") 
    
def killDockerContainer():
    try:
        subprocess.check_call(["docker", "rm", "-f", "modbus2mqtt-test"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        eprint("Killed Docker container: modbus2mqtt-test")
    except Exception:
        eprint("No running Docker container found: modbus2mqtt-test")            
def startDockerServers(docker_image=None):
    if docker_image is None:
        docker_image = "ghcr.io/modbus2mqtt/modbus2mqtt:latest"
    # Start modbustcp and mosquitto locally, but modbus2mqtt in Docker
    print("::group::Start modbustcp and mosquitto (local)")
    # Only the relevant parts from startRequiredApps, without modbus2mqtt and npm
    checkRequiredApps()

    # Prepare nginx config
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
    # 2. Start modbus2mqtt in Docker container
    print("::group::Start modbus2mqtt in Docker")
    # Create temporary directories for /ssl, /data, /config
    ssl_dir = tempfile.mkdtemp(prefix="modbus2mqtt-ssl-")
    data_dir = tempfile.mkdtemp(prefix="modbus2mqtt-data-")
    config_dir = tempfile.mkdtemp(prefix="modbus2mqtt-config-")
     # Compose Docker run command
    docker_cmd = [
        "docker", "run", "-d",
        "--name", "modbus2mqtt-test",
        "-p", "3007:3000",
        "-v", f"{ssl_dir}:/ssl",
        "-v", f"{data_dir}:/data",
        "-v", f"{config_dir}:/config",
        docker_image
    ]
    killDockerContainer()
    print(f"Running: {' '.join(docker_cmd)}")
    subprocess.check_call(docker_cmd)
    print('::endgroup::')

def startRequiredApps(permanent:bool, restart:bool):
    try:
        shutil.rmtree("./distprod")
    except OSError:
        pass  
    try:
        for f in glob.glob("modbus2mqtt-*.tgz"):
            os.remove( f)
    except OSError:
        pass
    if( not permanent):
        print("::group::start npm pack and install modbus2mqtt")
        try:
            executeSyncCommand(["npm","pack", "--silent"]).decode('utf-8').strip()
        except Exception as err:
            eprint("npm pack failed: " + str(err))
            raise SyncException("npm pack failed")  
        eprint("npm pack succeeded ")
        os.mkdir("./distprod")
        os.chdir("./distprod")
        eprint("npm init -y")
        executeSyncCommand(["npm","init","-y", "--silent"])
        eprint("npm installing modbus2mqtt")
        for f in glob.glob("../modbus2mqtt-*.tgz"):
            try:
                executeSyncCommand(["npm","install" , "--silent", f ] )
            except Exception as err:
                eprint("npm install failed: " + str(err))
                raise SyncException("npm install failed")
        os.chdir("..")
        # kill existing apps
        print( '::endgroup::' )
    print("::group::start Start required servers")
    if( not restart):
        checkRequiredApps()
        with open( "./cypress/servers/nginx.conf/nginx.conf","r") as f:
            nginxConf = f.read()
            nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(),nginxConf)
        # default directory
        fb = tempfile.NamedTemporaryFile(delete_on_close=False)
        fb.write( nginxConf.encode('utf-8'))
        fb.close()
    if( not permanent):
        file="cypress/servers/tmpfiles"
        if os.path.exists(file):
            os.remove(file )
    with open('stderr.out', "a") as outfile:
        if( not restart):
            subprocess.Popen(["nohup", "nginx","-c",fb.name,"-p","."],stderr=outfile, stdout=outfile)
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"],stderr=outfile, stdout=outfile)
        if( not permanent or restart):
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/mosquitto"],stderr=outfile, stdout=outfile)
            # use modbus2mqtt with different config files
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3005 " + file],stderr=outfile, stdout=outfile)  # e2ePort
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3004 "  + file + " localhost:3006"],stderr=outfile, stdout=outfile) 
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3007 " + file],stderr=outfile, stdout=outfile)  # mqttNoAuthPort
            # Use docker host port
        if( permanent):
            ports = PERMANENT_PORTS
        elif( restart):
            ports = RESTART_PORTS
        else:
            ports = PERMANENT_PORTS + RESTART_PORTS
        eprint("Waiting for " + str(ports) + " to open")
        error=""
        for port in ports:
            count=0
            while count < MAX_PORT_RETRIES:            
                if not isOpen("localhost", port):
                    time.sleep(1)
                else:
                    break
                count += 1
            if count == MAX_PORT_RETRIES:
                if(os.path.exists("stderr.out")):
                    with open( "stderr.out") as f:
                        eprint(f.read())
                error += f"Port {port} not opened!\n"
        if( error != ""):
            raise SyncException( error)
        else:
            eprint("All required ports are open.")
        outfile.close()
        print( '::endgroup::' )
        unlinkIfExist("stderr.out")

def unlinkIfExist( file:str):
  if os.path.exists(file):
        os.unlink(file)
 
def killOne(app:str):
    try:
        result = executeSyncCommand(["pkill",  "-U", str(os.getuid()) ,"-f", app])
        eprint(f"Killed {app}")
    except Exception as err:
        # Process might not be running, which is fine
        eprint(f"No running process found for {app}")
  
def killRequiredApps(permanent:bool=False, restart:bool=False):
    print("::group::Cypress cleanup")
    try:
        if(not restart):
            killOne("nginx: master")
            killOne("runModbusTCP")
            unlinkIfExist("nginx.conf")
            unlinkIfExist("nginx.pid" )
            unlinkIfExist("nginx.error.log" )
        
        if(not permanent or restart):
            killOne("modbus2mqtt")
            killOne("mosquitto")
            unlinkIfExist("cypress/servers/tmpfiles" )
            killDockerContainer()
        unlinkIfExist("nohup.out" )
    finally:
        print( '::endgroup::' )

def testRepository(reponame:str):
    
    args = ["npm", 'run', 'test' ]
    # If there are jest tests, append reporters
    #print("::group::Unit tests for " + reponame)
    print("::group::Unit tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )
    args = ["npm", 'run', 'cypress' ]
    # If there are jest tests, append reporters
    print("::group::Cypress Components tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )

def testall(package:str)->bool:
    testRepository(package)
    if os.path.isdir(os.path.join("cypress", "e2e")):

            print("::group::Cypress run tests")
            executeCommandWithOutputs(["npx", "cypress", "run"],sys.stderr, sys.stdout)
            print( '::endgroup::' )
    else:
            eprint("No Cypress e2e tests found in " + os.getcwd())


parser = argparse.ArgumentParser()
parser.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "restartServers", "killServers", "startdocker"], default="test")
parser.add_argument("--docker-image", default="ghcr.io/modbus2mqtt/modbus2mqtt:latest", help="Docker image (Repo-Name) for modbus2mqtt")
parser.add_argument("-p", "--permanent", help="Start nginx and modbustcp server",  action='store_true')
parser.add_argument("-r", "--restart", help="Start modbus2mqtt and mosquitto",  action='store_true')

args, unknownargs = parser.parse_known_args()
# for debugging purposes: print("testall arguments: " + str(args))
try:   
    match args.test:
        case "test":
            testall("server")
        case  "restartServers":
            killRequiredApps(args.permanent, args.restart)
            startRequiredApps(args.permanent, args.restart)
        case  "startServers":
            startRequiredApps(args.permanent, args.restart)
        case "killServers":
            killRequiredApps(args.permanent, args.restart)
        case "startdocker":
            startDockerServers()
except SyncException as err1:
    eprint( ": " + err1.args[0])
    list = list(err1.args)   # Convert to list
    list.pop(0)
    for arg in list:
        eprint( arg)
    exit(2)
except Exception as err:
    for arg in err.args:
        eprint( arg)
    exit(2)
