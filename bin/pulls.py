#!/usr/bin/env python3
import argparse
import sys
from collections.abc import MutableSequence
from dataclasses import dataclass
import json
import os
import stat
import repositories
from typing import Dict
import testall
import shutil
class PullException(Exception):
    pass
@dataclass
class Issue:
    number: int
    repositoryname: str

def getPullRepositorys(allRepositorys:repositories.Repositorys)->MutableSequence[repositories.Repository]:
    rc:MutableSequence[repositories.Repository] = []
    for repository in allRepositorys.repositorys:
        if repository.localChanges > 0:
            raise PullException(os.getcwd() + ": Repository " + repository.name + " has local changes")
        if repository.gitChanges > 0:
            rc.append( repository)
    if len(rc) == 0:
        raise PullException("No changes in Github")
    return rc
initialText = "Please update me"
def buildPulltext(allRepositorys:repositories.Repositorys, pullRepositorys, issue:Issue)->repositories.PullTexts:
    if pullRepositorys == None or len(pullRepositorys)== 0:
        raise PullException("No repositorys to pull")
    pullText:repositories.PullTexts = repositories.PullTexts() # Default generic pull text update me!!
    pullText.text = initialText
    pullText.topic = initialText
    if allRepositorys.pulltext != None: # Currently not used. Pass topic and text
        pullText = allRepositorys.pulltext
        if allRepositorys.pulltext.topic != "" and allRepositorys.pulltext != "":
            pullText.draft = False
    if issue != None:
        repositories.eprint("Get pulltext from issue " + str(issue.number) + " in " + issue.repositoryname)
        if issue.repositoryname == pullRepositorys[len(pullRepositorys)-1]:
            # The last repository is the repository which is used to generate the changes.md file.
            # The issue number can be passed to the pull request creation
            return None 
        else:
            # Read topic and text from github issue
            js = repositories.ghapi("GET", "/repos/" + allRepositorys.owner + "/" + issue.repositoryname 
            + "/issues/" + str(issue.number))
            result =json.loads(js)
            pullText.topic = result['title']
            pullText.text = result['body']
            pullText.draft = False
    else:
        bugs = ""
        features = ""
        topic = ""
        onePrText = ""
        type = ""
        for repository in allRepositorys.repositorys:
            if repository.pulltexts:
                for pt in repository.pulltexts:
                    if pt.type == 'bug':
                        bugs += "* " + repository.name + ":" + pt.topic + "<br>\n" 
                        if pt.text != None and pt.text != "":
                            bugs += "    " + pt.text + "<br>\n"
                    else:
                        features += "* " + repository.name + ":" + pt.topic + "<br>\n" 
                        if pt.text != None and pt.text != "":
                            features += "    " + pt.text + "<br>\n"
                    # if there is only one topic, use it, otherwise use default update me text
                    if topic == "":
                        topic = pt.topic
                        onePrText = pt.text
                        type = pt.type
                    else:
                        topic = None
        if bugs != "":
            pullText.text = "##Bugs:\n" + bugs 
        if features != "":
            pullText.text  += "##Features:\n" + features 
        if topic != None and topic != "":
            pullText.topic = topic
            pullText.text = onePrText
            pullText.draft = False
            pullText.type = type
    return pullText


def sync(repositorysList:repositories.Repositorys):
    repositories.doWithRepositorys(repositorysList, repositories.stashPushPackageJson)
    repositories.doWithRepositorys(repositorysList, repositories.syncRepository)
    repositories.doWithRepositorys(repositorysList, repositories.stashPopPackageJson)
        
