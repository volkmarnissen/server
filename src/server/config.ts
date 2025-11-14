import Debug from 'debug'
import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'
import packageJson from '../../package.json'
import stream from 'stream'
import { Subject } from 'rxjs'
import { getBaseFilename } from '../specification.shared'
import { JwtPayload, sign, verify } from 'jsonwebtoken'
import * as bcrypt from 'bcryptjs'
import * as http from 'http'
import { LogLevelEnum, Logger, filesUrlPrefix } from '../specification'
import { ImqttClient, AuthenticationErrors, Iconfiguration, IUserAuthenticationStatus } from '../server.shared'
import AdmZip from 'adm-zip'
import { Bus } from './bus'
import { IClientOptions } from 'mqtt'
const CONFIG_VERSION = '0.1'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      HASSIO_TOKEN: string
    }
  }
}
const DEFAULT_MQTT_CONNECT_TIMEOUT = 60 * 1000
const HASSIO_TIMEOUT = 3000
export enum MqttValidationResult {
  OK = 0,
  tokenExpired = 1,
  error = 2,
}
export enum ConfigListenerEvent {
  addSlave,
  deleteSlave,
  updateSlave,
  deleteBus,
}
const log = new Logger('config')
const secretsLength = 256
const debug = Debug('config')
const debugAddon = Debug('config.addon')
const saltRounds = 8
const defaultTokenExpiryTime = 1000 * 60 * 60 * 24 // One day
//TODO const defaultTokenExpiryTime = 1000 * 20 // three seconds for testing
//const baseTopic = 'modbus2mqtt';
//const baseTopicHomeAssistant = 'homeassistant';
export class Config {
  static tokenExpiryTime: number = defaultTokenExpiryTime
  static mqttHassioLoginData: ImqttClient | undefined = undefined
  static async login(name: string, password: string): Promise<string> {
    if (Config.config.noAuthentication) {
      log.log(LogLevelEnum.error, 'Login called, but noAuthentication is configured')
      throw AuthenticationErrors.InvalidParameters
    }

    if (Config.config && Config.config.username && Config.config.password) {
      // Login
      if (name === Config.config.username) {
        let success = false
        try {
          success = await bcrypt.compare(password, Config.config.password)
        } catch (err) {
          log.log(LogLevelEnum.error, 'login: compare failed: ' + err)
          throw AuthenticationErrors.InvalidParameters
        }
        if (success) {
          try {
            //const iat = Math.floor(Date.now() / 1000)
            //const exp = iat + Config.config.tokenExpiryTimeInMSec // seconds
            const s = sign({ password: password }, Config.secret, {
              expiresIn: (Config.tokenExpiryTime + 'ms') as any,
              algorithm: 'HS256',
            })
            return s
          } catch (err) {
            log.log(LogLevelEnum.error, err)
            throw AuthenticationErrors.SignError
          }
        } else {
          throw AuthenticationErrors.InvalidUserPasswordCombination
        }
      } else {
        log.log(LogLevelEnum.error, 'login: Username was not set')
        throw AuthenticationErrors.InvalidParameters
      }
    }
    throw AuthenticationErrors.InvalidParameters
  }
  static async register(name: string | undefined, password: string | undefined, noAuthentication: boolean): Promise<void> {
    if (noAuthentication == true) {
      Config.config.noAuthentication = true
      new Config().writeConfiguration(Config.config)
      return
    } else if (Config.config && password) {
      // Login
      //No username and password configured.: Register login
      const enc = await bcrypt.hash(password, saltRounds)
      Config.config.password = enc
      Config.config.username = name
      new Config().writeConfiguration(Config.config)
    } else {
      throw AuthenticationErrors.InvalidParameters
    }
  }
  static validateUserToken(token: string | undefined): MqttValidationResult {
    if (this.config.noAuthentication) return MqttValidationResult.OK
    if (token == undefined) return MqttValidationResult.error

    try {
      const payload = verify(token, Config.secret) as JwtPayload & { password: string }
      if (bcrypt.compareSync(payload.password, Config.config.password!)) {
        return MqttValidationResult.OK
      }
      return MqttValidationResult.error
    } catch (err) {
      if ((err as any).name === 'TokenExpiredError') {
        return MqttValidationResult.tokenExpired
      }
      log.log(LogLevelEnum.error, 'JWT validation failed: ' + err)
      return MqttValidationResult.error
    }
  }

