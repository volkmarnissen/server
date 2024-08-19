#!/usr/bin/env python3
import argparse
import os
import re
import json
import tarfile
from python_on_whales import docker
 
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
    print("createAddonDirectory release", basedir, version)
    replaceStringInFile(os.path.join(basedir, server, 'hassio-addon', configYaml), \
        os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  configYaml),"<version>", version )
    tar = tarfile.open(os.path.join(basedir, hassioAddonRepository,modbus2mqtt,"roofs.tar"), "w")
    tar.add(os.path.join(basedir, server,dockerDir, "rootfs"))
    tar.close()

def createAddonDirectoryForDebug(basedir):
    print("createAddonDirectory debug", basedir) 

# runs in (@modbus2mqtt)/server
# Creates Dockerfile in (@modbus2mqtt)/hassio-addon-repository
# Creates rootfs.tar in (@modbus2mqtt)/hassio-addon-repository
def createDockerDirectoryForRelease(basedir, version):
    print("createDockerforRelease", basedir, version)
    replaceStringInFile(os.path.join(basedir, server, dockerDir, DockerfileTemplate), \
        os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  dockerFile),"<version>", version )
    


def createDockerDirectoryForDebug(basedir):
    print("createDockerforDebug", basedir)


# publishes docker image from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def pusblishDocker(basedir, version):
    print("publishDocker", basedir, version)
    #docker.login(username='modbus2mqtt', password='dckr_pat_Z85yqVrPDIWS9TV1fzf4wkf1PMQ')
    addonDir = os.path.join(basedir, hassioAddonRepository,modbus2mqtt )
    docker.run(remove=True,name='builder',privileged=True,
               volumes=[(addonDir, '/data'),('/var/run/docker.sock','/var/run/docker.sock','ro')],
               image='ghcr.io/home-assistant/amd64-builder',
               tty=True, interactive=True,
               command=['-t', '/data', '--amd64','-i', 'modbus2mqtt', '--docker-user' ,'modbus2mqtt' \
                    '--docker-password', '' ] )


# copy addon directory from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def copyAddon(basedir, host,port ):
    print("copy addon", basedir, host, port )

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
else:
    createDockerDirectoryForDebug(args.basedir)
    createAddonDirectoryForDebug(args.basedir)
    copyAddon(args.basedir,args.sshhost, args.sshport)