def createPullRequests( repositorysList:repositories.Repositorys, issue:Issue):
    try:
        # compareRepositorys(repositorys)
        repositories.doWithRepositorys(repositorysList, repositories.stashPushPackageJson)
        repositories.doWithRepositorys(repositorysList, repositories.syncRepository, repositorysList)
        repositories.eprint("===== Sync finished ===========")
        repositories.doWithRepositorys(repositorysList, repositories.pushRepository, repositorysList)
        repositories.doWithRepositorys(repositorysList, repositories.compareRepository, repositorysList)
        pullRepositorys = getPullRepositorys(repositorysList)
        repositories.doWithRepositorys(repositorysList, repositories.readpulltextRepository)
        #repositories.doWithRepositorys(repositorysList, repositories.dependenciesRepository, repositorysList,"remote",None)
        repositories.doWithRepositorys(repositorysList, repositories.revertServerFilesRepository, repositorysList)
        pulltext = buildPulltext(repositorysList, pullRepositorys, issue)
        repositories.doWithRepositorys(repositorysList, repositories.createpullRepository, repositorysList, pullRepositorys, pulltext, issue )
        repositories.doWithRepositorys(repositorysList, repositories.updatepulltextRepository, repositorysList, pullRepositorys )
        repositories.doWithRepositorys(repositorysList, repositories.stashPopPackageJson)
    except Exception as err:
        repositories.eprint("Creating aborted =====")
        for arg in err.args:
            if type(arg) is str:
                repositories.eprint(  arg)
        repositories.eprint("================")
        exit(2)
def initRepositorys(branch):
    repositories.eprint("initRepository: " + branch)
    pwd = os.getcwd()
    for repository in repositorysList.repositorys:   
        # fork will fail if repository it is already forked.The error will be ignored
        owner = repositorysList.login
        pwd = os.getcwd()
        if repository.branch == None:
            repository.branch = branch
        if not repositories.isRepositoryForked(repository.name ):
            owner = repositorysList.owner    
        try:
            if not os.path.exists( repository.name ):
                repositories.executeCommand(['git','clone', repositories.getGitPrefixFromRepos(repositorysList)  + 
                owner + '/' + repository.name + '.git' , '--origin', owner ])
            else:
                os.chdir(repository.name)

            repositories.setUrl(repository,repositorysList)
   
        finally:
            os.chdir(pwd)
    repositories.doWithRepositorys(repositorysList, repositories.branchRepository, branch, False, "")
 

def dependencies( repositoryList, type:str, *args):
    mainrepository = repositoryList['mainrepository']
    owner = repositoryList['owner']
    pwd = os.getcwd()
    try:
        pkgjson = json.load(os.path.join(mainrepository, 'package.json'))
        repositories.doWithRepositorys('dependencies', repositoryList['repositorys'])
    finally:
        os.chdir(pwd)

def validatePullRequestArgs(pullrequest:str, pulltext:str, repos:repositories.Repositorys)->repositories.PullRequest:
    pr = None
    if pullrequest != None and pullrequest != '':
        pr  = repositories.getPullrequestFromString(pullrequest)
    if pr == None:
        if pulltext != None and pulltext != '':
            rc = repositories.getRequiredReposFromPRDescription(pulltext, None, repos.owner)
            if len(rc)==0:
                raise repositories.SyncException( "Usage: Either --pullrequest or -- pulltext is required ")
            else:
                pr = rc[0]
    return pr


parser = argparse.ArgumentParser()
subparsers = parser.add_subparsers(help="sub-commands")

parser.add_argument("-p", "--repositories", help="repositories.json file ",  nargs='?', default='repositories.json', const='repositories.json')
parser.add_argument("-o", "--owner", help="owner of the repository",  nargs='?', default=None)

parser_init = subparsers.add_parser("init", help="init: forks and clones repositories")
parser_init.add_argument("-b", "--branch", help="New branch name",  nargs='?', default='main')
parser_init.set_defaults(command='init')

parser_git = subparsers.add_parser("git", help="git execute git command for all repositories. add git arguments")
parser_git.set_defaults(command='git')


parser_authenticate = subparsers.add_parser("auth", help="Change git credential from ssh to https and vice versa")
parser_authenticate.add_argument("-t", "--https", help="Change git credential to https",  action='store_true')
parser_authenticate.set_defaults(command='auth')

parser_switch = subparsers.add_parser("branch", help="branch: Switches to the given branch")
parser_switch.add_argument("branch", help="branch name")
parser_switch.add_argument("-d","--delete", help="Deletes a branch in all repositories local and remote" , action='store_true')
parser_switch.set_defaults(command='branch')