  static getLocalDir(): string {
    return join(Config.configDir, 'modbus2mqtt')
  }

  private static config: Iconfiguration
  private static secret: string
  private static specificationsChanged = new Subject<string>()
  private static newConfig: Iconfiguration = {
    version: CONFIG_VERSION,
    mqttbasetopic: 'modbus2mqtt',
    mqttdiscoveryprefix: 'homeassistant',
    mqttdiscoverylanguage: 'en',
    mqttconnect: {
      connectTimeout: DEFAULT_MQTT_CONNECT_TIMEOUT,
    },
    httpport: 3000,
    fakeModbus: false,
    noAuthentication: false,
  }

  static configDir: string = ''
  static dataDir: string = ''
  static sslDir: string = ''

  static getSecret(pathStr: string): string {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    let counter = 0
    if (fs.existsSync(pathStr)) {
      let secret = fs.readFileSync(pathStr, { encoding: 'utf8' }).toString()
      if( secret && secret.length > 0) {
        return secret
      }
    }
    debug('getSecret: Create secrets file at' + pathStr)
    while (counter < secretsLength) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
      counter += 1
    }
    const dir = path.dirname(pathStr)
    debug('Config.getSecret: write Secretfile to ' + pathStr)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(pathStr, result, { encoding: 'utf8' })
    debug('Config.getSecret: write successful')

