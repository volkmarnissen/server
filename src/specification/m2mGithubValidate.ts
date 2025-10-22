import { join } from 'path'
import * as fs from 'fs'
import { M2mGitHub, githubPublicNames } from './m2mgithub'
import { Octokit } from '@octokit/rest'
let path = require('path')

const debug = require('debug')('m2mgithubvalidate')
export interface IpullRequest {
  files?: string[]
  merged: boolean
  closed: boolean
  pullNumber: number
}
export class M2mGithubValidate {
  private octokit: Octokit | null
  constructor(personalAccessToken: string | null) {
    this.octokit = null
    if (personalAccessToken)
      this.octokit = new Octokit({
        auth: personalAccessToken,
      })
  }

  listPullRequestFiles(owner: string, pull_number: number): Promise<{ pr_number: number; files: string[] }> {
    return new Promise<{ pr_number: number; files: string[] }>((resolve, reject) => {
      this.octokit!.pulls.listFiles({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        pull_number: pull_number,
      })
        .then((files) => {
          let f: string[] = []
          files.data.forEach((file) => {
            if (['added', 'modified', 'renamed', 'copied', 'changed'].includes(file.status)) f.push(file.filename)
          })
          resolve({ pr_number: pull_number, files: f })
        })
        .catch(reject)
    })
  }
  closePullRequest(pullNumber: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.octokit!.pulls.update({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        pull_number: pullNumber,
        state: 'closed',
      })
        .then((res) => {
          this.octokit!.issues.update({
            owner: githubPublicNames.publicModbus2mqttOwner,
            repo: githubPublicNames.modbus2mqttRepo,
            issue_number: parseInt(path.basename(res.data.issue_url)),
            state: 'closed',
          })
            .then(() => {
              resolve()
            })
            .catch((e) => {
              e.step = 'closeIssue'
              reject(e)
            })
        })
        .catch((e) => {
          e.step = 'closePullRequest'
          reject(e)
        })
    })
  }

  addIssueComment(pullNumber: number, text: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.octokit!.issues.createComment({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        issue_number: pullNumber,
        body: text,
      })
        .then(() => {
          resolve()
        })
        .catch((e) => {
          e.step = 'addIssueComment'
          reject(e)
        })
    })
  }

  mergePullRequest(pullNumber: number, title?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.octokit!.pulls.merge({
        owner: githubPublicNames.publicModbus2mqttOwner,
        repo: githubPublicNames.modbus2mqttRepo,
        pull_number: pullNumber,
        commit_title: title,
        merge_method: 'squash',
      })
        .then(() => {
          resolve()
        })
        .catch((e) => {
          e.step = 'mergePullRequest'
          reject(e)
        })
    })
  }
}