parser_syncpull = subparsers.add_parser("syncpull", help="sync: pull request from root root repositories")
parser_syncpull.set_defaults(command='syncpull')
parser_syncpull.add_argument("branch", help="New branch for the Pull request " , type= str)
parser_syncpull.add_argument("-r","--pullrequest", help="Pull request <repository name>:<number> in repository  e.g 'angular:14'" , type= str,   nargs='?', default=None)
parser_syncpull.add_argument("-t","--pulltext", help="Pulltext " ,  nargs='?', type= str, default=None)

parser_sync = subparsers.add_parser("sync", help="sync: pulls main and current branch from root repositories")
parser_sync.set_defaults(command='sync')
parser_install = subparsers.add_parser("install", help="install: loads required components (E.g. npm install)")
parser_install.set_defaults(command='install')
parser_install.add_argument("-c","--ci", help="runs with npm ci instead of npm install" ,  nargs='?', type= bool, default=False)
parser_build = subparsers.add_parser("build", help="build: execute npm run build for all repositorys")
parser_build.set_defaults(command='build')
parser_test = subparsers.add_parser("test", help="test: execute npm test for all repositorys")
parser_test.set_defaults(command='test')
parser_test.add_argument("test", help="runs with npm ci instead of npm install", choices=["test", "startServers", "killServers", "packagejson"], default="test")

parser_execorwait = subparsers.add_parser("execorwait", help="Executed via github event pull_request")
parser_execorwait.set_defaults(command='execorwait')
parser_execorwait.add_argument( "pullrequest", help="Pull request <repository name>:<number> ", type = str)
parser_execorwait.add_argument("pulltext", help="Description of pull request ", type = str)
parser_execorwait.add_argument("waitreason", help="Description of pull request ", choices=["pullaction", "merge"], type = str)
parser_execorwait.add_argument("-n", "--noexec", help="Just evaluate whether this workflow will wait for tests or will execute it", action='store_true')


parser_release = subparsers.add_parser("release", help="releases all repositorys")
parser_release.set_defaults(command='release')
parser_create = subparsers.add_parser("createpull", help="createpull: creates pull requests ")
parser_create.add_argument("-i", "--issue", help="Issue number ",type = str,  nargs='?', default=None)
parser_create.set_defaults(command='createpull')

parser_dependencies = subparsers.add_parser("dependencies", help="dependencies changes dependencies in package.json files ]")
parser_dependencies.add_argument("dependencytype", help="command ", choices=['local','pull','remote'], default='local')
parser_dependencies.add_argument("-r", "--pullrequest", help="Pull request <repository name>:<number> in repository  e.g 'angular:14'" , type= str, default=None)
parser_dependencies.add_argument("-t", "--pulltext", help="Pulltext " , type= str, default=None)

parser_dependencies.set_defaults(command='dependencies')
try:
    #repositories.eprint( sys.orig_argv)
    args, unknownargs = parser.parse_known_args()
    repositorysList = repositories.readrepositorys(args.repositories, args.owner)
    if repositorysList == None:
        raise repositories.SyncException("Unable to read " + args.repositories + " invalid file content?")
except Exception as err:
    repositories.eprint(sys.argv)
    for arg in err.args:
        repositories.eprint( arg)
    exit(2)    

