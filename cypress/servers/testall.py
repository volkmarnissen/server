#!/usr/bin/env python3
import argparse
import re
import socket
import glob
import subprocess
import sys
import time
import os
from threading import Thread
import shutil
import tempfile
class SyncException(Exception):
    pass

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# Type hints verbessern
def executeCommand(cmdArgs: list[str], *args, **kwargs) -> bytes:
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
def executeSyncCommandWithCwd(cmdArgs: list[str], cwdP:str, *args, **kwargs)-> str:
            
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
def executeCommandWithOutputs(cmdArgs: list[str], stdout, stderr,  *args, **kwargs):
   proc = subprocess.Popen(cmdArgs, stdout=stdout, stderr=stderr)
   proc.wait()
   if proc.returncode != 0:
        raise SyncException( os.getcwd() +':'+' '.join(cmdArgs) + " exited with rc= " + str( proc.returncode))

def executeSyncCommand(cmdArgs: list[str], *args, **kwargs)-> str:
    return executeSyncCommandWithCwd(cmdArgs, os.getcwd(), *args, **kwargs)
   

# Konstanten am Anfang definieren
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
        print("::group::start npm pack modbus2mqtt")
   
        executeSyncCommand(["npm","pack"])
        os.mkdir("./distprod")
        os.chdir("./distprod")
        eprint("npm init -y")
        executeSyncCommand(["npm","init","-y"])
        for f in glob.glob("../modbus2mqtt-*.tgz"):
            eprint("found " + f)    
            executeSyncCommand(["npm","install",f ] )
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
        if( not permanent):
            print("::group::start Server logs")
            with open('stderr.out', 'r') as f:
                print(f.read(MAX_LOG_SIZE))
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
  
def killRequiredApps():
    print("::group::Cypress cleanup")
    try:
        killOne("nginx: master")
        killOne("runModbusTCP")
        killOne("modbus2mqtt")
        killOne("mosquitto")
        unlinkIfExist("nginx.conf")
        unlinkIfExist("nohup.out" )
        unlinkIfExist("nginx.error.log" )
        unlinkIfExist("nginx.pid" )
        unlinkIfExist("cypress/servers/tmpfiles" )
    finally:
        print( '::endgroup::' )

def testRepository(reponame:str):
    
    args = ["npm", 'run', 'test' ]
    # If there are jest tests, append reporters

    #if os.path.exists("__tests__"):
    #    args = args +[ "--", "--reporters", "default", "--reporters",  "github-actions"]
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
parser.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "killServers"], default="test")
parser.add_argument("-p", "--permanent", help="Start nginx and modbustcp server",  action='store_true')
parser.add_argument("-r", "--restart", help="Start modbus2mqtt and mosquitto",  action='store_true')

args, unknownargs = parser.parse_known_args()
# for debugging purposes: print("testall arguments: " + str(args))
try:   
    match args.test:
        case "test":
            testall("server")
        case  "startServers":

            startRequiredApps(args.permanent, args.restart)
        case "killServers":
            killRequiredApps()
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
