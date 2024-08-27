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
  private ingressUrl: string = 'test'
  returnResult(req: Request, res: http.ServerResponse, code: HttpErrorsEnum, message: string, object: any = undefined) {
    debugUrl('end: ' + req.path)
    if (code >= 299) {
      log.log(LogLevelEnum.error, '%s: Http Result: %d %s', req.url, code, message)
    } else debug(req.url + ' :' + HttpErrorsEnum[code])
    if (object != undefined) debug('Info: ' + object)
    res.statusCode = code
    res.end(message)
  }
  static getAuthTokenFromHeader(authHeader: string): string {
    let tokenPos = authHeader!.indexOf(' ') + 1
    return authHeader.substring(tokenPos)
  }
  static validateUserToken(authHeader: string): MqttValidationResult {
    if (authHeader) {
      let token = HttpServerBase.getAuthTokenFromHeader(authHeader)
      return Config.validateUserToken(token)
    }
    return MqttValidationResult.error
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

  get(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl('start get' + url)
    this.app.get(url, func)
  }
  post(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl('start post' + url)
    this.app.post(url, func)
  }
  delete(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl('start delete' + url)
    this.app.delete(url, func)
  }
  authenticate(req: Request, res: http.ServerResponse, next: any) {
    //  req.header('')
    var pwd = Config.getConfiguration().password
    // All api callsand a user registration when a user is already registered needs authorization
    if (req.url.indexOf('/api/') >= 0 || (req.url.indexOf('/user/register') >= 0 && pwd && pwd.length)) {
      let authHeader = req.header('Authorization')
      let config = Config.getConfiguration()
      if (authHeader) {
        switch (HttpServerBase.validateUserToken(authHeader)) {
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
      if (config.hassiotoken) {
        debug('Supervisor: validate hassio token')
        next()
        return
      } else {
        log.log(LogLevelEnum.notice, 'HASSIO_TOKEN not set in environment')
        this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, 'Unauthorized (See server log)')
        return
      }
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
          'http://supervisor/addons/self/info',
          (info) => {
            //this.ingressUrl = join("/hassio/ingress/", info.data.slug);
            this.ingressUrl = info.data.ingress_entry
            log.log(LogLevelEnum.notice, 'Hassio authentication successful')
            this.initBase()
            resolve()
          },
          (e) => {
            log.log(LogLevelEnum.warn, 'Hassio authentication failed' + e.message)
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
  private setIngressUrl(req: Request) {
    let h = req.header('X-Ingress-Path')
    this.ingressUrl = h ? h : '/'
  }

  private sendIndexFile(req: Request, res: express.Response) {
    this.setIngressUrl(req)
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
    this.app.use(this.processStaticAngularFiles.bind(this))
    this.app.use(express.static(this.angulardir))
    this.app.get('/', (req: Request, res: express.Response, next: NextFunction) => {
      res.redirect('index.html')
    })
    this.initApp()
    this.app.all('*', this.processAll.bind(this))
    this.app.on('connection', function (socket: any) {
      socket.setTimeout(2 * 60 * 1000)
      // 30 second timeout. Change this as you see fit.
    })
  }
}