try:   
    match args.command:
        case "init":
            initRepositorys(args.branch)
        case "auth":
            if repositorysList.owner != repositorysList.login:
                raise repositories.SyncException("Owner same as logged in user: " + repositorysList.owner + " == " + repositorysList.login )
            repositories.doWithRepositorys(repositorysList, repositories.authRepository, repositorysList, args.https )
        case "git":
            repositories.doWithRepositorys(repositorysList, repositories.gitRepository, unknownargs)

        case "branch":
            repositories.doWithRepositorys(repositorysList, repositories.branchRepository, args.branch, args.delete, repositorysList.login)
        case "sync":
            repositories.doWithRepositorys(repositorysList, repositories.syncRepository,repositorysList)
        case "install":
            repositories.doWithRepositorys(repositorysList, repositories.npminstallRepository, args.ci)
        case "build":
            repositories.doWithRepositorys(repositorysList, repositories.buildRepository)
        case "syncpull":
            pr  = validatePullRequestArgs(args.pullrequest, args.pulltext, repositorysList)
            if args.pulltext == None or args.pulltext == '':
                prs =repositories.getRequiredPullrequests(pr,owner=repositorysList.owner)                
            else:
                prs = repositories.getRequiredPullrequests(  pullrequest=pr, pulltext=args.pulltext, owner=repositorysList.owner)
            repositories.doWithRepositorys(repositorysList, repositories.syncpullRepository,repositorysList, prs, args.branch)
        case "test":
            match args.test:
                case "packagejson":
                    testall.packagejson(repositorysList)

                case "test":
                    testall.testall(repositorysList)
                case  "startServers":
                    testall.startRequiredApps()
                case "killServers":
                    testall.killRequiredApps()

        case "execorwait":
            repositories.eprint("execorwait")
            if args.pullrequest == None or args.pullrequest == '':
                raise repositories.SyncException()
            else:
                pr  = repositories.getPullrequestFromString(args.pullrequest)
                pr.status = "open"
                requiredPrs = repositories.getRequiredReposFromPRDescription(args.pulltext,pr, repositorysList.owner)
                maintestPullrequest = None
                for p in requiredPrs:
                    if maintestPullrequest == None  and p.mergedAt == None and p.status != None and p.status.lower() != "closed":
                        maintestPullrequest = p
                if args.waitreason == "merge":
                    mergedCount = 0
                    closedCount = 0            
                    for pr1 in requiredPrs:
                        if pr1.mergedAt != None:
                            mergedCount += 1
                        if pr1.status.lower() == "closed":
                            closedCount += 1
                    if mergedCount == len( requiredPrs):
                        print("type=runner")
                    else:
                        repositories.eprint("Not all pull requests are merged terminating")
                        exit(2)
                else:
                    if maintestPullrequest == None:
                        raise repositories.SyncException( "Error: " + args.pullrequest + " is not in " + args.pulltext)

                    if pr != None and pr == maintestPullrequest:
                        # Tests will be executed in the workflow itself
                        if not args.noexec:
                            testall.testall(repositorysList)
                        else:     
                            print("type=runner")                  
                    else:
                        # wait happens here. If the testrunner action fails, this will exit(2)
                        # otherwise exit(0)
                        # I need a open pull request with check to proceed
                        #TODO repositories.waitForMainTestPullRequest(repositorysList,maintestPullrequest)
                        repositories.eprint("Wait is not implemented yet" )
                        for pr1 in requiredPrs:
                            ma = " "
                            if(pr1.mergedAt == None):
                                ma = ma + "not "
                            if(pr1.status == None):
                                st =  p.status.lower()
                            else:
                                st = "None"
                            repositories.eprint("required PR: " + ma + "merged. Status " +  st)

                        if( pr == None):
                            repositories.eprint("No pr extracted from pull request "  + args.pullrequest + "text:\n" + args.pulltext)
                        else:
                            repositories.eprint("No mainPullRequest found "  + args.pullrequest + "text:\n" + args.pulltext)
                            

        case "createpull":
            if repositorysList.owner == repositorysList.login:
                raise repositories.SyncException("Owner must be different from logged in user: " + repositorysList.owner + " == " + repositorysList.login )
            ii = None
            if args.issue != None:
                i = args.issue.split(':')
                ii= Issue( int(i[1]),i[0])
            createPullRequests( repositorysList, ii)
        case "dependencies":
            if args.dependencytype == 'pull':
                pr = None
                if args.pulltext == None or args.pulltext == '':
                    pr  = repositories.getPullrequestFromString(args.pullrequest)
                    prs = [pr]
                else:
                    prs = repositories.getRequiredPullrequests( pullrequest=pr,owner=repositorysList.owner, pulltext=args.pulltext)      
                for repository in repositorysList.repositorys:
                    for pr in prs:
                        if repository.name == pr.name:
                            repository.pullrequestid = pr.number
                repositories.doWithRepositorys(repositorysList, repositories.dependenciesRepository, repositorysList, args.dependencytype, prs)
            else:
                repositories.doWithRepositorys(repositorysList, repositories.dependenciesRepository, repositorysList, args.dependencytype, None)

        case "release":
                repositories.doWithRepositorys(repositorysList, repositories.prepareGitForReleaseRepository, repositorysList )
                repositories.doWithRepositorys(repositorysList, repositories.dependenciesRepository, repositorysList, 'release')
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
