import Debug from 'debug'
import { parse, stringify } from 'yaml'
import * as fs from 'fs'
import { MqttDiscover } from './mqttdiscover'
import * as path from 'path'
import { join } from 'path'
import stream from 'stream'
import { Observable, Subject } from 'rxjs'
import { BUS_TIMEOUT_DEFAULT, getBaseFilename, IbaseSpecification } from '@modbus2mqtt/specification.shared'
import { sign, verify } from 'jsonwebtoken'
import * as bcrypt from 'bcryptjs'
import * as http from 'http'
import { ConfigSpecification, LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { SerialPort } from 'serialport'
import {
  ImqttClient,
  AuthenticationErrors,
  IBus,
  Iconfiguration,
  IModbusConnection,
  Islave,
  PollModes,
} from '@modbus2mqtt/server.shared'
import AdmZip from 'adm-zip'

const CONFIG_VERSION = '0.1'
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      HASSIO_TOKEN: string
    }
  }
}
const DEFAULT_MQTT_CONNECT_TIMEOUT = 60 * 1000
const HASSIO_TIMEOUT = 300
export enum MqttValidationResult {
  OK = 0,
  tokenExpired = 1,
  error = 2,
}
const log = new Logger('config')
const secretsLength = 256
const debug = Debug('config')
const debugAddon = Debug('config.addon')
const saltRounds = 8
const defaultTokenExpiryTime = 1000 * 60 * 60 * 24 // One day
//TODO const defaultTokenExpiryTime = 1000 * 20 // three seconds for testing
export const filesUrlPrefix = 'specifications/files'
//const baseTopic = 'modbus2mqtt';
//const baseTopicHomeAssistant = 'homeassistant';
export class Config {
  static tokenExpiryTime: number = defaultTokenExpiryTime
  static mqttHassioLoginData: ImqttClient | undefined = undefined
  static login(name: string, password: string): Promise<string> {
    let rc = new Promise<string>((resolve, reject) => {
      if (Config.config.noAuthentication) {
        log.log(LogLevelEnum.error, 'Login called, but noAuthentication is configured')
        reject(AuthenticationErrors.InvalidParameters)
        return
      }

      if (Config.config && Config.config.username && Config.config.password) {
        // Login
        if (name === Config.config.username)
          bcrypt
            .compare(password, Config.config.password)
            .then((success) => {
              if (success) {
                try {
                  //const iat = Math.floor(Date.now() / 1000)
                  //const exp = iat + Config.config.tokenExpiryTimeInMSec // seconds
                  let s = sign({ password: password }, Config.secret, {
                    expiresIn: Config.tokenExpiryTime + 'ms',
                    algorithm: 'HS256',
                  })
                  resolve(s)
                } catch (err) {
                  log.log(LogLevelEnum.error, err)
                  reject(AuthenticationErrors.SignError)
                }
              } else reject(AuthenticationErrors.InvalidUserPasswordCombination)
            })
            .catch((err) => {
              log.log(LogLevelEnum.error, 'login: compare failed: ' + err)
              reject(AuthenticationErrors.InvalidParameters)
            })
        else {
          log.log(LogLevelEnum.error, 'login: Username was not set')
          reject(AuthenticationErrors.InvalidParameters)
        }
      }
    })
    return rc
  }
  static register(name: string | undefined, password: string | undefined, noAuthentication: boolean): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (noAuthentication == true) {
        Config.config.noAuthentication = true
        new Config().writeConfiguration(Config.config)
        resolve()
      } else if (Config.config && password) {
        // Login
        //No username and password configured.: Register login
        bcrypt
          .hash(password, saltRounds)
          .then((enc) => {
            Config.config.password = enc
            Config.config.username = name
            new Config().writeConfiguration(Config.config)
            resolve()
          })
          .catch((err) => {
            reject(err)
          })
      } else reject(AuthenticationErrors.InvalidParameters)
    })
    return rc
  }
  static validateUserToken(token: string | undefined): MqttValidationResult {
    if (this.config.noAuthentication) return MqttValidationResult.OK
    if (token == undefined) return MqttValidationResult.error
    try {
      let v: any = verify(token, Config.secret, { complete: true })
      v = verify(token, Config.secret, {
        complete: true,
        ignoreExpiration: false,
      })
      if (bcrypt.compareSync(v.payload.password, Config.config.password!)) return MqttValidationResult.OK
      else return MqttValidationResult.error
    } catch (err) {
      if ((err as any).name && (err as any).name == 'TokenExpiredError') return MqttValidationResult.tokenExpired
      log.log(LogLevelEnum.error, 'Validate: ' + err)
      return MqttValidationResult.error
    }
  }

  static getPublicDir(): string {
    return join(Config.yamlDir, 'public')
  }
  static getLocalDir(): string {
    return join(Config.yamlDir, 'local')
  }

  //@ts-ignore
  private static config: Iconfiguration
  private static secret: string
  private static specificationsChanged = new Subject<string>()
  private static bussesChanged = new Subject<void>()
  private static busses: IBus[]
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

  static yamlDir: string = ''
  static sslDir: string = ''

  static getBussesProperties(): IBus[] {
    return Config.busses
  }
  static getSpecificationsChangedObservable(): Observable<string> {
    return Config.specificationsChanged
  }
  static getBussesChangedObservable(): Observable<void> {
    return Config.bussesChanged
  }
  static getSecret(pathStr: string): string {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const charactersLength = characters.length
    let counter = 0
    if (fs.existsSync(pathStr)) return fs.readFileSync(pathStr, { encoding: 'utf8' }).toString()
    debug('getSecret: Create secrets file at' + pathStr)
    while (counter < secretsLength) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength))
      counter += 1
    }
    let dir = path.dirname(pathStr)
    debug('Config.getSecret: write Secretfile to ' + pathStr)
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(pathStr, result, { encoding: 'utf8' })
    debug('Config.getSecret: write successful')

    return result
  }
  static addBusProperties(connection: IModbusConnection): IBus {
    let maxBusId = -1
    Config.busses.forEach((b) => {
      if (b.busId > maxBusId) maxBusId = b.busId
    })
    maxBusId++
    let busArrayIndex =
      Config.busses.push({
        busId: maxBusId,
        connectionData: connection,
        slaves: [],
      }) - 1
    let busDir = Config.yamlDir + '/local/busses/bus.' + maxBusId
    if (!fs.existsSync(busDir)) {
      fs.mkdirSync(busDir, { recursive: true })
      debug('creating slaves path: ' + busDir)
    }
    let src = stringify(connection)
    fs.writeFileSync(join(busDir, 'bus.yaml'), src, { encoding: 'utf8' })
    Config.bussesChanged.next()
    return Config.busses[busArrayIndex]
  }
  static updateBusProperties(bus: IBus, connection: IModbusConnection): IBus {
    bus.connectionData = connection
    let busDir = Config.yamlDir + '/local/busses/bus.' + bus.busId
    if (!fs.existsSync(busDir)) {
      fs.mkdirSync(busDir, { recursive: true })
      debug('creating slaves path: ' + busDir)
    }
    let src = stringify(connection)
    fs.writeFileSync(join(busDir, 'bus.yaml'), src, { encoding: 'utf8' })
    Config.bussesChanged.next()
    return bus
  }
  static deleteBusProperties(busid: number) {
    let idx = Config.busses.findIndex((b) => b.busId == busid)
    if (idx >= 0) {
      let busDir = Config.yamlDir + '/local/busses/bus.' + busid
      Config.busses.splice(idx, 1)
      fs.rmSync(busDir, { recursive: true })
      let mqd = this.getMqttDiscover()
      mqd.deleteBus(busid)
      Config.bussesChanged.next()
    }
  }

  static getConfiguration(): Iconfiguration {
    if (Config.secret == undefined) {
      var secretsfile = Config.sslDir.length > 0 ? join(Config.sslDir, 'secrets.txt') : 'secrets.txt'
      var sslDir = path.parse(secretsfile).dir
      if (sslDir.length && !fs.existsSync(sslDir)) fs.mkdirSync(sslDir, { recursive: true })
      try {
        if (fs.existsSync(secretsfile)) {
          debug('secretsfile ' + 'secretsfile exists')
          fs.accessSync(secretsfile, fs.constants.W_OK)
        } else fs.accessSync(sslDir, fs.constants.W_OK)
        debug('Config.getConfiguration: secretsfile permissions are OK ' + secretsfile)
        Config.secret = Config.getSecret(secretsfile)
      } catch (err) {
        let msg =
          'Secrets file ' +
          secretsfile +
          ' or parent directory is not writable! No registration possible!(cwd: ' +
          process.cwd() +
          ')'
        log.log(LogLevelEnum.error, msg)

        debug('secretsfile=' + secretsfile + ' ssldir = ' + Config.sslDir)
        throw new Error(msg)
      }
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
      Config.config.mqttconnect.clean = Config.config.mqttconnect.clean ? Config.config.mqttconnect.clean : true
      Config.config.httpport = Config.config.httpport ? Config.config.httpport : 3000
      Config.config.fakeModbus = Config.config.fakeModbus ? Config.config.fakeModbus : false
      Config.config.noAuthentication = Config.config.noAuthentication ? Config.config.noAuthentication : false
      Config.config.filelocation = Config.config.filelocation ? Config.config.filelocation : Config.yamlDir
      Config.busses = Config.busses && Config.busses.length > 0 ? Config.busses : []
      Config.config.hassiotoken = process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length ? process.env.HASSIO_TOKEN : undefined
      Config.config.mqttusehassio =
        Config.config.mqttusehassio && Config.config.hassiotoken
          ? Config.config.mqttusehassio
          : Config.config.hassiotoken != undefined && Config.config.hassiotoken.length > 0
      Config.config.supervisor_host = Config.config.supervisor_host?Config.config.supervisor_host:'supervisor'
    } else {
      log.log(LogLevelEnum.notice, 'No config file found ')
      Config.config = structuredClone(Config.newConfig)
      Config.busses = []
    }
    return structuredClone(Config.config)
  }

  async readGetResponse(res: http.IncomingMessage): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      let lbuffers: Uint8Array[] = []
      res.on('data', (chunk) => lbuffers.push(chunk))
      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode < 299) {
            let lbuffer = Buffer.concat(lbuffers)
            let json = JSON.parse(lbuffer.toString())
            resolve(json)
          } else {
            // http Error
            reject(lbuffers)
          }
        } catch (e: any) {
          reject(e)
        }
      })
    })
  }
  listDevicesUdev(next: (devices: string[]) => void, reject: (error: any) => void): void {
    SerialPort.list()
      .then((portInfo) => {
        let devices: string[] = []
        portInfo.forEach((port) => {
          devices.push(port.path)
        })
        next(devices)
      })
      .catch((error) => {
        reject(error)
      })
  }

  listDevices(next: (devices: string[]) => void, reject: (error: any) => void): void {
    try {
      this.listDevicesHassio(next, (_e) => {
        this.listDevicesUdev(next, reject)
      })
    } catch (e) {
      try {
        this.listDevicesUdev(next, reject)
      } catch (e) {
        next([])
      }
    }
  }
  static executeHassioGetRequest<T>(url: string, next: (_dev: T) => void, reject: (error: any) => void): void {
    let hassiotoken: string | undefined = Config.getConfiguration().hassiotoken
    if (!hassiotoken || hassiotoken.length == 0) throw new Error('ENV: HASSIO_TOKEN not defined')

    const timer = setTimeout(() => {
      reject(new Error('TIMEOUT(' + HASSIO_TIMEOUT + 'ms)'))
    }, HASSIO_TIMEOUT /* ms */)

    fetch(url, {
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
              let msg = 'supervisor call ' + url + ' failed ' + JSON.stringify(reason) + ' ' + res.headers.get('content-type')
              log.log(LogLevelEnum.error, msg)
              reject(new Error(msg))
            })
      })
      .catch((reason) => {
        clearTimeout(timer)
        log.log(LogLevelEnum.error, JSON.stringify(reason))
        reject(reason)
      })
  }
  listDevicesHassio(next: (devices: string[]) => void, reject: (error: any) => void): void {
    Config.executeHassioGetRequest<string[]>(
      'http://'+ Config.getConfiguration().supervisor_host + '/hardware/info',
      (dev) => {
        next(this.grepDevices(dev))
      },
      reject
    )
  }
  private grepDevices(bodyObject: any): string[] {
    var devices: any[] = bodyObject.data.devices
    var rc: string[] = []
    devices.forEach((device) => {
      if (device.subsystem === 'tty')
        try {
          fs.accessSync(device.dev_path, fs.constants.R_OK)
          rc.push(device.dev_path)
        } catch (error) {
          log.log(LogLevelEnum.error, 'Permission denied for read serial device %s', device.dev_path)
        }
    })
    return rc
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
      let fn = join(Config.sslDir, filename)
      if (fs.existsSync(fn)) return fs.readFileSync(fn, { encoding: 'utf8' }).toString()
    }
    return undefined
  }
  static updateMqttTlsConfig(config: Iconfiguration) {
    if (config && config.mqttconnect) {
      config.mqttconnect.key = this.readCertfile(config.mqttkeyFile)
      config.mqttconnect.ca = this.readCertfile(config.mqttcaFile)
      config.mqttconnect.cert = this.readCertfile(config.mqttcertFile)
    }
  }

  private async getMqttLoginFromHassio(): Promise<ImqttClient> {
    return new Promise<ImqttClient>((resolve, reject) => {
      try {
        Config.executeHassioGetRequest<{ data: ImqttClient }>(
          'http://supervisor/services/mqtt',
          (mqtt) => {
            let config = Config.getConfiguration()
            config.mqttconnect = mqtt.data
            if (
              config.mqttconnect.mqttserverurl == undefined &&
              config.mqttconnect.host != undefined &&
              config.mqttconnect.port != undefined
            )
              config.mqttconnect.mqttserverurl =
                (config.mqttconnect.ssl ? 'mqtts' : 'mqtt') + '://' + config.mqttconnect.host + ':' + config.mqttconnect.port
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
    return new Promise<ImqttClient>((resolve, reject) => {
      let config = Config.getConfiguration()
      if (config.mqttusehassio) {
        this.getMqttLoginFromHassio().then(
          (mqttFromHassio) => {
            resolve(mqttFromHassio)
          },
          (reason) => {
            reject(reason)
          }
        )
      } else {
        let config = Config.getConfiguration()
        Config.updateMqttTlsConfig(config)
        if (!Config.config.mqttconnect.mqttserverurl) reject('Configuration problem: no mqttserverurl defined')
        else if (!Config.config.mqttconnect.username) reject('Configuration problem: no mqttuser defined')
        else if (!Config.config.mqttconnect.password) reject('Configuration problem: no mqttpassword defined')
        else resolve(Config.getConfiguration().mqttconnect)
      }
    })
  }
  static isMqttConfigured(mqttClient: ImqttClient): boolean {
    return mqttClient != undefined && mqttClient.mqttserverurl != undefined
  }
  readYamlAsync(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        debugger
        if (!Config.yamlDir || Config.yamlDir.length == 0) {
          log.log(LogLevelEnum.error, 'Yamldir not defined in command line')
        }
        if (!fs.existsSync(Config.yamlDir)) {
          log.log(LogLevelEnum.notice, 'configuration directory  not found ' + process.cwd() + '/' + Config.yamlDir)
          Config.config = structuredClone(Config.newConfig)
          Config.busses = []
          resolve()
        }
        debug('yamlDir: ' + Config.yamlDir + ' ' + process.argv.length)

        var yamlFile = Config.getConfigPath()

        if (!fs.existsSync(yamlFile)) {
          log.log(LogLevelEnum.notice, 'configuration file  not found ' + yamlFile)
          Config.config = structuredClone(Config.newConfig)
        } else {
          var secretsFile = Config.yamlDir + '/local/secrets.yaml'
          var src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' })
          if (fs.existsSync(secretsFile)) {
            var matches: IterableIterator<RegExpMatchArray>
            var secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' }))
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
          if (Config.yamlDir.length  == 0) 
            log.log(LogLevelEnum.error, "yamlDir not set")
          else if(Config.config )
            Config.config.filelocation = Config.yamlDir
          else {
            log.log(LogLevelEnum.error, "config file not parsed \"" + src + "\"")
          }
            
        }
        Config.busses = []
        let busDir = Config.yamlDir + '/local/busses'
        let oneBusFound = false
        if (fs.existsSync(busDir)) {
          let busDirs: fs.Dirent[] = fs.readdirSync(busDir, {
            withFileTypes: true,
          })
          busDirs.forEach((de) => {
            if (de.isDirectory() && de.name.startsWith('bus.')) {
              let busid = Number.parseInt(de.name.substring(4))
              let busYaml = join(de.path, de.name, 'bus.yaml')
              let connectionData: IModbusConnection
              if (fs.existsSync(busYaml)) {
                var src: string = fs.readFileSync(busYaml, {
                  encoding: 'utf8',
                })
                connectionData = parse(src)
                Config.busses.push({
                  busId: busid,
                  connectionData: connectionData,
                  slaves: [],
                })
                oneBusFound = true
                let devFiles: string[] = fs.readdirSync(Config.yamlDir + '/local/busses/' + de.name)
                devFiles.forEach(function (file: string) {
                  if (file.endsWith('.yaml') && file !== 'bus.yaml') {
                    var src: string = fs.readFileSync(Config.yamlDir + '/local/busses/' + de.name + '/' + file, {
                      encoding: 'utf8',
                    })
                    var o: Islave = parse(src)
                    Config.busses[Config.busses.length - 1].slaves.push(o)
                  }
                })
              }
            }
          })
        }
        if (!oneBusFound) {
          this.listDevices(
            (devices) => {
              if (devices && devices.length) {
                let usb = devices.find((dev) => dev.toLocaleLowerCase().indexOf('usb') >= 0)
                if (usb)
                  Config.addBusProperties({
                    serialport: usb,
                    timeout: BUS_TIMEOUT_DEFAULT,
                    baudrate: 9600,
                  })
                else
                  Config.addBusProperties({
                    serialport: devices[0],
                    timeout: BUS_TIMEOUT_DEFAULT,
                    baudrate: 9600,
                  })
              } else
                Config.addBusProperties({
                  serialport: '/dev/ttyACM0',
                  timeout: BUS_TIMEOUT_DEFAULT,
                  baudrate: 9600,
                })
            },
            () => {
              Config.addBusProperties({
                serialport: '/dev/ttyACM0',
                timeout: BUS_TIMEOUT_DEFAULT,
                baudrate: 9600,
              })
            }
          )
        }

        debug('config: busses.length: ' + Config.busses.length)
        if (!Config.config || !Config.config.mqttconnect || !Config.isMqttConfigured(Config.config.mqttconnect)) {
          this.getMqttConnectOptions()
            .then((mqttLoginData) => {
              Config.mqttHassioLoginData = mqttLoginData
              resolve()
            })
            .catch((reason) => {
              log.log(LogLevelEnum.error, 'Unable to connect to mqtt ' + reason)
              Config.config.mqttusehassio = false
              // This should not stop the application
              resolve()
            })
        } else resolve()
      } catch (error: any) {
        log.log(LogLevelEnum.error, 'readyaml failed: ' + error.message)
        throw error
        // Expected output: ReferenceError: nonExistentFunction is not defined
        // (Note: the exact output may be browser-dependent)
      }
    })
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

  async filterAllslaves<T>(busid: number, specFunction: <T>(slave: Islave) => Set<T> | any): Promise<Set<T>> {
    let addresses = new Set<T>()
    for (let slave of Config.busses[busid].slaves) {
      for (let addr of specFunction(slave)) addresses.add(addr)
    }
    return addresses
  }
  static mqttDiscoverInstance: MqttDiscover | undefined
  static getMqttDiscover(): MqttDiscover {
    if (!Config.mqttDiscoverInstance)
      if (Config.config.mqttusehassio && this.mqttHassioLoginData)
        Config.mqttDiscoverInstance = new MqttDiscover(this.mqttHassioLoginData, Config.config.mqttdiscoverylanguage)
      else Config.mqttDiscoverInstance = new MqttDiscover(Config.config.mqttconnect, Config.config.mqttdiscoverylanguage)
    return Config.mqttDiscoverInstance
  }

  triggerMqttPublishSlave(busid: number, slave: Islave) {
    Config.getMqttDiscover().triggerPoll(busid, slave)
  }

  deleteSlave(busid: number, slaveid: number) {
    let bus = Config.busses.find((bus) => bus.busId == busid)
    if (bus != undefined) {
      debug('DELETE /slave slaveid' + busid + '/' + slaveid + ' number of slaves: ' + bus.slaves.length)
      let found = false
      for (let idx = 0; idx < bus.slaves.length; idx++) {
        let dev = bus.slaves[idx]

        if (dev.slaveid === slaveid) {
          found = true
          if (fs.existsSync(this.getslavePath(busid, dev)))
            fs.unlink(this.getslavePath(busid, dev), (err) => {
              if (err) debug(err)
            })
          bus.slaves.splice(idx, 1)
          let mqd = Config.getMqttDiscover()
          mqd.deleteSlave(bus.busId, slaveid)
          debug('DELETE /slave finished ' + slaveid + ' number of slaves: ' + bus.slaves.length)
          return
        }
      }
      if (!found) debug('slave not found for deletion ' + slaveid)
    } else {
      let msg = 'Unable to delete slave. Check server log for details'
      log.log(LogLevelEnum.error, msg + ' busid ' + busid + ' not found')

      throw new Error(msg)
    }
  }
  writeConfiguration(config: Iconfiguration) {
    let cpConfig = structuredClone(config)
    Config.config = config
    let secrets = {}
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
    let filename = Config.getConfigPath()
    let dir = path.dirname(filename)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let s = stringify(cpConfig)
    fs.writeFileSync(filename, s, { encoding: 'utf8' })
    s = stringify(secrets)
    fs.writeFileSync(this.getSecretsPath(), s, { encoding: 'utf8' })
  }

  writeslave(
    busid: number,
    slaveid: number,
    specification: string | undefined,
    name?: string,
    polInterval?: number,
    pollMode?: PollModes
  ): Islave {
    // Make sure slaveid is unique
    let slave: Islave = {
      slaveid: slaveid,
      specificationid: specification,
      name: name,
      polInterval: polInterval,
      pollMode: pollMode,
    }
    let oldFilePath = this.getslavePath(busid, slave)
    let filename = Config.getFileNameFromSlaveId(slave.slaveid)
    let newFilePath = this.getslavePath(busid, slave)
    let dir = path.dirname(newFilePath)
    if (!fs.existsSync(dir))
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (e) {
        debug('Unable to create directory ' + dir + ' + e')
        throw e
      }
    let s = stringify(slave)
    fs.writeFileSync(newFilePath, s, { encoding: 'utf8' })
    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath))
      fs.unlink(oldFilePath, (err: any) => {
        debug('writeslave: Unable to delete ' + oldFilePath + ' ' + err)
      })

    if (specification) {
      if (specification == '_new') new ConfigSpecification().deleteNewSpecificationFiles()
      else {
        let spec = ConfigSpecification.getSpecificationByFilename(specification)
        this.triggerMqttPublishSlave(busid, slave)
        slave.specification = spec as any as IbaseSpecification
      }
    } else debug('No Specification found for slave: ' + filename + ' specification: ' + slave.specificationid)
    return slave
  }
  getslavePath(busid: number, slave: Islave): string {
    return Config.yamlDir + '/local/busses/bus.' + busid + '/s' + slave.slaveid + '.yaml'
  }
  static getConfigPath() {
    return Config.yamlDir + '/local/modbus2mqtt.yaml'
  }
  getSecretsPath() {
    return Config.yamlDir + '/local/secrets.yaml'
  }

  static getSlave(busid: number, slaveid: number): Islave | undefined {
    if (Config.busses.length <= busid) {
      debug('Config.getslave: unknown bus')
      return undefined
    }
    let rc = Config.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveid
    })
    if (!rc) debug('slaves.length: ' + Config.busses[busid].slaves.length)
    for (let dev of Config.busses[busid].slaves) {
      debug(dev.name)
    }
    return rc
  }
  static getslaveBySlaveId(busid: number, slaveId: number) {
    let rc = Config.busses[busid].slaves.find((dev) => {
      return dev.slaveid === slaveId
    })
    return rc
  }

  static setFakeModbus(newMode: boolean) {
    Config.config.fakeModbus = newMode
  }
  static getFileNameFromSlaveId(slaveid: number): string {
    return 's' + slaveid
  }
  static createZipFromLocal(_filename: string, r: stream.Writable): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let archive = new AdmZip()
      let dir = Config.getLocalDir()
      let files: string[] = fs.readdirSync(Config.getLocalDir(), { recursive: true }) as string[]
      files.forEach((file) => {
        let p = join(dir, file)
        if (fs.statSync(p).isFile() && file.indexOf('secrets.yaml') < 0) archive.addLocalFile(p, path.dirname(file))
      })
      r.write(archive.toBuffer())
      r.end(() => {
        resolve()
      })
    })
  }
}
export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
  let fn = getBaseFilename(url)
  let rc: string = ''
  if (rootUrl) {
    let append = '/'
    if (rootUrl.endsWith('/')) append = ''
    rc = rootUrl + append + join(filesUrlPrefix, specName, fn)
  } else rc = '/' + join(filesUrlPrefix, specName, fn)

  return rc
}
