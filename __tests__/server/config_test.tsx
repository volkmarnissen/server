/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, it, test, afterAll, beforeAll } from '@jest/globals'
import { Config, MqttValidationResult } from '../../src/server/config'
import { getFileNameFromName } from '../../src/specification.shared'
import * as fs from 'fs'
import { setConfigsDirsForTest } from './configsbase'
import { AuthenticationErrors } from '../../src/server.shared'
import Debug from 'debug'
import { ConfigTestHelper } from './testhelper'
setConfigsDirsForTest()
const debug = Debug('config_test')

// Test Helper Instanz
let configTestHelper: ConfigTestHelper

beforeAll(() => {
  return new Promise<void>((resolve, reject) => {
    // Erst Test-Verzeichnisse setzen, dann ConfigTestHelper
    configTestHelper = new ConfigTestHelper('config-test')
    configTestHelper.setup()
    const config = new Config()
    config.readYamlAsync().then(() => {
      const cfg = Config.getConfiguration()
      Config.tokenExpiryTime = 2000
      cfg.noAuthentication = false
      expect((cfg as any).noentry).toBeUndefined()
      new Config().writeConfiguration(cfg)
      Config.register('test', 'test123', false).then(() => {
        Config.login('test', 'test123')
          .then(() => {
            resolve()
          })
          .catch((e: unknown) => {
            reject(e)
          })
      })
    })
  })
})
afterAll(() => {
  const cfg = Config.getConfiguration()
  cfg.noAuthentication = false
  new Config().writeConfiguration(cfg)
  configTestHelper.restore()
})
test('register/login/validate', (done) => {
  const cfg = Config.getConfiguration()
  Config.tokenExpiryTime = 2000
  expect((cfg as any).noentry).toBeUndefined()
  new Config().writeConfiguration(cfg)
  Config.register('test', 'test123', false).then(() => {
    Config.login('test', 'test123').then((token) => {
      expect(Config.validateUserToken(token)).toBe(MqttValidationResult.OK)
      setTimeout(() => {
        expect(Config.validateUserToken(token)).toBe(MqttValidationResult.tokenExpired)
        Config.login('test', 'test124').catch((reason) => {
          expect(reason).toBe(AuthenticationErrors.InvalidUserPasswordCombination)
          done()
        })
      }, Config.tokenExpiryTime)
    })
  })
})
test('register/login/validate no Authentication', (done) => {
  const cfg = Config.getConfiguration()
  expect((cfg as any).noentry).toBeUndefined()
  new Config().writeConfiguration(cfg)
  Config.register(undefined, undefined, true).then(() => {
    expect(Config.validateUserToken(undefined)).toBe(MqttValidationResult.OK)
    done()
  })
})
it('getFileNameFromName remove non ascii characters', () => {
  const name = '/\\*& asdf+-_.'
  const fn = getFileNameFromName(name)
  debug(fn)
  expect(fn).toBe('asdf+-_.')
})

it('writeConfiguration change password ', () => {
  const cr = new Config()
  const cfg = Config.getConfiguration()
  const oldpassword = cfg.mqttconnect.password
  cfg.mqttconnect.password = 'testpassword'
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe('testpassword')
  expect(cfg.mqttconnect.password).toBe('testpassword') // from secrets.yaml
  let cfgStr = fs.readFileSync(Config.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  cfg.mqttconnect.password = oldpassword
  cr.writeConfiguration(cfg)
  expect(Config['config'].mqttconnect.password).toBe(oldpassword)
  cfgStr = fs.readFileSync(Config.getLocalDir() + '/modbus2mqtt.yaml').toString()
  expect(cfgStr).toContain('!secret ')
  const secretsStr = fs.readFileSync(Config.getLocalDir() + '/secrets.yaml').toString()
  expect(secretsStr).toContain(oldpassword)
})

export const mqttService = {
  host: 'core-mosquitto',
  port: 1883,
  ssl: false,
  protocol: '3.1.1',
  username: 'addons',
  password: 'Euso6ahphaiWei9Aeli6Tei0si2paep5agethohboophe7vae9uc0iebeezohg8e',
  addon: 'core_mosquitto',
}
const mockedReason = 'Failed to get HASSIO MQTT Data'

let mockReject = false
function executeHassioGetRequest<T>(_url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
  if (mockReject) reject(mockedReason)
  else next({ data: mqttService } as T)
}

it('getMqttConnectOptions: read connection from hassio', (done) => {
  const oldExecute = Config['executeHassioGetRequest']
  Config['executeHassioGetRequest'] = executeHassioGetRequest
  process.env.HASSIO_TOKEN = 'test'
  const cfg = new Config()
  Config['config'].mqttusehassio = true
  cfg.getMqttConnectOptions().then((_mqttData) => {
    expect(_mqttData.mqttserverurl).toBe('mqtt://core-mosquitto:1883')
    expect(_mqttData.username).toBe(mqttService.username)
    mockReject = true
    cfg.getMqttConnectOptions().catch((reason) => {
      expect(reason).toBe(mockedReason)
      // Restore class
      process.env.HASSIO_TOKEN = ''
      Config['executeHassioGetRequest'] = oldExecute

      done()
    })
  })
})
