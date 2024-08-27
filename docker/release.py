#!/usr/bin/env python3
import argparse
import os
import re
import json
from typing import NamedTuple
import subprocess
import tarfile
import shutil




class ComponentInfo(NamedTuple):
    name: str
    pkgVersion: str
    npmVersion: str
    releaseTag: str
    numLocalChanges:int
    numRemoteChanges:int

class StringReplacement(NamedTuple):
    pattern: str
    newValue:str


server ='server'

modbus2mqtt ='modbus2mqtt'
configYaml='config.yaml'
dockerDir ='docker'
DockerfileTemplate = 'Dockerfile.template'
dockerFile = 'Dockerfile'
ha_addonDir='/usr/share/hassio/addons/local/modbus2mqtt'
addonRepositoryModbus2mqtt =  os.path.join( 'hassio-addon-repository',modbus2mqtt)

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

def npmInstall(basedir, componentInfo):
    print("npmInstall", basedir, componentInfo)

def npmPack(basedir, addonDir, name):
    print("npm pack", basedir)
    tarsDir = os.path.join(addonDir, 'tars')
    os.makedirs(tarsDir,exist_ok=True)
    result = subprocess.Popen(['npm', 'pack', '--silent',
            '--pack-destination', addonDir  ],
		    cwd=os.path.join(basedir, name),
		    stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE) 
    out, err = result.communicate()
    tarname=out.decode("utf-8").rstrip() 
    return tarname
def npmBuildServer(basedir):
    print("npm build.all server", basedir)
    result = subprocess.Popen(['npm', 'run', 'build.all' ],
		    cwd=os.path.join(basedir, server),
		    stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE) 
    out, err = result.communicate()
    print(out, err)
    return result.returncode

def replaceStringInFile(inFile, outFile, replacements):
    with open(inFile, 'r') as r:
        with open(outFile, 'w') as w:
            for line in r:
                for repl in replacements:
                    line = re.sub(rf"{repl.pattern}", repl.newValue,line)
                w.write( line)

def prepareConfigYaml( basedir, serverVersion):
    inFile = os.path.join(basedir, server,'hassio-addon', configYaml)
#    tmpFile = os.path.join('/tmp', configYaml)
    outFile = os.path.join(basedir, addonRepositoryModbus2mqtt, configYaml)
    replaceStringInFile(inFile, outFile,[
        StringReplacement(pattern='<version>', newValue=serverVersion),
        StringReplacement(pattern='description:.*', newValue='description: Test Addon\nhost_network: true\nports:\n  9229/tcp: 9229'),
        StringReplacement(pattern='slug:.*', newValue='slug: modbuslocal'),
        StringReplacement(pattern='image:.*', newValue=''),
        StringReplacement(pattern='codenotary:.*', newValue=''),
        ])
def writeTarfile(dir, addonDir, mode):
    tar = tarfile.open( os.path.join(addonDir,"rootfs.tar"), mode)
    pwd = os.getcwd()
    os.chdir(dir)
    tar.add('.')
    os.chdir(pwd)
    tar.close()
def extractTarfile( file, targetDir):
    tar = tarfile.open( file, "r:gz")
    tar.extractall(targetDir)
    tar.close()

def prepareDockerfile( basedir, serverVersion):
    inFile = os.path.join(basedir, server,dockerDir, DockerfileTemplate)
    outFile = os.path.join(basedir, addonRepositoryModbus2mqtt, 'Dockerfile')
    addonDir= os.path.join(basedir, addonRepositoryModbus2mqtt)
    # addonAppDir = os.path.join(addonDir, 'rootfs' , 'usr', 'app')
    writeTarfile(os.path.join(basedir,server,dockerDir, 'rootfs'),addonDir, "w" )
    writeTarfile(os.path.join(basedir,server,dockerDir, 'rootfs.debug'),addonDir, "a" )
    npmTarInstall = ""
    tarsDir = os.path.join(addonDir, '@modbus2mqtt')
    shutil.rmtree(tarsDir,ignore_errors=True)
    os.makedirs(tarsDir,exist_ok=True)
    for componentInfo in componentInfos:
        tarname = os.path.join('.', npmPack(basedir, addonDir, componentInfo.name ))

        npmTarInstall = npmTarInstall + ' ' + tarname
        replaceStringInFile(inFile, outFile,[
            StringReplacement(pattern='<version>', newValue=serverVersion),
            StringReplacement(pattern='RUN npm install --omit-dev.*', newValue='COPY '+ npmTarInstall + ' ./\nRUN npm install ' + npmTarInstall),
            ])
        extractTarfile( os.path.join(addonDir, "modbus2mqtt-"+ componentInfo.name + "-" + componentInfo.pkgVersion + ".tgz" ), tarsDir)
        os.rename( os.path.join(tarsDir, 'package'),os.path.join(tarsDir, componentInfo.name))
    return npmTarInstall

