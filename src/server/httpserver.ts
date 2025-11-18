// Alias für typisierte Express-Requests mit Route-Parametern
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TypedParamsRequest<P = object> = ExpressRequest<P, any, any, any>
import Debug from 'debug'
import * as http from 'http'
import os from 'os'
import { Request as ExpressRequest } from 'express'
import * as express from 'express'
import { ConverterMap, filesUrlPrefix, IfileSpecification, M2mGitHub } from '../specification'
import { Config, MqttValidationResult } from './config'
import { Modbus } from './modbus'
import {
  ImodbusSpecification,
  HttpErrorsEnum,
  Ispecification,
  SpecificationStatus,
  IimportMessages,
  SpecificationFileUsage,
  IimageAndDocumentUrl,
} from '../specification.shared'
import path, { join } from 'path'
import multer from 'multer'
import { ParsedQs } from 'qs'

// Alias für typisierte Express-Requests mit Query-Parametern
type TypedQueryRequest<Q = ParsedQs> = ExpressRequest<object, object, object, Q>

import { fileStorage, zipStorage } from './httpFileUpload'
import { Bus } from './bus'
import { Subject } from 'rxjs'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '../specification'

//import { TranslationServiceClient } from '@google-cloud/translate'
import { M2mSpecification as M2mSpecification } from '../specification'
import { IUserAuthenticationStatus, IBus, Islave, apiUri, PollModes, ModbusTasks, IModbusConnection } from '../server.shared'
import { ConfigSpecification } from '../specification'
import { HttpServerBase } from './httpServerBase'
import { Writable } from 'stream'
import { ConfigBus } from './configbus'
import { MqttConnector } from './mqttconnector'
import { MqttSubscriptions } from './mqttsubscriptions'
const debug = Debug('httpserver')
const log = new Logger('httpserver')
// import cors from 'cors';
//import { IfileSpecification } from './ispecification';

interface GetRequestWithParameter extends express.Request {
  query: {
    name: string
    usecache: string
    timeout: string
    busid: string
    slaveid: string
    spec: string
    filter: string
    deviceDetection: string
    entityid: string
    language: string
    originalFilename: string
    password: string
    mqttValue: string
    forContribution: string
    showAllPublicSpecs: string
  }
}

export class HttpServer extends HttpServerBase {
  constructor(angulardir: string = '.') {
    super(angulardir)
  }

  override returnResult(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: ExpressRequest<any, any, any, any>,
    res: http.ServerResponse,
    code: HttpErrorsEnum,
    message: string,
    object: unknown = undefined
  ) {
    if (!res.headersSent)
      try {
        res.setHeader('Content-Type', ' application/json')
      } catch (e) {
        log.log(LogLevelEnum.error, JSON.stringify(e))
      }
    super.returnResult(req, res, code, message, object)
  }
  checkBusidSlaveidParameter(req: TypedQueryRequest<{ busid?: string; slaveid?: string }>): string {
    if (req.query.busid === '') return req.originalUrl + ': busid was not passed'
    if (req.query.slaveid === '') return req.originalUrl + ': slaveid was not passed'
    return ''
  }

