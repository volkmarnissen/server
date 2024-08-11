import Debug from "debug";
import * as http from "http";
import { NextFunction, Request } from "express";
import * as express from "express";
import * as bodyparser from "body-parser";
import { Config, MqttValidationResult } from "./config";
import { HttpErrorsEnum } from "@modbus2mqtt/specification.shared";
import { join } from "path";
import { parse } from "node-html-parser";
import * as fs from "fs";
import { LogLevelEnum, Logger } from "@modbus2mqtt/specification";

import { apiUri } from "@modbus2mqtt/server.shared";
const debug = Debug("HttpServerBase");
const debugUrl = Debug("HttpServerBaseUrl");
const log = new Logger("HttpServerBase");
// import cors from 'cors';
//import { IfileSpecification } from './ispecification';

export class HttpServerBase {
  app: express.Application;
  languages = ["en"];
  constructor(private angulardir: string = ".") {
    this.app = require("express")();
  }
  private statics = new Map<string, string>();

  returnResult(req: Request, res: http.ServerResponse, code: HttpErrorsEnum, message: string, object: any = undefined) {
    debugUrl("end: " + req.path);
    if (code >= 299) {
      log.log(LogLevelEnum.error, "%s: Http Result: %d %s", req.url, code, message);
    } else debug(req.url + " :" + HttpErrorsEnum[code]);
    if (object != undefined) debug("Info: " + object);
    res.statusCode = code;
    res.end(message);
  }
  static getAuthTokenFromHeader(authHeader: string): string {
    let tokenPos = authHeader!.indexOf(" ") + 1;
    return authHeader.substring(tokenPos);
  }
  static validateUserToken(authHeader: string): MqttValidationResult {
    if (authHeader) {
      let token = HttpServerBase.getAuthTokenFromHeader(authHeader);
      return Config.validateUserToken(token);
    }
    return MqttValidationResult.error;
  }
  private getStaticsForLanguage(req: Request): string {
    let lang = req.acceptsLanguages(["en", "fr"]);
    if (!lang) lang = "en";
    return this.statics.get(lang)!;
  }

  private initStatics() {
    fs.readdirSync(this.angulardir).forEach((langDir) => {
      let lang = langDir.replace(/-.*/g, "");
      let dir = langDir;
      this.statics.set(lang, dir);
    });
    if (this.statics.size > 0) this.languages = Array.from(this.statics.keys());
  }

  get(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl("start get" + url);
    this.app.get(url, func);
  }
  post(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl("start post" + url);
    this.app.post(url, func);
  }
  delete(url: apiUri, func: (req: any, response: any) => void): void {
    debugUrl("start delete" + url);
    this.app.delete(url, func);
  }
  authenticate(req: Request, res: http.ServerResponse, next: any) {
    //  req.header('')
    var pwd = Config.getConfiguration().password;
    // All api callsand a user registration when a user is already registered needs authorization
    if (req.url.indexOf("/api/") >= 0 || (req.url.indexOf("/user/register") >= 0 && pwd && pwd.length)) {
      let authHeader = req.header("Authorization");
      let config = Config.getConfiguration();
      if (authHeader) {
        switch (HttpServerBase.validateUserToken(authHeader)) {
          case MqttValidationResult.OK:
            next();
            return;
          case MqttValidationResult.tokenExpired:
            log.log(LogLevelEnum.error, "Token expired");
            this.returnResult(req, res, HttpErrorsEnum.ErrUnauthorized, "Token expired");
            return;
          default:
            // case MqttValidationResult.error:
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "Unauthorized (See server log)");
            return;
        }
      }

      if (config.hassiotoken) {
        log.log(LogLevelEnum.notice, "Supervisor: validate hassio token");
        Config.executeHassioGetRequest(
          "http://supervisor/hardware/info",
          () => {
            log.log(LogLevelEnum.notice, "Supervisor: validate hassio token OK");
            next();
          },
          (e) => {
            log.log(LogLevelEnum.error, "Supervisor: validate hassio token Failed");
            this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, JSON.stringify(e));
          }
        );
        return;
      } else {
        this.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "Unauthorized (See server log)");
        return;
      }
    }

    // No authentication required
    next();
    return;
  }

  initApp() {}
  init() {
    this.initStatics();

    //this.app.use(cors);
    this.app.use(bodyparser.json());
    this.app.use(bodyparser.urlencoded({ extended: true }));
    this.app.use(express.json());
    this.app.use(express.static(this.angulardir));
    // angular files have full path including language e.G. /en-US/polyfill.js
    this.app.use(this.authenticate.bind(this));
    //@ts-ignore
    this.app.use(function (_undefined: any, res: http.ServerResponse, next: any) {
      //            res.setHeader('charset', 'utf-8')
      res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, X-Accel-Buffering, Accept,Connection,Cache-Control,x-access-token"
      );
      res.setHeader("Access-Control-Allow-Credentials", "true");
      next();
    });
    this.initApp();
    this.app.all("*", (req: Request, res: express.Response, next: NextFunction) => {
      let dir = this.getStaticsForLanguage(req);
      if (dir) {
        res.removeHeader("Content-Type");
        let indexFile = join(this.angulardir, dir, "index.html");
        let content = fs.readFileSync(indexFile);
        let htmlDom = parse(content.toString());
        if (htmlDom) {
          try {
            let base = htmlDom.querySelector("base");
            base?.setAttribute("href", "/" + dir + "/");
            res.status(200).setHeader("Content-Type", "text/html").send(htmlDom.toString());
          } catch (e) {
            res.status(401).setHeader("Content-Type", "text/html").send("No or invalid index.html file ");
          }
        } else res.status(200).send(join(dir, "index.html"));
      }
    });
  }
}
