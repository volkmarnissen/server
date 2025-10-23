#!/usr/bin/env python3
import argparse
import os
import re
import json
import shutil
import sys
import tarfile
import subprocess

import repositories
from typing import NamedTuple

server ='server'
hassioAddonRepository= 'hassio-addon-repository'

modbus2mqtt ='modbus2mqtt'
modbus2mqttLatest ='modbus2mqtt.latest'
configYaml='config.yaml'
dockerDir ='docker'
dockerFile = 'docker/Dockerfile'

class StringReplacement(NamedTuple):
    pattern: str
    newValue:str

def removeTag(tagname ):
    try:
        repositories.executeSyncCommand(['git', 'push', '--delete', 'origin' , tagname])
    except repositories.SyncException as err:
        repositories.eprint( err.args)
    try:
        repositories.executeSyncCommand(['git', 'tag', '-d', tagname])
    except repositories.SyncException as err:
        repositories.eprint( err.args)

def replaceStringInFile(inFile, outFile, replacements):
    for repl in replacements:
        repositories.eprint( "replacements: " , repl.pattern, repl.newValue)
    with open(inFile, 'r') as file:
        data = file.read()
        for repl in replacements:
            data = re.sub(rf"{repl.pattern}", repl.newValue,data,re.MULTILINE)
        with open(outFile, 'w') as w:        
            w.write( data)

# runs in (@modbus2mqtt)/server
# updates config.yaml in (@modbus2mqtt)/hassio-addon-repository
def updateConfigAndDockerfile(basedir, replacements,replacementsDocker=None):
    sys.stderr.write("createAddonDirectory replace in " + basedir  + " " +  "\n")
    config = os.path.join(basedir,  configYaml)
    docker = os.path.join(basedir,  dockerFile)
    replaceStringInFile(configYaml,config, replacements)
    if replacementsDocker != None:
        replaceStringInFile(docker, docker, replacementsDocker )
 

# publishes docker image from (@modbus2mqtt)/hassio-addon-repository
# docker login needs to be executed in advance 
def pusblishDocker(basedir, version):
    sys.stderr.write("publishDocker "  + basedir + " " + version)

parser = argparse.ArgumentParser()
parser.add_argument("-c", "--componentdir", help="root directory of npm package", default='.')

args = parser.parse_args()
version = repositories.readPackageJson(os.path.join(args.componentdir, 'package.json'))['version']
print("TAG_NAME=" + version)

if re.match(r'\.0$', version):
    # release
    repositories.executeSyncCommand(['rsync', '-avh', modbus2mqttLatest + '/', modbus2mqtt +'/'])
    removeTag( 'v' +version)
    githuburl = 'github:modbus2mqtt/server'
    replacements = [
        StringReplacement(pattern='version: [0-9.][^\n]*', 
                          newValue='version: ' +  version ),
        StringReplacement(pattern='Modbus <=> MQTT latest', 
                          newValue='Modbus <=> MQTT' ),
        StringReplacement(pattern='image: ghcr.io/modbus2mqtt/modbus2mqtt.latest', newValue= 'image: ghcr.io/modbus2mqtt/modbus2mqtt'),
        StringReplacement(pattern='slug:.*', newValue='slug: modbus2mqtt'),
        StringReplacement(pattern='\s*ports:\n\s*3000\/tcp: 3000\n', newValue='ports:\n'),
        StringReplacement(pattern='\s*3000\/tcp: 3000\n', newValue=''),
        StringReplacement(pattern='\s*9229\/tcp: null\n', newValue=''),
        ]
    replacementsDocker = [
        StringReplacement(pattern=githuburl+ '[^\n]*', newValue=githuburl + '#v' + version  )
        ]        
else:
    replacements = [
        StringReplacement(pattern='version: [0-9.][^\n]*', newValue='version: ' +version ),
        ]
    updateConfigAndDockerfile(modbus2mqttLatest, version, replacements,replacements)
    print("TAG_NAME=" + version)

