import Debug from 'debug'
import * as http from 'http'
import { NextFunction, Request } from 'express'
import * as express from 'express'
import * as bodyparser from 'body-parser'
import { Config, MqttValidationResult } from './config'
import { HttpErrorsEnum } from '@modbus2mqtt/specification.shared'
import { join, basename } from 'path'
import { parse } from 'node-html-parser'
import * as fs from 'fs'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'

import { apiUri } from '@modbus2mqtt/server.shared'
import { AddressInfo } from 'net'
import { MqttDiscover } from './mqttdiscover'

interface IAddonInfo {
  slug: string
  ingress: boolean
  ingress_entry: string
  ingress_panel: boolean
  ingress_port: number
  ingress_url: string
}

const debug = Debug('HttpServerBase')
const debugUrl = Debug('HttpServerBaseUrl')
const log = new Logger('HttpServerBase')
// import cors from 'cors';
//import { IfileSpecification } from './ispecification';

export class HttpServerBase {
  app: express.Application
  languages = ['en']
  constructor(private angulardir: string = '.') {
    this.app = require('express')()
  }
  private statics = new Map<string, string>()
  private ingressUrl: string = '/'
  returnResult(
    req: Request,
    res: http.ServerResponse,
    code: HttpErrorsEnum,
    message: any,
    cb?: () => void,
    object: any = undefined
  ) {
    debugUrl('end: ' + req.path)
    if (code >= 299) {
      log.log(LogLevelEnum.error, '%s: Http Result: %d %s', req.url, code, message)
    } else debug(req.url + ' :' + HttpErrorsEnum[code])
    if (object != undefined) debug('Info: ' + object)
    try {
      res.statusCode = code
      res.end(message)
    } catch (e: any) {
      log.log(LogLevelEnum.error, e.message)
      JSON.stringify(e)
    }
  }
  private static getAuthTokenFromHeader(req: Request): string | undefined {
    let authHeader: string | undefined = undefined
    if (req.header) authHeader = req.header('Authorization')
    if (authHeader) {
      let tokenPos = authHeader!.indexOf(' ') + 1
      return authHeader.substring(tokenPos)
    }
    return undefined
  }
  static getAuthTokenFromUrl(url: string): string | undefined {
    let parts = url.split('/')
    let apiIdx = parts.findIndex((part) => ['api', 'download'].includes(part))
    if (apiIdx >= 2) {
      return parts[apiIdx - 1]
    }

    return undefined
  }
  protected static validateUserToken(req: Request, token: string | undefined): MqttValidationResult {
    if (token == undefined) {
      token = HttpServerBase.getAuthTokenFromUrl(req.url)
      if (token == undefined) return MqttValidationResult.error
      req.url = req.url.replace(token + '/', '')
    }
    return Config.validateUserToken(token)
  }

  private getDirectoryForLanguage(req: Request): string {
    let lang = req.acceptsLanguages(['en', 'fr'])
    if (!lang) lang = 'en'
    return this.statics.get(lang)!
  }

