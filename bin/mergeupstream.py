#!/usr/bin/env python3
# import argparse
# import os
import re
import json
# import shutil
# import sys
# import tarfile
import subprocess

import repositories

# Assuming: This is a forked repository
# This will create the remote upstream if it doesn't exist
# it will merge upstream into the current branch

def isRepositoryForked( repositoryName )->bool:
    forked = json.loads(repositories.executeCommand(['gh', 'repo' , 'list', '--fork', '--json', 'name'] ))
    for repository in forked:
        if repository['name'] == repositoryName :
            return True
    return False
def check_user()->bool:
    authStatus= json.loads(repositories.executeCommand(['gh', 'auth', 'status', '--json', 'hosts']))
    login = "N/A"
    for st in authStatus['hosts']['github.com']:
        if  st['active']:
            login = st['login']
    return login != 'modbus2mqtt'
   

repositories.executeSyncCommand( ["git", "config", "pull.rebase", "true"] )
if not check_user():
    repositories.eprint('user modbus2mqtt is not supported')
    exit(2)

forked = json.loads(repositories.executeCommand(['gh', 'repo' , 'list', '--fork', '--json', 'name'] ))
branch =  subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
out = repositories.executeCommand(['git','remote','show',login])
match = re.search(r'.*Push *URL:[^:]*:([^\/]*)', out.decode("utf-8"))
match = re.search(r'.*Remote[^:]*:[\r\n]+ *([^ ]*)', out.decode("utf-8"))
#repository.remoteBranch = match.group(1)
