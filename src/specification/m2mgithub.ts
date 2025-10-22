import { Octokit } from '@octokit/rest'
import { LogLevelEnum, Logger } from './log'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { Subject, first } from 'rxjs'
import * as fs from 'fs'
import { ConfigSpecification } from './configspec'

const debug = require('debug')('m2mgithub')
export const githubPublicNames = {
  publicModbus2mqttOwner: 'modbus2mqtt',
  modbus2mqttRepo: 'modbus2mqtt.config',
  modbus2mqttBranch: 'main',
}

const log = new Logger('m2mGithub')
export interface ITreeParam {
  path: string
  mode: '100644'
  type: 'blob'
  sha: string
}
interface IPullRequestStatusInfo {
  merged: boolean
  closed_at: string | null
  html_url: string
}
export class M2mGitHub {
  private ownOwner: string | undefined
  protected octokit: Octokit | null
  private static forking: boolean = false
  private isRunning = false
  private waitFinished: Subject<void> = new Subject<void>()
  private findOrCreateOwnModbus2MqttRepo(): Promise<void> {
    return new Promise((resolve, reject) => {
      debug('findOrCreateOwnModbus2MqttRepo')
      if (this.ownOwner && this.octokit)
        this.octokit.repos
          .listForUser({
            username: this.ownOwner,
            type: 'all',
          })
          .then((repos) => {
            let found = repos.data.find((repo) => repo.name == githubPublicNames.modbus2mqttRepo)
            if (found == null && !M2mGitHub.forking) this.createOwnModbus2MqttRepo().then(resolve).catch(reject)
            else {
              if (found != null) M2mGitHub.forking = false
              resolve()
            }
          })
          .catch(reject)
    })
  }
  hasSpecBranch(branch: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else
        this.octokit.git
          .getRef({
            owner: this.ownOwner!,
            repo: exports.githubPublicNames.modbus2mqttRepo,
            ref: 'heads/' + branch,
          })
          .then((branches) => {
            resolve(true)
          })
          .catch((e) => {
            debug('get Branch' + e.message)
            if (e.status == 404) resolve(false)
            else reject(e)
          })
    })
  }
  deleteSpecBranch(branch: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else
        this.hasSpecBranch(branch)
          .then((hasBranch) => {
            if (hasBranch)
              this.octokit!.git.deleteRef({
                owner: this.ownOwner!,
                repo: githubPublicNames.modbus2mqttRepo,
                ref: 'heads/' + branch,
              })
                .then(() => {
                  resolve()
                })
                .catch(reject)
            else resolve()
          })
          .catch(reject)
    })
  }
  private createOwnModbus2MqttRepo(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      debug('createOwnModbus2MqttRepo')

      M2mGitHub.forking = true
      if (githubPublicNames.publicModbus2mqttOwner)
        this.octokit!.repos.createFork({
          owner: githubPublicNames.publicModbus2mqttOwner,
          repo: githubPublicNames.modbus2mqttRepo,
          default_branch_only: true,
        })
          .then(() => {
            resolve()
          })
          .catch((e) => {
            M2mGitHub.forking = false
            reject(e)
          })
    })
  }

  private checkRepo(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else if (this.ownOwner)
        this.octokit.repos
          .listForUser({
            username: this.ownOwner,
            type: 'all',
          })
          .then((repos) => {
            let found = repos.data.find((repo) => repo.name == githubPublicNames.modbus2mqttRepo)
            if (found) {
              debug('checkRepo: sync fork')
              M2mGitHub.forking = false
              this.octokit!.request(`POST /repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/merge-upstream`, {
                branch: githubPublicNames.modbus2mqttBranch,
              })
                .then((_r) => {
                  resolve(true)
                })
                .catch((e) => {
                  let e1 = new Error(e.message)
                  ;(e1 as any).step = e.step
                  e1.stack = e.stack
                  if (e.code == 422)
                    e1.message = e.message + '\n Permission denied for the github token. Please sync Repository in github.com.'
                  reject(e1)
                })
            }
          })
      else resolve(false)
    })
  }
  private waitForOwnModbus2MqttRepo(): Promise<void> {
    if (this.isRunning) {
      // some other process is waiting already.
      // Just wait until it's done
      return new Promise<void>((resolve) => {
        this.waitFinished.pipe(first()).subscribe(() => {
          resolve()
        })
      })
    } else {
      return new Promise<void>((resolve, reject) => {
        if (null == this.octokit) reject(new Error('No Github token configured'))
        else {
          let count = 0

          // Once per second for 30 seconds, then once per minute
          let interval = setInterval(() => {
            debug('inInterval')
            if (!this.isRunning && (count > 30 ? Math.floor(count % 60) == 0 : true)) {
              this.isRunning = true
              this.checkRepo()
                .then((available) => {
                  if (available) {
                    this.isRunning = false
                    this.waitFinished.next()
                    clearInterval(interval)
                    resolve()
                  }
                })
                .catch((e) => {
                  this.isRunning = false
                  log.log(
                    LogLevelEnum.error,
                    'Validate Repository ' +
                      this.ownOwner +
                      '/' +
                      githubPublicNames.publicModbus2mqttOwner +
                      ' failed. message: ' +
                      e.message +
                      ' Status: ' +
                      e.status
                  )
                  reject(e)
                })
            }
            count++
          }, 1000)
        }
      })
    }
  }

  constructor(
    personalAccessToken: string | null,
    private publicRoot: string
  ) {
    this.octokit = null
    if (personalAccessToken)
      this.octokit = new Octokit({
        auth: personalAccessToken,
      })
  }
  fetchPublicFiles(): void {
    debug('Fetch public files')
    if (existsSync(join(this.publicRoot, '.git'))) {
      let msg = execSync('git pull', { cwd: this.publicRoot }).toString()
      // log more than two lines only. Two lines usually means up-to-date 1th line + \n
      if (msg.split(/\r\n|\r|\n/).length > 2) log.log(LogLevelEnum.notice, msg)
    } // creating a repo is worth a notice
    else
      log.log(
        LogLevelEnum.notice,
        execSync(
          'git clone https://github.com/' +
            githubPublicNames.publicModbus2mqttOwner +
            '/' +
            githubPublicNames.modbus2mqttRepo +
            '.git ' +
            this.publicRoot
        ).toString()
      )
    new ConfigSpecification().readYaml()
  }
  static getPullRequestUrl(pullNumber: number): string {
    return `https://github.com/${githubPublicNames.publicModbus2mqttOwner}/${githubPublicNames.modbus2mqttRepo}/pull/${pullNumber}`
  }
  createPullrequest(title: string, content: string, branchName: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else
        this.octokit.rest.issues
          .create({
            owner: githubPublicNames.publicModbus2mqttOwner,
            repo: githubPublicNames.modbus2mqttRepo,
            title: title,
            body: content,
            labels: ['automerge'],
          })
          .then((res) => {
            this.octokit!.rest.pulls.create({
              owner: githubPublicNames.publicModbus2mqttOwner,
              body: content + '\nCloses #' + res.data.number,
              repo: githubPublicNames.modbus2mqttRepo,
              issue: res.data.number,
              head: this.ownOwner + ':' + branchName,
              base: githubPublicNames.modbus2mqttBranch,
            })
              .then((res) => {
                resolve(res.data.number)
              })
              .catch((e) => {
                e.step = 'create pull'
                reject(e)
              })
          })
          .catch((e) => {
            e.step = 'create issue'
            reject(e)
          })
    })
  }

  getPullRequest(pullNumber: number): Promise<IPullRequestStatusInfo> {
    return new Promise<IPullRequestStatusInfo>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else
        this.octokit.pulls
          .get({
            owner: githubPublicNames.publicModbus2mqttOwner,
            repo: githubPublicNames.modbus2mqttRepo,
            pull_number: pullNumber,
          })
          .then((pull) => {
            resolve(pull.data)
          })
          .catch((e) => {
            if (e.step == undefined) e.step = 'downloadFile'
            debug(JSON.stringify(e))
            reject(e)
          })
    })
  }
  getInfoFromError(e: any) {
    let msg = JSON.stringify(e)
    if (e.message) msg = 'ERROR: ' + e.message
    if (e.status) msg += ' status: ' + e.status
    if (e.message) msg += ' message: ' + e.message
    if (e.step) msg += ' in ' + e.step
    return msg
  }

  private uploadFileAndCreateTreeParameter(root: string, filename: string): Promise<ITreeParam> {
    return new Promise<ITreeParam>((resolve, reject) => {
      debug('uploadFileAndCreateTreeParameter')
      let encoding: BufferEncoding = filename.endsWith('.yaml') ? 'utf8' : 'base64'
      let params = {
        owner: this.ownOwner!,
        repo: githubPublicNames.modbus2mqttRepo,
        encoding: encoding == 'utf8' ? 'utf-8' : encoding,
        content: fs.readFileSync(join(root, filename)).toString(encoding),
      }
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else
        this.octokit.git
          .createBlob(params)
          .then((res) => {
            resolve({
              path: filename,
              mode: '100644',
              type: 'blob',
              sha: res.data.sha,
            })
          })
          .catch((e) => {
            e.step = 'createBlob'
            reject(e)
          })
    })
  }
  init(): Promise<boolean> {
    // checks if fork from public repository is available
    // Otherwise it creates it, but doesn't wait for creation
    // fetches all files from public repo (Works also if no personal repo is available yet)
    return new Promise<boolean>((resolve, reject) => {
      debug('init')
      try {
        this.fetchPublicFiles()
      } catch (e) {
        reject(e)
      }
      if (null == this.octokit) resolve(false)
      else if (!this.ownOwner) {
        this.octokit.users
          .getAuthenticated()
          .then((user) => {
            this.ownOwner = user.data.login
            this.findOrCreateOwnModbus2MqttRepo()
              .then(() => {
                resolve(true)
              })
              .catch((e) => {
                this.ownOwner = undefined
                reject(e)
              })
          })
          .catch(reject)
      } else
        this.findOrCreateOwnModbus2MqttRepo()
          .then(() => {
            resolve(true)
          })
          .catch((e) => {
            this.ownOwner = undefined
            reject(e)
          })
    })
  }
  deleteRepository(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (null == this.octokit) reject(new Error('No Github token configured'))
      else if (this.ownOwner)
        this.octokit.repos
          .delete({
            owner: this.ownOwner,
            repo: githubPublicNames.modbus2mqttRepo,
          })
          .then(() => {
            resolve()
          })
          .catch(reject)
    })
  }
  private checkFiles(root: string, files: string[]): Promise<ITreeParam>[] {
    let all: Promise<ITreeParam>[] = []
    files.forEach((file) => {
      debug('root: ' + root + ' file: ' + file)
      let fullPath = join(root, file)
      if (!fs.existsSync(fullPath)) {
        if (fullPath.indexOf('/files/') != -1 && !fullPath.endsWith('files.yaml')) {
          // Can be ignored if the files are missing, they have been published already
          debug('File not found: ' + fullPath)
        } else {
          throw new Error('File not found ' + fullPath)
        }
      } else all.push(this.uploadFileAndCreateTreeParameter(root, file))
    })
    return all
  }
  commitFiles(root: string, branchName: string, files: string[], title: string, message: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.waitForOwnModbus2MqttRepo()
        .then(() => {
          this.hasSpecBranch(branchName)
            .then((hasBranch) => {
              if (hasBranch)
                reject(
                  new Error(
                    'There is already a branch named ' +
                      branchName +
                      ' Please delete it in your github repository ' +
                      this.ownOwner +
                      '/' +
                      githubPublicNames.modbus2mqttRepo +
                      ' at github.com'
                  )
                )
              else {
                debug('start committing')
                let all: Promise<ITreeParam>[]
                try {
                  let all = this.checkFiles(root, files)

                  Promise.all(all!)
                    .then((trees) => {
                      debug('get Branch')
                      this.octokit!.git.getRef({
                        owner: this.ownOwner!,
                        repo: githubPublicNames.modbus2mqttRepo,
                        ref: 'heads/' + githubPublicNames.modbus2mqttBranch,
                      })
                        .then((ref) => {
                          let sha = ref.data.object.sha
                          // create a new branch
                          this.octokit!.git.createRef({
                            owner: this.ownOwner!,
                            repo: githubPublicNames.modbus2mqttRepo,
                            ref: 'refs/heads/' + branchName,
                            sha: ref.data.object.sha,
                          })
                            .then((branch) => {
                              branch.data.object.sha
                              //this.octokit.git.getTree()
                              this.octokit!.request(
                                `GET /repos/${this.ownOwner}/${githubPublicNames.modbus2mqttRepo}/git/trees/${githubPublicNames.modbus2mqttBranch}`
                              )
                                .then((tree) => {
                                  debug('createTree')
                                  this.octokit!.git.createTree({
                                    owner: this.ownOwner!,
                                    repo: githubPublicNames.modbus2mqttRepo,
                                    tree: trees,
                                    base_tree: tree.data.sha,
                                  })
                                    .then((result) => {
                                      debug('createCommit')
                                      this.octokit!.git.createCommit({
                                        owner: this.ownOwner!,
                                        repo: githubPublicNames.modbus2mqttRepo,
                                        message: title + '\n' + message,
                                        tree: result.data.sha,
                                        parents: [branch.data.object.sha],
                                      })
                                        .then((_result) => {
                                          debug('updateRef')
                                          this.octokit!.git.updateRef({
                                            owner: this.ownOwner!,
                                            repo: githubPublicNames.modbus2mqttRepo,
                                            ref: 'heads/' + branchName,
                                            sha: _result.data.sha,
                                          })
                                            .then(() => {
                                              debug('updated')
                                              resolve(_result.data.sha)
                                            })
                                            .catch((e) => {
                                              e.step = 'updateRef'
                                              reject(e)
                                            })
                                        })
                                        .catch((e) => {
                                          e.step = 'createCommit'
                                          reject(e)
                                        })
                                    })
                                    .catch((e) => {
                                      e.step = 'create Tree'
                                      reject(e)
                                    })
                                })
                                .catch((e) => {
                                  e.step = 'get base tree'
                                  reject(e)
                                })
                            })
                            .catch((e) => {
                              e.step = 'create branch'
                              reject(e)
                            })
                        })
                        .catch((e) => {
                          e.step = 'get branch'
                          reject(e)
                        })
                    })
                    .catch((e) => {
                      e.step = 'create blobs'
                      reject(e)
                    })
                } catch (e:any) {
                  e.step = 'waiting for all failed'
                  reject(e)
                  return
                }
              }
            })
            .catch((e) => {
              e.step = 'hasSpecBranch'
              reject(e)
            })
        })
        .catch((e) => {
          e.step = 'waitForOwnModbus2MqttRepo'
          reject(e)
        })
    })
    // commits the given files with message to own repository
    // creates an issue in the public repository
    // creates a pull request to the public repository
    // If there is already a pull request, the new request will be appended
  }
}