    return result
  }
  static getConfiguration(): Iconfiguration {
    if (Config.secret == undefined) {
      // Use sslDir if explicitly set (Home Assistant case), otherwise use current working directory
      const effectiveSslDir = Config.sslDir.length > 0 ? Config.sslDir : process.cwd()
      const secretsfile = join(effectiveSslDir, 'secrets.txt')
      const secretsDir = path.dirname(secretsfile)
      // Only create the directory if we're going to write to it
      if (secretsDir && !fs.existsSync(secretsfile) && !fs.existsSync(secretsDir)) {
        fs.mkdirSync(secretsDir, { recursive: true })
      }
      // Check permissions before proceeding
      if (fs.existsSync(secretsfile)) {
        debug('secretsfile ' + secretsfile + ' exists')
        try {
          fs.accessSync(secretsfile, fs.constants.W_OK)
        } catch (err: any) {
          const msg = `Secrets file ${secretsfile} is not writable! (error: ${err.message})`
          log.log(LogLevelEnum.error, msg)
          throw new Error(msg)
        }
      } else {
        // File doesn't exist, check if we can write to the directory
        try {
          fs.accessSync(secretsDir, fs.constants.W_OK)
        } catch (err: any) {
          const msg = `Secrets directory ${secretsDir} is not writable! (cwd: ${process.cwd()}, error: ${err.message})`
          log.log(LogLevelEnum.error, msg)
          throw new Error(msg)
        }
      }

      debug('Config.getConfiguration: secretsfile permissions are OK ' + secretsfile)
      Config.secret = Config.getSecret(secretsfile)
    }

    if (Config.config) {
      Config.config.version = Config.config.version ? Config.config.version : CONFIG_VERSION
      Config.config.mqttbasetopic = Config.config.mqttbasetopic ? Config.config.mqttbasetopic : 'modbus2mqtt'
      Config.config.mqttdiscoveryprefix = Config.config.mqttdiscoveryprefix ? Config.config.mqttdiscoveryprefix : 'homeassistant'
      Config.config.mqttdiscoverylanguage = Config.config.mqttdiscoverylanguage ? Config.config.mqttdiscoverylanguage : 'en'
      if (!Config.config.mqttconnect) Config.config.mqttconnect = {}
      Config.updateMqttTlsConfig(Config.config)

      Config.config.mqttconnect.connectTimeout = Config.config.mqttconnect.connectTimeout
        ? Config.config.mqttconnect.connectTimeout
        : DEFAULT_MQTT_CONNECT_TIMEOUT
      Config.config.mqttconnect.clientId = Config.config.mqttconnect.clientId ? Config.config.mqttconnect.clientId : 'modbus2mqtt'
      Config.config.mqttconnect.clean = Config.config.mqttconnect.clean ? Config.config.mqttconnect.clean : false
      delete Config.config.mqttconnect.will
      Config.config.httpport = Config.config.httpport ? Config.config.httpport : 3000
      Config.config.fakeModbus = Config.config.fakeModbus ? Config.config.fakeModbus : false
      Config.config.noAuthentication = Config.config.noAuthentication ? Config.config.noAuthentication : false
      Config.config.tcpBridgePort = Config.config.tcpBridgePort ? Config.config.tcpBridgePort : 502
      process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length ? process.env.HASSIO_TOKEN : undefined
      Config.config.appVersion = Config.config.appVersion ? Config.config.appVersion : packageJson.version
      Config.config.mqttusehassio =
        Config.config.mqttusehassio && process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length
          ? Config.config.mqttusehassio
          : process.env.HASSIO_TOKEN != undefined && process.env.HASSIO_TOKEN.length > 0
      Config.config.supervisor_host = Config.config.supervisor_host ? Config.config.supervisor_host : 'supervisor'
    } else {
      log.log(LogLevelEnum.info, 'No config file found ')
      Config.config = structuredClone(Config.newConfig)
    }
    return structuredClone(Config.config)
  }
  static getAuthStatus(): IUserAuthenticationStatus {
    return {
      registered:
        Config.config.mqttusehassio ||
        Config.config.noAuthentication ||
        (Config.config.username != undefined && Config.config.password != undefined),
      hassiotoken: Config.config.mqttusehassio ? Config.config.mqttusehassio : false,
      noAuthentication: Config.config.noAuthentication ? Config.config.noAuthentication : false,
      mqttConfigured: false,
      preSelectedBusId: Bus.getBusses().length == 1 ? Bus.getBusses()[0].getId() : undefined,
    }
  }
  async readGetResponse(res: http.IncomingMessage): Promise<any> {
    const lbuffers: Uint8Array[] = []

    return new Promise<any>((resolve, reject) => {
      res.on('data', (chunk) => lbuffers.push(chunk))
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode < 299) {
            const lbuffer = Buffer.concat(lbuffers)
            const json = JSON.parse(lbuffer.toString())
            resolve(json)
          } else {
            // http Error
            reject(lbuffers)
          }
        } catch (e: any) {
          reject(e)
        }
      })
      res.on('error', (err) => {
        reject(err)
      })
    })
  }
  static executeHassioGetRequest<T>(url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
    // This method can be called before configuration. It can't use config.hassio
    const hassiotoken: string | undefined = process.env.HASSIO_TOKEN
    if (!hassiotoken || hassiotoken.length == 0) throw new Error('ENV: HASSIO_TOKEN not defined')

    const timer = setTimeout(() => {
      clearTimeout(timer)
      reject(new Error('TIMEOUT(' + HASSIO_TIMEOUT + 'ms)'))
    }, HASSIO_TIMEOUT /* ms */)
    try {
      fetch('http://' + Config.getConfiguration().supervisor_host + url, {
        headers: {
          authorization: 'Bearer ' + hassiotoken,
          accept: 'application/json',
        },
      })
        .then((res) => {
          clearTimeout(timer)
          if (res)
            res
              .json()
              .then((obj) => {
                if (obj)
                  if (obj.data) next(obj)
                  else if (obj.result == 'error') reject(new Error('HASSIO: ' + obj.message))
                  else reject(new Error('get' + url + ' expected data root object: ' + JSON.stringify(obj)))
              })
              .catch((reason) => {
                const msg = 'supervisor call ' + url + ' failed ' + JSON.stringify(reason) + ' ' + res.headers.get('content-type')
                log.log(LogLevelEnum.error, msg)
                reject(new Error(msg))
              })
        })
        .catch((reason) => {
          clearTimeout(timer)
          log.log(LogLevelEnum.error, JSON.stringify(reason))
          reject(reason)
        })
    } catch (e: any) {
      log.log(LogLevelEnum.error, e.message)
    }
  }

  validateHassioToken(hassiotoken: string, next: () => void, reject: () => void): void {
    if (!hassiotoken || hassiotoken.length == 0) throw new Error('ENV: HASSIO_TOKEN not defined')

    fetch('http://supervisor/hardware/info', {
      headers: {
        authorization: 'Bearer ' + hassiotoken,
        accept: 'application/json',
      },
    })
      .then((res) => {
        if (res.status! >= 200 && res.status! < 300) next()
        else {
          res.json().then((e) => {
            log.log(LogLevelEnum.error, 'Hassio validation error: ' + JSON.stringify(e))
            reject()
          })
        }
      })
      .catch((e) => {
        log.log(LogLevelEnum.error, e.message)
      })
  }
  private static readCertfile(filename?: string): string | undefined {
    if (filename && Config.sslDir) {
      const fn = join(Config.sslDir, filename)
      if (fs.existsSync(fn)) return fs.readFileSync(fn, { encoding: 'utf8' }).toString()
    }
    return undefined
  }
  static updateMqttTlsConfig(config: Iconfiguration) {
    if (config && config.mqttconnect) {
      ;(config.mqttconnect as IClientOptions).key = this.readCertfile(config.mqttkeyFile)
      ;(config.mqttconnect as IClientOptions).ca = this.readCertfile(config.mqttcaFile)
      ;(config.mqttconnect as IClientOptions).cert = this.readCertfile(config.mqttcertFile)
    }
  }

  private async getMqttLoginFromHassio(): Promise<ImqttClient> {
    return new Promise<ImqttClient>((resolve, reject) => {
      try {
        Config.executeHassioGetRequest<{ data: ImqttClient }>(
          '/services/mqtt',
          (mqtt) => {
            const config = Config.getConfiguration()
            config.mqttconnect = mqtt.data
            if (
              config.mqttconnect.mqttserverurl == undefined &&
              (config.mqttconnect as IClientOptions).host != undefined &&
              (config.mqttconnect as IClientOptions).port != undefined
            )
              config.mqttconnect.mqttserverurl =
                (config.mqttconnect.ssl ? 'mqtts' : 'mqtt') +
                '://' +
                (config.mqttconnect as IClientOptions).host +
                ':' +
                (config.mqttconnect as IClientOptions).port
            if (mqtt.data.ssl) Config.updateMqttTlsConfig(config)
            delete (config.mqttconnect as any).ssl
            delete (config.mqttconnect as any).protocol
            delete (config.mqttconnect as any).addon
            debugAddon('getMqttLoginFromHassio: Read MQTT login data from Hassio')
            config.mqttconnect.connectTimeout = DEFAULT_MQTT_CONNECT_TIMEOUT
            resolve(config.mqttconnect)
          },
          reject
        )
      } catch (e: any) {
        debugAddon('getMqttLoginFromHassio: failed to read MQTT login data from Hassio ' + e.message)
        reject(e)
      }
    })
  }

  async getMqttConnectOptions(): Promise<ImqttClient> {
    const config = Config.getConfiguration()

    if (config.mqttusehassio) {
      return await this.getMqttLoginFromHassio()
    }

    // Manual MQTT configuration
    Config.updateMqttTlsConfig(config)

    if (!Config.config.mqttconnect.mqttserverurl) {
      throw new Error('Configuration problem: no mqttserverurl defined')
    }
    if (!Config.config.mqttconnect.username) {
      throw new Error('Configuration problem: no mqttuser defined')
    }
    if (!Config.config.mqttconnect.password) {
      throw new Error('Configuration problem: no mqttpassword defined')
    }

    return Config.config.mqttconnect
  }
  static isMqttConfigured(mqttClient: ImqttClient): boolean {
    return mqttClient != undefined && mqttClient.mqttserverurl != undefined
  }
  async readYamlAsync(): Promise<void> {
    try {
      if (!Config.configDir || Config.configDir.length == 0) {
        log.log(LogLevelEnum.error, 'configDir not defined in command line')
      }
      if (!fs.existsSync(Config.configDir)) {
        log.log(LogLevelEnum.info, 'configuration directory  not found ' + process.cwd() + '/' + Config.configDir)
        Config.config = structuredClone(Config.newConfig)
        return
      }
      debug('configDir: ' + Config.configDir + ' ' + process.argv.length)

      const yamlFile = Config.getConfigPath()

      if (!fs.existsSync(yamlFile)) {
        log.log(LogLevelEnum.info, 'configuration file  not found ' + yamlFile)
        Config.config = structuredClone(Config.newConfig)
      } else {
        const secretsFile = join(Config.getLocalDir(), 'secrets.yaml')
        let src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' })
        if (fs.existsSync(secretsFile)) {
          let matches: IterableIterator<RegExpMatchArray>
          const secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' }))
          let srcLines = src.split('\n')
          src = ''
          srcLines.forEach((line) => {
            const r1 = /\"*!secret ([a-zA-Z0-9-_]*)\"*/g
            matches = line.matchAll(r1)
            let skipLine = false
            for (const match of matches) {
              let key = match[1]
              if (secrets[key] && secrets[key].length) {
                line = line.replace(match[0], '"' + secrets[key] + '"')
              } else {
                skipLine = true
                if (!secrets[key]) debug('no entry in secrets file for ' + key + ' line will be ignored')
                else debug('secrets file entry contains !secret for ' + key + ' line will be ignored')
              }
            }
            if (!skipLine) src = src.concat(line, '\n')
          })
        }
        Config.config = parse(src)
        if (Config.config.debugComponents && Config.config.debugComponents.length) Debug.enable(Config.config.debugComponents)

        if (Config.configDir.length == 0) log.log(LogLevelEnum.error, 'configDir not set')
      }
      if (!Config.config || !Config.config.mqttconnect || !Config.isMqttConfigured(Config.config.mqttconnect)) {
        try {
          const mqttLoginData = await this.getMqttConnectOptions()
          Config.mqttHassioLoginData = mqttLoginData
        } catch (reason) {
          log.log(LogLevelEnum.error, 'Unable to connect to mqtt ' + reason)
          Config.config.mqttusehassio = false
          // This should not stop the application
        }
      }
    } catch (error: any) {
      log.log(LogLevelEnum.error, 'readyaml failed: ' + error.message)
      throw error
    }
  }
  // set the base file for relative includes
  readYaml(): void {
    this.readYamlAsync
      .bind(this)()
      .then(() => {})
      .catch((reason) => {
        log.log(LogLevelEnum.error, 'readYaml failed ' + reason)
      })
  }

  writeConfiguration(config: Iconfiguration) {
    const cpConfig = structuredClone(config)
    Config.config = config
    if (cpConfig.debugComponents && cpConfig.debugComponents.length) Debug.enable(cpConfig.debugComponents)
    const secrets = {}
    if (cpConfig.mqttconnect.password) {
      ;(secrets as any)['mqttpassword'] = cpConfig.mqttconnect.password
      cpConfig.mqttconnect.password = '!secret mqttpassword'
    }
    if (cpConfig.mqttconnect.username) {
      ;(secrets as any)['mqttuser'] = cpConfig.mqttconnect.username
      cpConfig.mqttconnect.username = '!secret mqttuser'
    }
    if (cpConfig.githubPersonalToken) {
      ;(secrets as any)['githubPersonalToken'] = cpConfig.githubPersonalToken
      cpConfig.githubPersonalToken = '!secret githubPersonalToken'
    }
    if (cpConfig.username) {
      ;(secrets as any)['username'] = cpConfig.username
      cpConfig.username = '!secret username'
    }
    if (cpConfig.password) {
      ;(secrets as any)['password'] = cpConfig.password
      cpConfig.password = '!secret password'
    }
    const nonConfigs: string[] = ['mqttusehassio', 'filelocation', 'appVersion']
    nonConfigs.forEach((name: string) => {
      delete (cpConfig as any)[name]
    })
    const filename = Config.getConfigPath()
    const dir = path.dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let s = stringify(cpConfig)
    fs.writeFileSync(filename, s, { encoding: 'utf8' })
    s = stringify(secrets)
    fs.writeFileSync(this.getSecretsPath(), s, { encoding: 'utf8' })
  }
  static getConfigPath() {
    return join(Config.getLocalDir(), 'modbus2mqtt.yaml')
  }
  getSecretsPath() {
    return join(Config.getLocalDir(), 'secrets.yaml')
  }
  static setFakeModbus(newMode: boolean) {
    Config.config.fakeModbus = newMode
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }
  static async createZipFromLocal(_filename: string, r: stream.Writable): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const archive = new AdmZip()
        const dir = Config.getLocalDir()
        const files: string[] = fs.readdirSync(Config.getLocalDir(), { recursive: true }) as string[]
        files.forEach((file) => {
          const p = join(dir, file)
          if (fs.statSync(p).isFile() && file.indexOf('secrets.yaml') < 0) {
            archive.addLocalFile(p, path.dirname(file))
          }
        })
        r.write(archive.toBuffer())
        r.end(() => {
          resolve()
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}
export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  const fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl) {
    const append = rootUrl.endsWith('/') ? '' : '/'
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = '/' + join(filesUrlPrefix, specName, fn)

  return rc
}
