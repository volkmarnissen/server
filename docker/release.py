#!/usr/bin/env python3
import argparse
import os
import re
import json
from typing import NamedTuple, List
import subprocess



class ComponentInfo(NamedTuple):
    name: str
    pkgVersion: str
    npmVersion: str
    releaseTag: str
    numLocalChanges:int
    numRemoteChanges:int

server ='server'

modbus2mqtt ='modbus2mqtt'
configYaml='config.yaml'
dockerDir ='docker'
DockerfileTemplate = 'Dockerfile.template'
dockerFile = 'Dockerfile'
components = ['specification.shared','server.shared','angular','specification','server']

def getVersion(basedir, component):
    with open(os.path.join(basedir, component,'package.json'), 'r') as f:
        d = json.load(f)
        version =d['version']
        return version

def getNpmVersion(component):
    return subprocess.getoutput('npm view --silent @modbus2mqtt/' + component + ' version' )

def getReleaseTag(basedir, component):
    pwd = os.getcwd()
    os.chdir(os.path.join(basedir, component))
    nc=subprocess.getoutput('git tag --sort=version:refname | tail -1')
    os.chdir(pwd)
    return nc

def numberOfRemoteChanges(basedir,component):
    pwd = os.getcwd()
    os.chdir(os.path.join(basedir, component))
    nc=subprocess.getoutput('git diff --name-only heads/main origin/main | wc -l')
    os.chdir(pwd)
    return nc


def numberOfChanges(basedir,component):
    pwd = os.getcwd()
    os.chdir(os.path.join(basedir, component))
    nc=subprocess.getoutput('git status --porcelain| wc -l')
    os.chdir(pwd)
    return nc

def releaseComponent(basedir, componentInfo):
    result = subprocess.Popen(['git', 'tag', '-a', 
	'v'+ str(componentInfo.pkgVersion) , '-m', 
	'Release ' + str(componentInfo.pkgVersion)],
	cwd=os.path.join(basedir, componentInfo.name),
 	stdout=subprocess.PIPE,
 	stderr=subprocess.PIPE) 
    out, err = result.communicate()
    print('tag' , out, err)
    return_code = result.returncode
    print( 'tag' , return_code)
    if return_code == 0:
    	result = subprocess.Popen(['git', 'push', '--tags', 
		'--force'],
		cwd=os.path.join(basedir, componentInfo.name),
		stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE) 
    	out, err = result.communicate()
    	print('push', out, err)
    return return_code

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

parser = argparse.ArgumentParser()
parser.add_argument("-b", "--basedir", help="base directory of all repositories", default='.')
# parser.add_argument("-r", "--release", help="releases Dockerfile for production", action='store_true')
# parser.add_argument("-d", "--debug", help="Creates local addon directory for debugging", type=bool)
# parser.add_argument("-p", "--sshport", help="Sets the ssh port for addon directory default: 22",  nargs='?', default=None, const=22, type=int)
# parser.add_argument("-s", "--sshhost", help="Sets the ssh host for addon directory default: localhost", nargs='?', default='localhost', const='localhost')

args = parser.parse_args()
componentInfos=[]

for component in components:
    componentInfos.append( ComponentInfo(component, getVersion(args.basedir, component),
                         getNpmVersion(component),
                         getReleaseTag(args.basedir, component),
                         numberOfChanges(args.basedir, component),
                         numberOfRemoteChanges(args.basedir, component)))
print(componentInfos)
for componentInfo in componentInfos:
    
    if int(componentInfo.numLocalChanges) > 0:
        print( componentInfo.name +  ' has local changes, please commit first' )
    else:
        if int (componentInfo.numRemoteChanges) > 0:
            print( componentInfo.name +  ' has differences to remote push/pull first' )
        else:
            if componentInfo.pkgVersion == componentInfo.npmVersion:
                print( componentInfo.name +  ' is up to date' )
            else:
                if 'v'+ componentInfo.pkgVersion == componentInfo.releaseTag:
                    print(component + '/' + componentInfo.pkgVersion +  ' is outdated in npm but has up to date release tag ' + componentInfo.releaseTag)
                else:
                    print( "component will be released ")
                    print( componentInfo )
                    if releaseComponent(args.basedir, componentInfo) == 0:
                        print(componentInfo.name + " released successfully")
                    else:
                        print(componentInfo.name + " released failed")
        
