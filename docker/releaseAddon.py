#!/usr/bin/env python3
import argparse
import os
import re
import json
import sys
import tarfile
 
server ='server'
hassioAddonRepository= 'hassio-addon-repository'

modbus2mqtt ='modbus2mqtt'
configYaml='config.yaml'
dockerDir ='docker'
DockerfileTemplate = 'Dockerfile.template'
dockerFile = 'Dockerfile'

def getVersion(basedir, component):
    with open(os.path.join(basedir, component,'package.json'), 'r') as f:
        d = json.load(f)
        version =d['version']
        return version

def replaceStringInFile(inFile, outFile, replaceName, replaceValue):
    with open(inFile, 'r') as r:
        with open(outFile, 'w') as w:
            for line in r:
                line = re.sub(rf"{replaceName}", replaceValue,line)
                w.write( line)


def reset(tarinfo):
    tarinfo.uid = tarinfo.gid = 0
    tarinfo.uname = tarinfo.gname = "root"
    return tarinfo


# runs in (@modbus2mqtt)/server
# updates config.yaml in (@modbus2mqtt)/hassio-addon-repository
def createAddonDirectoryForRelease(basedir,version):
    sys.stderr.write("createAddonDirectory release " + basedir  + " " +  version + "\n")
    replaceStringInFile(os.path.join(basedir, server, 'hassio-addon', configYaml), \
        os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  configYaml),"<version>", version )

def createAddonDirectoryForDebug(basedir):
    sys.stderr.write("createAddonDirectory debug " +  basedir + "\n") 

# runs in (@modbus2mqtt)/server
# Creates rootfs.tar in (@modbus2mqtt)/hassio-addon-repository
def createDockerDirectoryForRelease(basedir, version):
    sys.stderr.write("createDockerforRelease " + basedir + " "  + version  + "\n")
    


def createDockerDirectoryForDebug(basedir):
    sys.stderr.write("createDockerforDebug  " +  basedir)


# publishes docker image from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def pusblishDocker(basedir, version):
    sys.stderr.write("publishDocker "  + basedir + " " + version)

# copy addon directory from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def copyAddon(basedir, host,port ):
    sys.stderr.write("copy addon " + basedir + " " +  host )

parser = argparse.ArgumentParser()
parser.add_argument("-b", "--basedir", help="base directory of all repositories", default='.')
parser.add_argument("-r", "--release", help="releases Dockerfile for production", action='store_true')
parser.add_argument("-d", "--debug", help="Creates local addon directory for debugging", type=bool)
parser.add_argument("-p", "--sshport", help="Sets the ssh port for addon directory default: 22",  nargs='?', default=None, const=22, type=int)
parser.add_argument("-s", "--sshhost", help="Sets the ssh host for addon directory default: localhost", nargs='?', default='localhost', const='localhost')

args = parser.parse_args()

if args.release:
    version = getVersion(args.basedir, 'server')
    createDockerDirectoryForRelease(args.basedir, version)
    createAddonDirectoryForRelease(args.basedir, version)
    # pusblishDocker(args.basedir, version)
    print("TAG_NAME=v" + version)
else:
    createDockerDirectoryForDebug(args.basedir)
    createAddonDirectoryForDebug(args.basedir)
    copyAddon(args.basedir,args.sshhost, args.sshport)
