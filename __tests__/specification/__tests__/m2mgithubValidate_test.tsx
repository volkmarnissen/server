import Debug from 'debug'
import { M2mGithubValidate } from '../../src/server/m2mGithubValidate'
import { ConfigSpecification } from '../../src/server/configspec'
import { it, expect, beforeAll, afterAll } from '@jest/globals'
import * as fs from 'fs'
const debug = Debug('m2mgithubvalidate')

let yamlDir = '__tests__/yamlDirValidate'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_TOKEN: string
      GITHUB_TOKEN_PARENT: string
    }
  }
}

Debug.enable('m2mgithubvalidate')
ConfigSpecification['yamlDir'] = yamlDir
beforeAll(() => {
  fs.rmSync(yamlDir, { recursive: true, force: true })
  fs.mkdirSync(yamlDir)
})
afterAll(() => {
  fs.rmSync(yamlDir, { recursive: true, force: true })
})

it.skip('validate test requires GITHUB_TOKEN', (done) => {
  expect(process.env.GITHUB_TOKEN).toBeDefined()
  let github = new M2mGithubValidate(process.env.GITHUB_TOKEN as string)
}, 10000)