def copyToHassio(addonDir,sshport, sshhost):
    cmd = 'tar c -f - . |ssh -p ' + str(sshport) + \
            ' homeassistant@' + sshhost + ' "cd ' + ha_addonDir  +'; tar xf - "'
    print( cmd)
    result = subprocess.Popen([
        cmd],
		    cwd=addonDir,
		    stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, shell=True) 
    out, err = result.communicate()
    print(out, err)

def executeCpSh(sshport, sshhost ):

    cmd = 'ssh -p ' + str(sshport) + \
            ' homeassistant@' + sshhost + ' "cd ' + ha_addonDir  +'; ' + os.path.join(ha_addonDir, 'cp.sh') + '"'
    print( cmd)
    result = subprocess.Popen([cmd],
		    cwd=addonDir,
		    stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, shell=True) 
    out, err = result.communicate()
    print(out, err)    
def cleanAddonDir(addonDir, tgzfiles):
    shutil.rmtree(os.path.join(addonDir, "rootfs.tar"), ignore_errors=True)
    shutil.rmtree(os.path.join(addonDir, "Dockerfile"), ignore_errors=True)
    shutil.rmtree(os.path.join(addonDir, "@modbus2mqtt"), ignore_errors=True)
    shutil.rmtree(os.path.join(addonDir, "@modbus2mqtt"), ignore_errors=True)
    cmd = "cd " + addonDir + " ; rm cp.sh " +tgzfiles
    print(cmd)
    rc = subprocess.call(cmd , shell=True)
    print(rc)
def reset(tarinfo):
    tarinfo.uid = tarinfo.gid = 0
    tarinfo.uname = tarinfo.gname = "root"
    return tarinfo

parser = argparse.ArgumentParser()
parser.add_argument("-b", "--basedir", help="base directory of all repositories", default='.')
parser.add_argument("-d", "--debug", help="Creates local addon directory for debugging", action='store_true')
parser.add_argument("-p", "--sshport", help="Sets the ssh port for addon directory default: 22",  nargs='?', default=22, type=int)
parser.add_argument("-s", "--sshhost", help="Sets the ssh host for addon directory default: localhost", nargs='?', default='localhost', const='localhost')

args = parser.parse_args()
componentInfos=[]
serverComponent=""
for component in components:
    ci = ComponentInfo(component, getVersion(args.basedir, component),
                        getNpmVersion(component),
                        getReleaseTag(args.basedir, component),
                        numberOfChanges(args.basedir, component),
                         numberOfRemoteChanges(args.basedir, component))
    componentInfos.append( ci )
    if component == server:
        serverComponent = ci

    print(componentInfos)

if( args.debug):
    print("debug")
    subprocess.run( "npm run build.dev", cwd=os.path.join(args.basedir, server), shell=True)
    prepareConfigYaml(args.basedir, serverComponent.pkgVersion)
    tgzs = prepareDockerfile(args.basedir, serverComponent.pkgVersion)
    addonDir = os.path.join(args.basedir, addonRepositoryModbus2mqtt )
    inFile = os.path.join(args.basedir, server,dockerDir, "cp.sh")
    shutil.copy( inFile, addonDir)  
    copyToHassio(addonDir, args.sshport, args.sshhost)
    cleanAddonDir(addonDir,tgzs)
    executeCpSh(args.sshport, args.sshhost)
else:
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