  private initStatics() {
    fs.readdirSync(this.angulardir).forEach((langDir) => {
      let lang = langDir.replace(/-.*/g, '')
      let dir = langDir
      this.statics.set(lang, dir)
    })
    if (this.statics.size > 0) this.languages = Array.from(this.statics.keys())
  }
  get<T extends Request>(url: apiUri, func: (req: T, response: any) => void): void {
    debugUrl('start get' + url)
    this.app.get(url, (req: T, response: any) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  post<T extends Request>(url: apiUri, func: (req: T, response: any) => void): void {
    debugUrl('start post' + url)
    this.app.post(url, (req: T, response: any) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  delete<T extends Request>(url: apiUri, func: (req: T, response: any) => void): void {
    debugUrl('start delete' + url)
    this.app.delete(url, (req: T, response: any) => {
      debug(req.method + ': ' + req.originalUrl)
      func(req, response)
    })
  }
  validate() {}
  authenticate(req: Request, res: http.ServerResponse, next: any) {
    //  req.header('')
    // All api calls and a user registration when a user is already registered needs authorization
    let config = Config.getConfiguration()
    let token = HttpServerBase.getAuthTokenFromUrl(req.url)
    if (token != undefined) req.url = req.url.replace(token + '/', '')
    else token = HttpServerBase.getAuthTokenFromHeader(req)
    let slaveTopicFound =
      null !=
      MqttDiscover.getInstance()
        .getSlaveBaseTopics()
        .find((tp) => tp.startsWith(req.url.substring(1)))
    if (
      req.url.indexOf('/api/') >= 0 ||
      req.url.indexOf('/user/register') >= 0 ||
      req.url.indexOf('/download/') >= 0 ||
      slaveTopicFound
    ) {
      let authStatus = Config.getAuthStatus()
      if (authStatus.hassiotoken) {
        let address = (req.socket.address() as AddressInfo).address
        if (
          !address ||
          (address.indexOf('172.30.33') < 0 &&
            address.indexOf('172.30.32') < 0 &&
            address.indexOf('127.0.0.1') < 0 &&
            address.indexOf('::1') < 0)
        ) {
          log.log(LogLevelEnum.warn, 'Denied: IP Address is not allowed ' + address)
          this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, 'Unauthorized (See server log)')
          return
        }
        debug('Supervisor: validate hassio token')
        next()
        return
      } else {
        if (!config.password || (config.password.length == 0 && req.url.indexOf(apiUri.userRegister) >= 0)) {
          next()
          return
        }
        switch (Config.validateUserToken(token)) {
          case MqttValidationResult.OK:
            next()
            return
          case MqttValidationResult.tokenExpired:
            log.log(LogLevelEnum.error, 'Token expired')
            this.returnResult(req, res, HttpErrorsEnum.ErrUnauthorized, 'Token expired')
            return
          default:
            // case MqttValidationResult.error:
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, 'Unauthorized (See server log)')
            return
        }
      }
      // Check addon access
    }

    // No authentication required
    next()
    return
  }

  initApp() {}
  init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        Config.executeHassioGetRequest<{ data: IAddonInfo }>(
          '/addons/self/info',
          (info) => {
            //this.ingressUrl = join("/hassio/ingress/", info.data.slug);
            this.ingressUrl = info.data.ingress_entry
            log.log(LogLevelEnum.notice, 'Hassio authentication successful url:' + this.ingressUrl)
            this.initBase()
            resolve()
          },
          (e) => {
            log.log(LogLevelEnum.warn, 'Hassio authentication failed ' + e.message)
            this.initBase()
            resolve()
          }
        )
      } catch (e) {
        this.initBase()
        resolve()
      }
    })
  }
  private compareIngressUrl(req: Request) {
    let h = req.header('X-Ingress-Path')
    if (h && h != this.ingressUrl) {
      log.log(LogLevelEnum.error, 'Invalid X-Ingress-Path in header expected: ' + this.ingressUrl + 'got: ' + h)
    }
  }

  private sendIndexFile(req: Request, res: express.Response) {
    this.compareIngressUrl(req)
    let dir = this.getDirectoryForLanguage(req)
    let file = join(this.angulardir, dir, 'index.html')
    let content = fs.readFileSync(file).toString()
    let htmlDom = parse(content.toString())
    if (this.ingressUrl && content && htmlDom) {
      let base = htmlDom.querySelector('base')
      base?.setAttribute('href', join('/', this.ingressUrl, '/'))
      content = htmlDom.toString()
      res.status(200).setHeader('Content-Type', 'text/html').send(htmlDom.toString())
    } else res.status(401).setHeader('Content-Type', 'text/html').send('Invalid index.html file ')
  }

  /*
   * All angular files are language specific.
   * This method checks if the url is available in a language dependant angular directory
   * E.g. "/en-US/index.html". In this case it returns the files
   * If it's the index file, the base href will be replaced
   */
  private processStaticAngularFiles(req: Request, res: express.Response, next: NextFunction) {
    try {
      let dir = this.getDirectoryForLanguage(req)
      if (dir) {
        res.removeHeader('Content-Type')
        let file = join(this.angulardir, dir, req.url)
        if (fs.existsSync(file) && !fs.lstatSync(file).isDirectory()) {
          if (req.url.indexOf('index.html') >= 0) {
            this.sendIndexFile(req, res)
            return
          } else {
            res.contentType(basename(req.url))
            let content = fs.readFileSync(file)
            res.setHeader('Content-Length', content.byteLength)
            res.status(200)
            res.send(content)
            return
          }
        }
      }
      next()
      return
    } catch (e) {
      res.status(401).setHeader('Content-Type', 'text/html').send('No or invalid index.html file ')
    }
  }

  processAll(req: Request, res: express.Response, next: NextFunction) {
    this.sendIndexFile(req, res)
  }
  initBase() {
    this.initStatics()

    //this.app.use(cors);
    this.app.use(bodyparser.json())
    this.app.use(bodyparser.urlencoded({ extended: true }))
    this.app.use(express.json())
    //@ts-ignore
    this.app.use(function (_undefined: any, res: http.ServerResponse, next: any) {
      //            res.setHeader('charset', 'utf-8')
      debug('Authenticate')
      res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS, DELETE, GET')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, X-Accel-Buffering, Accept,Connection,Cache-Control,x-access-token'
      )
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      next()
    })
    // angular files have full path including language e.G. /en-US/polyfill.js
    this.app.use(this.authenticate.bind(this))
    this.app.use(express.static(this.angulardir))
    this.app.get('/', (req: Request, res: express.Response, next: NextFunction) => {
      res.redirect('index.html')
    })
    this.initApp()
    this.app.use(this.processStaticAngularFiles.bind(this))
    this.app.all(/.*/, this.processAll.bind(this))
    this.app.on('connection', function (socket: any) {
      socket.setTimeout(2 * 60 * 1000)
      // 30 second timeout. Change this as you see fit.
    })
  }
}
