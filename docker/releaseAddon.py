#!/usr/bin/env python3
import argparse
import os
import re
import json
import sys
import tarfile
import subprocess
from typing import NamedTuple
 
server ='server'
hassioAddonRepository= 'hassio-addon-repository'

modbus2mqtt ='modbus2mqtt'
configYaml='config.yaml'
dockerDir ='docker'
dockerFile = 'Dockerfile'

class StringReplacement(NamedTuple):
    pattern: str
    newValue:str


def getVersion(basedir, component):
    with open(os.path.join(basedir, component,'package.json'), 'r') as f:
        d = json.load(f)
        version =d['version']
        return version

def getLatestClosedPullRequest():
    d = json.loads(subprocess.getoutput('gh pr list -s closed -L 1 --json number' ))
    return d[0]['number']

def getVersionForDevelopment(basedir, component):
    prnumber = getLatestClosedPullRequest()
    version = getVersion(basedir, component)
    return version + "-pr" + str(prnumber)



def replaceStringInFile(inFile, outFile, replacements):
    out=[]
    for repl in replacements:
        print( "replacements: " , repl.pattern, repl.newValue)
    with open(inFile, 'r') as r:
            for line in r:
                for repl in replacements:
                    lineNew = re.sub(rf"{repl.pattern}", repl.newValue,line)
                    if lineNew != line:
                        print( "Replace with ", lineNew)
                    line = lineNew
                if( lineNew != "" ):
                    out.append(lineNew)
    with open(outFile, 'w') as w:
        for line in out:
            w.write( line)

def replaceAndDeleteStringInFile(inFile, outFile, replaceName, replaceValue, deleteName):
    with open(inFile, 'r') as r:
        with open(outFile, 'w') as w:
            for line in r:
                if( not line.startswith(deleteName) ):
                    line = re.sub(rf"{replaceName}", replaceValue,line)
                    w.write( line)

# runs in (@modbus2mqtt)/server
# updates config.yaml in (@modbus2mqtt)/hassio-addon-repository
def updateConfigYamlVersion(basedir,version, replacements):
    sys.stderr.write("createAddonDirectory release " + basedir  + " " +  version + "\n")
    serverP = os.path.join(basedir, server, 'hassio-addon', configYaml)
    hassioP = os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  configYaml)
    replaceStringInFile(serverP,hassioP, replacements)

# publishes docker image from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def pusblishDocker(basedir, version):
    sys.stderr.write("publishDocker "  + basedir + " " + version)

parser = argparse.ArgumentParser()
parser.add_argument("-b", "--basedir", help="base directory of all repositories", default='.')
parser.add_argument("-R", "--ref", help="ref branch or tag ", default='refs/heads/main')
parser.add_argument("-r", "--release", help="builds sets version number in config.yaml", action='store_true')

args = parser.parse_args()
if args.release or args.ref.endswith("release"):
    version = getVersion(args.basedir, 'server')
    replacements = [
        StringReplacement(pattern='<version>', newValue=version),
        ]
    updateConfigYamlVersion(args.basedir, version, replacements)
    print("TAG_NAME=v" + version)
else:
    version = getVersionForDevelopment(args.basedir, 'server' )
    replacements = [
        StringReplacement(pattern='<version>', newValue=version),
        StringReplacement(pattern='image:.*', newValue=''),
        StringReplacement(pattern='slug:.*', newValue='slug: modbusdev'),
        StringReplacement(pattern='codenotary:.*', newValue=''),
        ]
    updateConfigYamlVersion(args.basedir, version, replacements)
    print("TAG_NAME=v" + version)

