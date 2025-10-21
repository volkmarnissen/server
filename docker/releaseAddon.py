#!/usr/bin/env python3
import argparse
import os
import re
import json
import sys
import tarfile
import subprocess
from typing import NamedTuple

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs) 
server ='server'
hassioAddonRepository= 'hassio-addon-repository'

modbus2mqtt ='modbus2mqtt'
configYaml='config.yaml'
dockerDir ='docker'
dockerFile = 'Dockerfile'
dockerfileTemplate = 'Dockerfile.template'

class StringReplacement(NamedTuple):
    pattern: str
    newValue:str

def getVersion(basedir, component):
    with open(os.path.join(basedir, component,'package.json'), 'r') as f:
        d = json.load(f)
        version =d['version']
        return version

def githubcli(basedir, component, args):
    result = subprocess.Popen(args,
	cwd=os.path.join(basedir, component),
 	stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = result.communicate()
    eprint(out)
    eprint(err)
    return_code = result.returncode
    if return_code == 0:
        return out
    else:
        return ''

def getLatestClosedPullRequest(basedir, component ):
    out = githubcli(basedir, component,['gh', 'pr', 'list', 
	    '-s' , 'closed' , '-L', '1', '--json', 'number'])
    if out != '':
        d = json.loads(out)
        return d[0]['number']
    else:
        return 0;

def removeTag(basedir, component, tagname ):
    githubcli(basedir, component,['git', 'push', '--delete', 
	    'origin' , tagname])
    eprint("tagname: !" + tagname + "!")
    githubcli(basedir, component,['git', 'tag', '-d', tagname])

def getVersionForDevelopment(basedir, component):
    prnumber = getLatestClosedPullRequest(basedir, component)
    version = getVersion(basedir, component)
    return "v" + version + "-pr" + str(prnumber)



def replaceStringInFile(inFile, outFile, replacements):
    out=[]
    for repl in replacements:
        eprint( "replacements: " , repl.pattern, repl.newValue)
    with open(inFile, 'r') as r:
            for line in r:
                for repl in replacements:
                    lineNew = re.sub(rf"{repl.pattern}", repl.newValue,line)
                    if lineNew != line:
                        eprint( "Replace with ", lineNew)
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
def updateConfigAndDockerfile(basedir,version, replacements,replacementsDocker):
    sys.stderr.write("createAddonDirectory release " + basedir  + " " +  version + "\n")
    serverP = os.path.join(basedir, server, 'hassio-addon', configYaml)
    hassioP = os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  configYaml)
    replaceStringInFile(serverP,hassioP, replacements)
    serverP = os.path.join(basedir, server, dockerDir, dockerfileTemplate)
    hassioP = os.path.join(basedir, hassioAddonRepository,modbus2mqtt,  dockerFile)
    replaceStringInFile(serverP,hassioP, replacementsDocker )
 

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
    updateConfigYamlVersion(args.basedir, version, replacements,replacements)
    print("TAG_NAME=v" + version)
else:
    version = getVersionForDevelopment(args.basedir, 'server' )
    removeTag(args.basedir,hassioAddonRepository, 'v' +version)
    replacements = [
        StringReplacement(pattern='<version>', newValue=version),
        StringReplacement(pattern='image:.*', newValue=''),
        StringReplacement(pattern='slug:.*', newValue='slug: modbusdev'),
        StringReplacement(pattern='codenotary:.*', newValue=''),
        ]
    replacementsDocker = [
        StringReplacement(pattern='\../server\@\${BUILD_VERSION}', newValue="github:modbus2mqtt/server"),
        ]        
    updateConfigAndDockerfile(args.basedir, version, replacements,replacementsDocker)
    print("TAG_NAME=v" + version)