  validateMqttConnectionResult(req: ExpressRequest, res: http.ServerResponse, valid: boolean, message: string) {
    const rc = {
      valid: valid,
      message: message,
    }
    this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
  }
  getLanguageFromQuery(req: TypedQueryRequest<{ language?: string }>): string {
    if (req.query.language == undefined) {
      throw new Error('language was not passed')
    } else return req.query.language
  }
  handleSlaveTopics(req: ExpressRequest, res: http.ServerResponse, next: () => void): void {
    const msub = MqttSubscriptions.getInstance()
    const url = req.url.substring(1)
    const slave = msub.getSlave(url)
    if (slave) {
      if (req.method == 'GET' && url.endsWith('/state/')) {
        MqttSubscriptions.readModbus(slave)?.subscribe((spec) => {
          const payload = slave!.getStatePayload(spec.entities)
          this.returnResult(req, res, HttpErrorsEnum.OK, payload)
          return
        })
      } else if (req.method == 'GET' && (url.indexOf('/set/') != -1 || url.indexOf('/set/modbus/') != -1)) {
        let idx = url.indexOf('/set/')
        let postLength = 5
        if (idx == -1) {
          idx = url.indexOf('/set/modbus/')
          postLength = 11
        }
        if (idx == -1) return next() //should not happen
        msub
          .sendEntityCommandWithPublish(slave, url, url.substring(idx + postLength))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else if (req.method == 'POST' && url.indexOf('/set/') != -1) {
        msub
          .sendCommand(slave, JSON.stringify(req.body))
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((e) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: e.message }))
          })
      } else return next()
    } else return next()
  }

  modbusCacheAvailable: boolean = false
  setModbusCacheAvailable() {
    this.modbusCacheAvailable = true
  }
  override initApp() {
    const localdir = join(ConfigSpecification.getLocalDir(), filesUrlPrefix)
    const publicdir = join(ConfigSpecification.getPublicDir(), filesUrlPrefix)
    this.app.get(/.*/, (req: ExpressRequest, res: http.ServerResponse, next) => {
      debug(req.url)
      next()
    })
    this.app.use('/' + filesUrlPrefix, express.static(localdir))
    this.app.use('/' + filesUrlPrefix, express.static(publicdir))
    this.app.use(this.handleSlaveTopics.bind(this))
    this.get(apiUri.userAuthenticationStatus, (req: express.Request, res: express.Response) => {
      debug(req.url)
      req.acceptsLanguages()
      const config = Config.getConfiguration()
      const authHeader = req.header('Authorization')
      const a: IUserAuthenticationStatus = Config.getAuthStatus()

      a.hasAuthToken = authHeader ? true : false
      a.authTokenExpired =
        authHeader != undefined && HttpServer.validateUserToken(req, undefined) == MqttValidationResult.tokenExpired

      if (a.registered && (a.hassiotoken || a.hasAuthToken || a.noAuthentication))
        a.mqttConfigured = Config.isMqttConfigured(config.mqttconnect)

      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })

    this.get(apiUri.converters, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('(/converters')
      const a = ConverterMap.getConverters()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
      return
    })
    this.get(apiUri.userLogin, (req: TypedQueryRequest<{ name?: string; password?: string }>, res: express.Response) => {
      debug('(/user/login')
      if (req.query.name && req.query.password) {
        Config.login(req.query.name, req.query.password)
          .then((result) => {
            if (result) {
              res.statusCode = 200
              const a = {
                result: 'OK',
                token: result,
              }
              this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
            } else {
              this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, '{result: "Forbidden"}')
            }
          })
          .catch((err) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, '{result: "' + err + '"}', err)
          })
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, '{result: "Invalid Parameter"}')
      }
    })

    this.post(apiUri.userRegister, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('(/user/register')
      res.statusCode = 200
      if ((req.body.username && req.body.password) || req.body.noAuthentication) {
        Config.register(req.body.username, req.body.password, req.body.noAuthentication)
          .then(() => {
            this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
          })
          .catch((err) => {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: err }))
          })
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: 'Invalid Parameter' }))
      }
    })
    this.get(
      apiUri.specsDetection,
      (
        req: TypedQueryRequest<{ busid?: string; slaveid?: string; showAllPublicSpecs?: string; language?: string }>,
        res: http.ServerResponse
      ) => {
        debug(req.url)
        const msg = this.checkBusidSlaveidParameter(req)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        } else {
          const slaveId = Number.parseInt(req.query.slaveid!)
          const busid = Number.parseInt(req.query.busid!)
          try {
            const language = this.getLanguageFromQuery(req)
            const bus = Bus.getBus(busid)
            if (bus) {
              bus
                .getAvailableSpecs(slaveId, req.query.showAllPublicSpecs != undefined, language)
                .then((result) => {
                  debug('getAvailableSpecs  succeeded ' + slaveId)
                  this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
                })
                .catch((e) => {
                  this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'specsDetection: ' + e.message)
                })
            }
          } catch (e: unknown) {
            this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specsDetection ' + (e as Error).message)
          }
        }
      }
    )

    this.get(apiUri.sslFiles, (req: ExpressRequest, res: http.ServerResponse) => {
      if (Config.sslDir && Config.sslDir.length) {
        const result = fs.readdirSync(Config.sslDir)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.specfication, (req: TypedQueryRequest<{ spec?: string }>, res: http.ServerResponse) => {
      const spec = req.query.spec
      if (spec && spec.length > 0) {
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ConfigSpecification.getSpecificationByFilename(spec)))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrNotFound, 'not found')
      }
    })

    this.get(apiUri.nextCheck, (req: TypedQueryRequest<{ spec?: string }>, res: http.ServerResponse) => {
      debug(req.url)
      if (req.query.spec !== undefined) {
        const nc = M2mSpecification.getNextCheck(req.query.spec)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(nc))
      }
    })
    this.post(apiUri.nextCheck, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      this.returnResult(req, res, HttpErrorsEnum.OK, 'OK')
    })
    this.get(apiUri.specifications, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      const rc: ImodbusSpecification[] = []
      new ConfigSpecification().filterAllSpecifications((spec) => {
        rc.push(M2mSpecification.fileToModbusSpecification(spec))
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
    })
    this.get(apiUri.specificationFetchPublic, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      let ghToken = Config.getConfiguration().githubPersonalToken
      ghToken = ghToken == undefined ? '' : ghToken
      new M2mGitHub(ghToken, ConfigSpecification.getPublicDir()).fetchPublicFiles()
      new ConfigSpecification().readYaml()
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: 'OK' }))
    })

    this.get(apiUri.busses, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.originalUrl)
      const busses = Bus.getBusses()
      const ibs: IBus[] = []
      busses.forEach((bus) => {
        ibs.push(bus.properties)
      })
      this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ibs))
    })
    this.get(apiUri.bus, (req: TypedQueryRequest<{ busid?: string }>, res: http.ServerResponse) => {
      debug(req.originalUrl)
      res.statusCode = 200
      if (req.query.busid && req.query.busid.length) {
        const bus = Bus.getBus(Number.parseInt(req.query.busid))
        if (bus && bus.properties) {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(bus.properties))
          return
        }
      }
      this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'invalid Parameter')
    })

    this.get(apiUri.slaves, (req: TypedQueryRequest<{ busid?: string }>, res: http.ServerResponse) => {
      const invParam = () => {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
        return
      }
      if (req.query.busid !== undefined) {
        const busid = Number.parseInt(req.query.busid)
        const bus = Bus.getBus(busid)
        if (bus) {
          const slaves = bus.getSlaves()
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slaves))
          return
        } else invParam()
      } else invParam()
    })
    this.get(apiUri.slave, (req: TypedQueryRequest<{ busid?: string; slaveid?: string }>, res: http.ServerResponse) => {
      if (req.query.busid !== undefined && req.query.slaveid !== undefined) {
        const busid = Number.parseInt(req.query.busid)
        const slaveid = Number.parseInt(req.query.slaveid)
        const slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid)
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slave))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'Invalid parameter')
      }
    })

    this.get(apiUri.configuration, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('configuration')
      try {
        const config = Config.getConfiguration()
        if (Config.getAuthStatus().hassiotoken) config.rootUrl = 'http://' + os.hostname() + ':' + config.httpport + '/'
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(config))
      } catch (e) {
        log.log(LogLevelEnum.error, 'Error getConfiguration: ' + JSON.stringify(e))
        this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify(e))
      }
    })
    this.get(
      apiUri.modbusSpecification,
      (
        req: TypedQueryRequest<{ busid?: string; slaveid?: string; spec?: string; deviceDetection?: boolean }>,
        res: http.ServerResponse
      ) => {
        debug(req.url)
        debug('get specification with modbus data for slave ' + req.query.slaveid)
        const msg = this.checkBusidSlaveidParameter(req)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
          return
        }
        const bus = Bus.getBus(Number.parseInt(req.query.busid!))
        if (bus === undefined) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + req.query.busid)
          return
        }
        let modbusTask = ModbusTasks.specification
        if (req.query.deviceDetection) modbusTask = ModbusTasks.deviceDetection
        const slave = bus.getSlaveBySlaveId(Number.parseInt(req.query.slaveid!))
        if (slave == undefined) {
          this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify('invalid slaveid '))
          return
        }
        Modbus.getModbusSpecification(modbusTask, bus.getModbusAPI(), slave, req.query.spec, (e: unknown) => {
          log.log(LogLevelEnum.error, 'http: get /specification ' + (e as Error).message)
          this.returnResult(
            req,
            res,
            HttpErrorsEnum.SrvErrInternalServerError,
            JSON.stringify('read specification ' + (e as Error).message)
          )
        }).subscribe((result) => {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
        })
      }
    )
    this.get(apiUri.download, (req: TypedParamsRequest<{ what?: string }>, res: http.ServerResponse) => {
      debug(req.url)
      let downloadMethod: (filename: string, r: Writable) => Promise<void>
      let filename = 'local.zip'
      if (req.params && req.params['what'] && req.params.what == 'local') downloadMethod = Config.createZipFromLocal
      else {
        filename = req.params.what + '.zip'
        downloadMethod = (file: string, r: Writable) => {
          return new Promise<void>((resolve, reject) => {
            try {
              ConfigSpecification.createZipFromSpecification(file, r)
              resolve()
            } catch (e: unknown) {
              reject(e)
            }
          })
        }
      }
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-disposition', 'attachment; filename=' + filename)
      // Tell the browser that this is a zip file.
      if (req.params && req.params.what)
        downloadMethod(req.params.what, res)
          .then(() => {
            super.returnResult(req, res, HttpErrorsEnum.OK, undefined)
          })
          .catch((e) => {
            this.returnResult(
              req,
              res,
              HttpErrorsEnum.SrvErrInternalServerError,
              JSON.stringify('download Zip ' + req.params.what + e.message)
            )
          })
    })
    this.post(
      apiUri.specficationContribute,
      (req: ExpressRequest<object, object, { note: string }, { spec?: string }>, res: http.ServerResponse) => {
        if (!req.query.spec) {
          this.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, 'specification name not passed')
          return
        }
        const spec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
        const client = new M2mSpecification(spec as Ispecification)
        if (spec && spec.status && ![SpecificationStatus.contributed, SpecificationStatus.published].includes(spec.status)) {
          client
            .contribute(req.body.note)
            .then((response) => {
              // poll status updates of pull request
              M2mSpecification.startPolling(spec!.filename, (e) => {
                log.log(LogLevelEnum.error, e.message)
              })?.subscribe((pullRequest) => {
                if (pullRequest.merged) log.log(LogLevelEnum.info, 'Merged ' + pullRequest.pullNumber)
                else if (pullRequest.closed) log.log(LogLevelEnum.info, 'Closed ' + pullRequest.pullNumber)
                else debug('Polled pullrequest ' + pullRequest.pullNumber)

                if (pullRequest.merged || pullRequest.closed)
                  this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(response))
              })
            })
            .catch((err) => {
              res.statusCode = HttpErrorsEnum.ErrNotAcceptable
              if (err.message) res.end(JSON.stringify(err.message))
              else res.end(JSON.stringify(err))
              log.log(LogLevelEnum.error, JSON.stringify(err))
            })
        } else if (spec && spec.status && spec.status == SpecificationStatus.contributed) {
          M2mSpecification.startPolling(spec.filename, (e) => {
            log.log(LogLevelEnum.error, e.message)
          })
          this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'Specification is already contributed')
        }
      }
    )

    this.post(apiUri.translate, (req: ExpressRequest, res: http.ServerResponse) => {
      // let client = new TranslationServiceClient()
      // client
      //   .translateText(req.body)
      //   .then((response) => {
      //     let rc: string[] = []
      //     if (response[0].translations) {
      //       response[0].translations.forEach((translation) => {
      //         if (translation.translatedText) rc.push(translation.translatedText)
      //       })
      //       this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
      //     }
      //   })
      //   .catch((err: any) => {
      //     res.statusCode = HttpErrorsEnum.ErrNotAcceptable
      //     res.end(JSON.stringify(err.message))
      //     log.log(LogLevelEnum.error, JSON.stringify(err.message))
      //   })
      res.statusCode = HttpErrorsEnum.ErrNotAcceptable
      res.end('Google Translate not implemented')
      log.log(LogLevelEnum.error, 'Google Translate not implemented')
    })

    this.post(apiUri.validateMqtt, (req: ExpressRequest, res: http.ServerResponse) => {
      debug(req.url)
      const config = req.body

      Config.updateMqttTlsConfig(config)
      try {
        if (config.mqttconnect == undefined) {
          this.validateMqttConnectionResult(req, res, false, 'No parameters configured')
          return
        }
        const mqttdiscover = MqttConnector.getInstance()
        const client = req.body.mqttconnect.mqttserverurl ? req.body.mqttconnect : undefined

        mqttdiscover.validateConnection(client, (valid, message) => {
          this.validateMqttConnectionResult(req, res, valid, message)
        })
      } catch (err) {
        log.log(LogLevelEnum.error, err)
      }
    })

    this.post(apiUri.configuration, (req: ExpressRequest, res: http.ServerResponse) => {
      debug('POST: ' + req.url)
      let config = Config.getConfiguration()
      new Config().writeConfiguration(req.body)
      config = Config.getConfiguration()
      ConfigSpecification.setMqttdiscoverylanguage(config.mqttdiscoverylanguage, config.githubPersonalToken)
      this.returnResult(req, res, HttpErrorsEnum.OkNoContent, JSON.stringify(config))
    })
    this.post(
      apiUri.bus,
      (req: ExpressRequest<object, object, IModbusConnection, { busid?: string }>, res: http.ServerResponse) => {
        debug('POST: ' + req.url)

        if (req.query.busid != undefined) {
          const bus = Bus.getBus(parseInt(req.query.busid))
          if (bus)
            bus
              .updateBus(req.body)
              .then((bus) => {
                this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
              })
              .catch((e) => {
                this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'Bus: ' + e.message)
              })
        } else
          Bus.addBus(req.body)
            .then((bus) => {
              this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify({ busid: bus.properties.busId }))
            })
            .catch((e) => {
              this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e.message)
            })
      }
    )

    this.post(
      apiUri.modbusEntity,
      (
        req: ExpressRequest<object, object, IfileSpecification, { busid?: string; slaveid?: string; entityid?: string }>,
        res: http.ServerResponse
      ) => {
        debug(req.url)
        const msg = this.checkBusidSlaveidParameter(req)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
          return
        } else {
          const bus = Bus.getBus(Number.parseInt(req.query.busid!))!
          const entityid = req.query.entityid ? parseInt(req.query.entityid) : undefined
          const sub = new Subject<ImodbusSpecification>()
          const subscription = sub.subscribe((result) => {
            subscription.unsubscribe()
            const ent = result.entities.find((e) => e.id == entityid)
            if (ent) {
              this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(ent))
              return
            } else {
              this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
              return
            }
          })
          Modbus.getModbusSpecificationFromData(
            ModbusTasks.entity,
            bus.getModbusAPI(),
            Number.parseInt(req.query.slaveid!),
            req.body,
            sub
          )
        }
      }
    )
    this.post(
      apiUri.writeEntity,
      (
        req: ExpressRequest<
          object,
          object,
          Ispecification,
          { busid?: string; slaveid?: string; entityid?: string; mqttValue?: string }
        >,
        res: http.ServerResponse
      ) => {
        debug(req.url)
        const msg = this.checkBusidSlaveidParameter(req)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
          return
        } else {
          const bus = Bus.getBus(Number.parseInt(req.query.busid!))!
          const mqttValue = req.query.mqttValue
          const entityid = req.query.entityid ? parseInt(req.query.entityid) : undefined
          if (entityid && mqttValue && req.query.slaveid != undefined)
            Modbus.writeEntityMqtt(bus.getModbusAPI(), Number.parseInt(req.query.slaveid!), req.body, entityid, mqttValue)
              .then(() => {
                this.returnResult(req, res, HttpErrorsEnum.OkCreated, '')
              })
              .catch((e) => {
                this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e)
              })
          else this.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, 'No entity found in specfication')
        }
      }
    )
    this.get(apiUri.serialDevices, (req: TypedQueryRequest<{ busid?: string; slaveid?: string }>, res: http.ServerResponse) => {
      debug(req.url)

      ConfigBus.listDevices(
        (devices) => {
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(devices))
        },
        () => {
          // Log the error, but return empty array
          //log.log(LogLevelEnum.info, 'listDevices: ' + error.message)
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify([]), {})
        }
      )
    })

    this.post(
      apiUri.specfication,
      (
        req: ExpressRequest<object, object, ImodbusSpecification, { busid?: string; slaveid?: string; originalFilename?: string }>,
        res: http.ServerResponse
      ) => {
        debug('POST /specification: ' + req.query.busid + '/' + req.query.slaveid)
        const rd = new ConfigSpecification()
        const msg = this.checkBusidSlaveidParameter(req)
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "{message: '" + msg + "'}")
          return
        }
        const bus: Bus | undefined = Bus.getBus(Number.parseInt(req.query.busid!))
        const slave: Islave | undefined = bus ? bus.getSlaveBySlaveId(Number.parseInt(req.query.slaveid!)) : undefined

        const originalFilename: string | null = req.query.originalFilename ? req.query.originalFilename : null
        const rc = rd.writeSpecification(
          req.body,
          (filename: string) => {
            if (bus != undefined && slave != undefined) {
              slave.specificationid = filename
              ConfigBus.writeslave(bus.getId(), slave)
            }
          },
          originalFilename
        )

        // bus
        //   ?.getAvailableSpecs(Number.parseInt(req.query.slaveid), false)
        //   .then(() => {
        //     debug('Cache updated')
        //   })
        //   .catch((e) => {
        //     debug('getAvailableModbusData failed:' + e.message)
        //   })

        this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
      }
    )
    this.post(
      apiUri.specificationValidate,
      (req: ExpressRequest<object, object, Ispecification, { language?: string }>, res: http.ServerResponse) => {
        if (!req.query.language || req.query.language.length == 0) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
          return
        }
        const spec = new M2mSpecification(req.body)
        const messages = spec.validate(req.query.language)
        this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
      }
    )

    this.get(
      apiUri.specificationValidate,
      (req: TypedQueryRequest<{ language?: string; spec?: string }>, res: http.ServerResponse) => {
        if (!req.query.language || req.query.language.length == 0) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass language '))
          return
        }
        if (!req.query.spec || req.query.spec.length == 0) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('pass specification '))
          return
        }
        const fspec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
        if (!fspec) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('specification not found ' + req.query.spec))
          return
        }
        const spec = new M2mSpecification(fspec)
        const messages = spec.validate(req.query.language)
        this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages))
      }
    )
    this.post(
      apiUri.slave,
      (req: ExpressRequest<object, object, Islave, { busid?: string; slaveid?: string }>, res: http.ServerResponse) => {
        debug('POST /slave: ' + JSON.stringify(req.body))
        const msg = this.checkBusidSlaveidParameter(req)
        const bus = Bus.getBus(Number.parseInt(req.query.busid!))
        if (msg !== '') {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + req.query.busid)
          return
        }
        if (req.body.slaveid == undefined) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus Id: ' + req.query.busid + ' Slave Id is not defined')
          return
        }

        res.setHeader('charset', 'utf-8')
        res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-access-token')
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Content-Type', 'application/json')
        if (bus === undefined) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Bus not found. Id: ' + req.query.busid)
          return
        }
        const rc: Islave = bus.writeSlave(req.body)
        this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc))
      }
    )
    this.post(
      apiUri.addFilesUrl,
      (
        req: ExpressRequest<object, object, IimageAndDocumentUrl, { specification?: string; usage?: string }>,
        res: http.ServerResponse
      ) => {
        try {
          if (req.query.specification) {
            if (req.body) {
              // req.body.documents
              const config = new ConfigSpecification()
              config.appendSpecificationUrls(req.query.specification!, [req.body]).then((files) => {
                if (files) this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files))
                else this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification not found')
              })
            } else {
              this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification not found')
            }
          } else {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, ' specification no passed')
          }
        } catch (e: unknown) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Adding URL failed: ' + (e as Error).message, e)
        }
      }
    )

    const upload = multer({ storage: fileStorage })
    this.app.post(
      apiUri.upload,
      upload.array('documents'),
      (
        req: TypedQueryRequest<{ specification?: string; usage?: string; busid?: string; slaveid?: string }>,
        res: http.ServerResponse
      ) => {
        try {
          if (!req.query.usage) {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No Usage passed')
            return
          }

          const msg = this.checkBusidSlaveidParameter(req as GetRequestWithParameter)
          if (msg !== '') {
            this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
            return
          } else {
            debug('Files uploaded')
            if (req.files) {
              // req.body.documents
              const config = new ConfigSpecification()
              const f: string[] = []
              ;(req.files as Express.Multer.File[])!.forEach((f0) => {
                f.push(f0.originalname)
              })
              if (req.query.usage === undefined) {
                this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No Usage passed')
              }
              config
                .appendSpecificationFiles(req.query.specification!, f, req.query.usage! as SpecificationFileUsage)
                .then((files) => {
                  if (files) this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files))
                  else this.returnResult(req, res, HttpErrorsEnum.OkNoContent, ' specification not found or no files passed')
                })
            } else {
              this.returnResult(req, res, HttpErrorsEnum.OkNoContent, ' specification not found or no files passed')
            }
          }
        } catch (e: unknown) {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Upload failed: ' + (e as Error).message, e)
        }
      }
    )
    this.app.post(
      apiUri.uploadSpec,
      multer({ storage: zipStorage }).array('zips'),
      (req: ExpressRequest, res: http.ServerResponse) => {
        if (req.files) {
          // req.body.documents

          ;(req.files as Express.Multer.File[])!.forEach((f) => {
            try {
              const zipfilename = join(f.destination, f.filename)
              const errors = ConfigSpecification.importSpecificationZip(zipfilename)
              fs.rmdirSync(path.dirname(zipfilename), { recursive: true })

              if (errors.errors.length > 0)
                this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Import failed: ' + errors.errors, errors)
              else this.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(errors))
            } catch (e: unknown) {
              const errors: IimportMessages = { errors: 'Import error: ' + (e as Error).message, warnings: '' }
              this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, errors.errors, errors)
            }
          })
        } else {
          this.returnResult(req, res, HttpErrorsEnum.ErrNotAcceptable, 'No or incorrect files passed')
        }
      }
    )

    this.delete(
      apiUri.upload,
      (req: TypedQueryRequest<{ specification?: string; url?: string; usage?: string }>, res: http.ServerResponse) => {
        if (req.query.specification && req.query.url && req.query.usage) {
          const files = ConfigSpecification.deleteSpecificationFile(
            req.query.specification,
            req.query.url,
            req.query.usage as SpecificationFileUsage
          )
          this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(files))
        } else {
          this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'Invalid Usage')
        }
      }
    )
    this.delete(apiUri.newSpecificationfiles, (req: ExpressRequest, res: http.ServerResponse) => {
      try {
        new ConfigSpecification().deleteNewSpecificationFiles()
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify('OK'))
      } catch (err: unknown) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'deletion failed: ' + (err as Error).message, err)
      }
    })
    // app.post('/specification',  ( req:express.TypedRequestBody<IfileSpecification>) =>{
    //         debug( req.body.name);
    //    });
    this.delete(apiUri.specfication, (req: TypedQueryRequest<{ spec?: string }>, res: http.ServerResponse) => {
      debug('DELETE /specification: ' + req.query.spec)
      const rd = new ConfigSpecification()
      if (req.query.spec) {
        const rc = rd.deleteSpecification(req.query.spec)
        Bus.getBusses().forEach((bus) => {
          bus.getSlaves().forEach((slave) => {
            if (slave.specificationid == req.query.spec) {
              delete slave.specificationid
              if (slave.pollMode == undefined) slave.pollMode = PollModes.intervall
              bus.writeSlave(slave)
            }
          })
        })
        this.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No specification passed')
      }
    })
    this.delete(apiUri.bus, (req: TypedQueryRequest<{ busid?: string }>, res: http.ServerResponse) => {
      debug('DELETE /busses: ' + req.query.busid)
      if (!req.query.busid) {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, 'No busid passed')
        return
      }
      Bus.deleteBus(Number.parseInt(req.query.busid))
      this.returnResult(req, res, HttpErrorsEnum.OK, '')
    })

    this.delete(apiUri.slave, (req: TypedQueryRequest<{ slaveid?: string; busid?: string }>, res: http.ServerResponse) => {
      debug('Delete /slave: ' + req.query.slaveid)
      const msg = this.checkBusidSlaveidParameter(req)
      if (msg !== '') {
        this.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg)
        return
      }
      if (req.query.slaveid!.length > 0 && req.query.busid!.length > 0) {
        const bus = Bus.getBus(Number.parseInt(req.query.busid!))
        if (bus) bus.deleteSlave(Number.parseInt(req.query.slaveid!))
        this.returnResult(req, res, HttpErrorsEnum.OK, '')
      }
    })
  }
}
