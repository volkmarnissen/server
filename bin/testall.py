#!/usr/bin/env python3
import argparse
import re
import socket
import stat
import subprocess
import sys
import time
import repositories
import os
import shutil
import argparse

def isOpen(ip,port):
   s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
   try:
      s.connect((ip, int(port)))
      s.shutdown(2)
      return True
   except:
      return False

def isCallable(command:str):
    try:
        nginxPath = repositories.executeSyncCommand(["which", command]).decode("utf-8")
    except Exception as err:
        raise repositories.SyncException( command + " must be installed!")
 
 
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
        raise repositories.SyncException( nginxGetLibDir() + " directory not found!") 
            

def startRequiredApps():
    checkRequiredApps()
    with open( "./cypress/servers/nginx.conf/nginx.conf","r") as f:
        nginxConf = f.read()
        nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(),nginxConf)
        # default directory
    with open("nginx.conf", "w") as g:
        g.write( nginxConf)
    subprocess.Popen(["nohup", "nginx","-c","nginx.conf","-p","."])
    subprocess.Popen(["nohup", "node", "./dist/server/runModbusTCPserver.js", "-y", "./cypress/servers/modbustcp.conf/yaml-dir" , "--busid", "0"])
    for port in [3002,3006]:
        count=0
        while count < 12:            
            if not isOpen("localhost", port):
                time.sleep(1)
            else:
                break
            count += 1
        if count == 12:
            with open( "nohup.out") as f:
                repositories.eprint(f.read())
            repositories.eprint( repositories.executeSyncCommand(["pgrep", "-f", "nginx: master|runModbusTCP"]))
            raise repositories.SyncException("Port " + str(port) + " is not up")

def unlinkIfExist( file:str):
  if os.path.exists(file):
        os.unlink(file)
 
def killRequiredApps():
    print("::group::Cypress cleanup")
    try:
        repositories.executeSyncCommand(["pkill", "-f", "nginx: master|runModbusTCP"])
        unlinkIfExist("nginx.conf")
        unlinkIfExist("nohup.out" )
        unlinkIfExist("nginx.error.log" )
        unlinkIfExist("nginx.pid" )
    except:
        return 
    print( '::endgroup::' )

def testRepository(reponame:str):
    
    args = ["npm", 'run', 'test' ]
    # If there are jest tests, append reporters

    if os.path.exists("__tests__"):
        args = args +[ "--", "--reporters", "default", "--reporters",  "github-actions"]
    print("::group::Unit tests for " + reponame)
    repositories.executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )


def testall(package:str)->bool:
    testRepository(package)
    if os.path.isdir(os.path.join("cypress", "e2e")):

            print("::group::Cypress run tests")
            repositories.executeCommandWithOutputs(["npx", "cypress", "run"],sys.stderr, sys.stdout)
            print( '::endgroup::' )
    else:
            repositories.eprint("No Cypress tests ín" + os.getcwd())

parser = argparse.ArgumentParser()
parser.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "killServers"], default="test")

args, unknownargs = parser.parse_known_args()

try:   
    match args.test:
        case "test":
            testall("server")
        case  "startServers":
            startRequiredApps()
        case "killServers":
            killRequiredApps()
except repositories.SyncException as err1:
    repositories.eprint(repositories.currentRepository + ": " + err1.args[0])
    list = list(err1.args)   # Convert to list
    list.pop(0)
    for arg in list:
        repositories.eprint( arg)
    exit(2)
except Exception as err:
    for arg in err.args:
        repositories.eprint( arg)
    exit(2)