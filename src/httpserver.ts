import Debug from "debug"
import * as http from 'http'
import serveStatic from 'serve-static';
import fetch from 'node-fetch';
import { NextFunction, Request } from "express";
import * as express from 'express';
import * as bodyparser from 'body-parser';
import { ConverterMap, IModbusData, ImodbusValues, M2mGitHub } from '@modbus2mqtt/specification';
import { Config, MqttValidationResult, filesUrlPrefix } from './config';
import { Modbus } from './modbus';
import { ImodbusSpecification, HttpErrorsEnum, IimageAndDocumentUrl, Ispecification, SpecificationStatus } from '@modbus2mqtt/specification.shared';
import { join } from 'path';
import multer from 'multer';

import { GetRequestWithUploadParameter, fileStorage } from './httpFileUpload';
import { Bus } from "./bus";
import { Subject, endWith } from "rxjs";
import { MqttDiscover } from "./mqttdiscover";
import * as fs from 'fs';
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification';


import { TranslationServiceClient } from '@google-cloud/translate'
import { M2mSpecification as M2mSpecification } from '@modbus2mqtt/specification';
import { IUserAuthenticationStatus, IBus, Islave, apiUri, RoutingNames, ImqttClient } from '@modbus2mqtt/server.shared';
import { ConfigSpecification } from '@modbus2mqtt/specification';
const debug = Debug("httpserver");
const debugUrl = Debug("httpserverUrl");
const log = new Logger("httpserver")
// import cors from 'cors';
//import { IfileSpecification } from './ispecification';

interface GetRequestWithParameter extends Request {
    query: {
        name: string;
        usecache: string;
        timeout: string;
        busid: string;
        slaveid: string;
        spec: string;
        filter: string;
        discover: string;
        entityid: string;
        language: string;
        originalFilename: string;
        password: string;
        mqttValue: string;
        forContribution: string;
        showAllPublicSpecs: string;
    }
}
export class HttpServer {
    app: express.Application;
    config: Config
    private statics = new Map<string, string>()
    languages = ["en"]
    constructor(private angulardir: string = ".", private configObj: Config) {
        this.app = require('express')();
    }
    static returnResult(req: Request, res: http.ServerResponse, code: HttpErrorsEnum, message: string, object: any = undefined) {
        debugUrl("end: " + req.path)
        if (code >= 299) {
            log.log(LogLevelEnum.error, "%s: Http Result: %d %s", req.url, code, message)
        }

        else
            debug(req.url + " :" + HttpErrorsEnum[code])
        if (object != undefined)
            debug("Info: " + object)
        res.statusCode = code
        res.end(message)
    }
    modbusCacheAvailable: boolean = false;
    setModbusCacheAvailable() {
        this.modbusCacheAvailable = true;
    }
    static getAuthTokenFromHeader(authHeader: string): string {
        let tokenPos = authHeader!.indexOf(' ') + 1
        return authHeader.substring(tokenPos);
    }
    static validateUserToken(authHeader: string): MqttValidationResult {
        if (authHeader) {
            let token = HttpServer.getAuthTokenFromHeader(authHeader);
            return Config.validateUserToken(token)
        }
        return MqttValidationResult.error
    }
    get(url: apiUri, func: (req: any, response: any) => void): void {
        debugUrl("start get" + url)
        this.app.get(url, func)
    }
    post(url: apiUri, func: (req: any, response: any) => void): void {
        debugUrl("start post" + url)
        this.app.post(url, func)
    }
    delete(url: apiUri, func: (req: any, response: any) => void): void {
        debugUrl("start delete" + url)
        this.app.delete(url, func)
    }
    authenticate(req: Request, res: http.ServerResponse, next: any) {
        //  req.header('')
        var pwd = Config.getConfiguration().password
        // All api callsand a user registration when a user is already registered needs authorization
        if (req.url.indexOf("/api/") >= 0 || (req.url.indexOf("/user/register") >= 0 && pwd && pwd.length)) {
            let authHeader = req.header("Authorization")
            let config =
                Config.getConfiguration()
            if (authHeader) {
                switch (HttpServer.validateUserToken(authHeader)) {
                    case MqttValidationResult.OK:
                        next();
                        return;
                    case MqttValidationResult.tokenExpired:
                        log.log(LogLevelEnum.error, "Token expired")
                        HttpServer.returnResult(req, res, HttpErrorsEnum.ErrUnauthorized, "Token expired")
                        return;
                    default:
                        // case MqttValidationResult.error:
                        HttpServer.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "Unauthorized (See server log)")
                        return;
                }
            }

            if (config.hassiotoken) {
                log.log(LogLevelEnum.notice, "Supervisor: validate hassio token")
                this.configObj.executeHassioGetRequest("http://supervisor/hardware/info", () => {
                    log.log(LogLevelEnum.notice, "Supervisor: validate hassio token OK")
                    next()
                }, (e) => {
                    log.log(LogLevelEnum.error, "Supervisor: validate hassio token Failed")
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrForbidden, JSON.stringify(e))
                })
                return;
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "Unauthorized (See server log)")
                return;
            }
        }

        // No authentication required
        next();
        return;
    }
    private initStatics() {
        fs.readdirSync(this.angulardir).forEach(langDir => {
            let lang = langDir.replace(/-.*/g, "")
            let dir = join(this.angulardir, langDir)
            this.statics.set(lang, dir)
        })
        if (this.statics.size > 0)
            this.languages = Array.from(this.statics.keys())
    }

    private getStaticsForLanguage(req: Request): string {
        let lang = req.acceptsLanguages(["en", "fr"])
        if (!lang)
            lang = "en"
        return this.statics.get(lang)!
    }

    init() {
        //this.app.use(cors);
        this.app.use(bodyparser.json());
        this.app.use(bodyparser.urlencoded({ extended: true }));
        this.app.use(express.json());
        //this.app.use(fileupload());
        this.initStatics()


        let localdir = join(Config.getConfiguration().filelocation, "local", filesUrlPrefix);
        let publicdir = join(Config.getConfiguration().filelocation, "public", filesUrlPrefix);

        this.app.use('/' + filesUrlPrefix, express.static(localdir));
        this.app.use('/' + filesUrlPrefix, express.static(publicdir));
        this.app.use(express.static(this.angulardir));

        // angular files have full path including language e.G. /en-US/polyfill.js
        this.app.use(this.authenticate.bind(this))
        //@ts-ignore
        this.app.use(function (undefined: any, res: http.ServerResponse, next: any) {
            //            res.setHeader('charset', 'utf-8')
            res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, X-Accel-Buffering, Accept,Connection,Cache-Control,x-access-token");
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Content-Type", " application/json");
            next();
        });
        //@ts-ignore
        // app.use(function (err:any, req:any, res:any, next:any) {
        //     res.status(409).json({status: err.status, message: err.message})
        //     next();
        //   });
        this.get(apiUri.userAuthenticationStatus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url)
            req.acceptsLanguages()
            let config = Config.getConfiguration()
            let authHeader = req.header("Authorization")
            let a: IUserAuthenticationStatus = {
                registered: config.mqttusehassiotoken || (config.username != undefined && config.password != undefined),
                hassiotoken: (config.mqttusehassiotoken ? config.mqttusehassiotoken : false),
                hasAuthToken: (authHeader ? true : false),
                authTokenExpired: (authHeader != undefined && HttpServer.validateUserToken(authHeader) == MqttValidationResult.tokenExpired),
                mqttConfigured: false,
                preSelectedBusId: (Bus.getBusses().length == 1 ? Bus.getBusses()[0].getId() : undefined)
            }
            if (a.registered && (a.hassiotoken || a.hasAuthToken))
                a.mqttConfigured = Config.isMqttConfigured(config.mqttconnect)

            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
            return;
        });

        this.get(apiUri.converters, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("(/converters")
            let a = ConverterMap.getConverters();
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
            return;
        });
        this.get(apiUri.userLogin, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("(/user/login")
            if (req.query.name && req.query.password) {
                Config.login(req.query.name, req.query.password).then((result) => {
                    if (result) {
                        res.statusCode = (200)
                        let a = {
                            result: "OK",
                            token: result
                        }
                        HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(a))
                    }
                    else {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "{result: \"Forbidden\"}")
                    }
                }).catch(err => {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrForbidden, "{result: \"" + err + "\"}", err)
                })
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, "{result: \"Invalid Parameter\"}")
            }

        });

        this.get(apiUri.userRegister, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("(/user/register")
            res.statusCode = 200;
            if (req.query.name && req.query.password) {
                Config.register(req.query.name, req.query.password).then(() => {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: "OK" }))

                }).catch(err => {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: err }))
                })
            } else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify({ result: "Invalid Parameter" }))
            }

        });
        this.get(apiUri.specsForSlaveId, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url);
            let msg = this.checkBusidSlaveidParameter(req);
            if (msg !== "") {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg);
            } else {
                let slaveId = Number.parseInt(req.query.slaveid);
                let busid = Number.parseInt(req.query.busid);
                let bus = Bus.getBus(busid)
                if (bus) {
                    bus.getAvailableSpecs(slaveId, req.query.showAllPublicSpecs != undefined).then((result) => {
                        debug('getAvailableSpecs  succeeded')
                        HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result));
                    }).catch(e => {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.ErrNotFound, "specsForSlaveId: " + e.message)
                    })
                }
            }
        });

        this.get(apiUri.sslFiles, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            if (Config.sslDir && Config.sslDir.length) {
                let result = fs.readdirSync(Config.sslDir)
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result))
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrNotFound, "not found")
            }
        })

        this.get(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            let spec = req.query.spec
            if (spec && spec.length > 0) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ConfigSpecification.getSpecificationByFilename(spec)))
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrNotFound, "not found")
            }
        })
        this.get(apiUri.specifications, (req: Request, res: http.ServerResponse) => {
            debug(req.url);
            let rc: ImodbusSpecification[] = []
            new ConfigSpecification().filterAllSpecifications(spec => { rc.push(M2mSpecification.fileToModbusSpecification(spec)) })
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc))
        });
        this.get(apiUri.specificationFetchPublic, (req: Request, res: http.ServerResponse) => {
            debug(req.url);
            let ghToken = Config.getConfiguration().githubPersonalToken
            ghToken = (ghToken == undefined ? "" : ghToken)
            new M2mGitHub(ghToken, join(ConfigSpecification.yamlDir, "public")).fetchPublicFiles()
            new ConfigSpecification().readYaml();
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify({ result: "OK" }))
        });

        this.get(apiUri.busses, (req: Request, res: http.ServerResponse) => {
            debug(req.originalUrl);
            let busses = Bus.getBusses()
            let ibs: IBus[] = []
            busses.forEach((bus) => { ibs.push(bus.properties) })
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(ibs));
        });
        this.get(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.originalUrl);
            res.statusCode = 200;
            if (req.query.busid && req.query.busid.length) {
                let bus = Bus.getBus(Number.parseInt(req.query.busid))
                if (bus && bus.properties) {
                    bus.properties
                    HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(bus.properties));
                    return
                }
            }
            HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "invalid Parameter")
        });

        this.get(apiUri.slaves, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("listDevices");
            let invParam = () => {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, "Invalid parameter")
                return
            }
            if (req.query.busid !== undefined) {
                let busid = Number.parseInt(req.query.busid);
                let bus = Bus.getBus(busid);
                if (bus) {
                    let slaves = bus.getSlaves()
                    HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slaves));
                    return;
                }
                else
                    invParam()
            }
            else
                invParam()
        });
        this.get(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("listDevice");
            if (req.query.busid !== undefined && req.query.slaveid !== undefined) {
                let busid = Number.parseInt(req.query.busid);
                let slaveid = Number.parseInt(req.query.slaveid);
                let slave = Bus.getBus(busid)?.getSlaveBySlaveId(slaveid)
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(slave));
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, "Invalid parameter")
            }
        });

        this.get(apiUri.configuration, (req: Request, res: http.ServerResponse) => {
            debug("configuration");
            try {
                let config = Config.getConfiguration();
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(config));

            } catch (e) {
                log.log(LogLevelEnum.error, "Error getConfiguration: " + JSON.stringify(e))
                HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify(e));
            }
        });
        this.get(apiUri.modbusSpecification, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url);
            debug("get specification with modbus data for slave " + req.query.slaveid);
            let msg = this.checkBusidSlaveidParameter(req);
            if (msg !== "") {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg);
                return;
            }
            let bus = Bus.getBus(Number.parseInt(req.query.busid))
            if (bus === undefined) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Bus not found. Id: " + req.query.busid);
                return;
            }
            Modbus.getModbusSpecification("http", bus, Number.parseInt(req.query.slaveid), req.query.spec, (e: any) => {
                log.log(LogLevelEnum.error, "http: get /specification " + e.message);
                HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, JSON.stringify("read specification " + e.message));
            }).subscribe(result => {
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(result));
            })
        });
        this.post(apiUri.specficationContribute, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            if (!req.query.spec) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrInvalidParameter, "specification name not passed");
                return
            }
            let spec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
            let client = new M2mSpecification(spec as Ispecification);
            if (spec && spec.status && ![SpecificationStatus.contributed, SpecificationStatus.published].includes(spec.status)) {
                client.contribute(req.body.note).then(response => {
                    // poll status updates of pull request
                    client.startPolling((e) => { log.log(LogLevelEnum.error, e.message) })
                    HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(response));
                }).catch(err => {
                    res.statusCode = HttpErrorsEnum.ErrNotAcceptable
                    if (err.message)
                        res.end(JSON.stringify(err.message))
                    else
                        res.end(JSON.stringify(err))
                    log.log(LogLevelEnum.error, JSON.stringify(err))
                })

            } else
                if (spec && spec.status && spec.status == SpecificationStatus.contributed)
                    client.startPolling((e) => { log.log(LogLevelEnum.error, e.message) })
        })

        this.post(apiUri.translate, (req: Request, res: http.ServerResponse) => {
            let client = new TranslationServiceClient();
            client.translateText(req.body).then(response => {
                let rc: string[] = []
                if (response[0].translations) {
                    response[0].translations.forEach(translation => {
                        if (translation.translatedText)
                            rc.push(translation.translatedText)
                    })
                    HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc));
                }
            }).catch((err: any) => {
                res.statusCode = HttpErrorsEnum.ErrNotAcceptable
                res.end(JSON.stringify(err.message))
                log.log(LogLevelEnum.error, JSON.stringify(err.message))
            })
        })

        this.post(apiUri.validateMqtt, (req: Request, res: http.ServerResponse) => {
            debug(req.url)
            let config = req.body
            Config.updateMqttTlsConfig(config)
            try {
                if (config.mqttconnect == undefined) {
                    this.validateMqttConnectionResult(req, res, false, "No parameters configured")
                    return
                }
                let mqttdiscover = Config.getMqttDiscover();
                mqttdiscover.validateConnection((valid, message) => {
                    this.validateMqttConnectionResult(req, res, valid, message)
                })

            } catch (err) {
                log.log(LogLevelEnum.error, err)
            }
        });

        this.post(apiUri.configuration, (req: Request, res: http.ServerResponse) => {
            debug("POST: " + req.url);
            let config = Config.getConfiguration();
            this.configObj.writeConfiguration(req.body);
            config = Config.getConfiguration()
            ConfigSpecification.setMqttdiscoverylanguage(config.mqttdiscoverylanguage, config.githubPersonalToken)
            HttpServer.returnResult(req, res, HttpErrorsEnum.OkNoContent, JSON.stringify(config));
        });
        this.post(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("POST: " + req.url);
            let busid = Number.parseInt(req.query.busid)

            if (req.query.busid != undefined) {
                let bus = Bus.getBus(busid)
                if (bus)
                    bus.updateBus(req.body)
                else {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, "Bus not found in busses");
                    return;
                }
            }
            else
                busid = Bus.addBus(req.body).properties.busId;
            let rc1 = { busid: busid };
            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc1));
        });

        this.post(apiUri.modbusEntity, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url);
            let msg = this.checkBusidSlaveidParameter(req);
            if (msg !== "") {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg);
                return;
            } else {
                let bus = Bus.getBus(Number.parseInt(req.query.busid))!
                let entityid = (req.query.entityid ? parseInt(req.query.entityid) : undefined)
                let sub = new Subject<ImodbusSpecification>()
                let subscription = sub.subscribe(result => {
                    subscription.unsubscribe()
                    let ent = result.entities.find(e => e.id == entityid)
                    if (ent) {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(ent));
                        return;
                    } else {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, "No entity found in specfication");
                        return;
                    }
                })
                Modbus.getModbusSpecificationFromData("http", bus, Number.parseInt(req.query.slaveid), req.body, sub)

            };
        });
        this.post(apiUri.writeEntity, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url);
            let msg = this.checkBusidSlaveidParameter(req);
            if (msg !== "") {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg);
                return;
            } else {
                let bus = Bus.getBus(Number.parseInt(req.query.busid))!
                let mqttValue = req.query.mqttValue
                let entityid = (req.query.entityid ? parseInt(req.query.entityid) : undefined)
                if (entityid && mqttValue)
                    new Modbus().writeEntityMqtt(bus, Number.parseInt(req.query.slaveid), req.body, entityid, mqttValue).then(() => {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, "");
                    }).catch((e) => {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, e);
                    })
                else
                    HttpServer.returnResult(req, res, HttpErrorsEnum.SrvErrInternalServerError, "No entity found in specfication");
            };
        });
        this.get(apiUri.serialDevices, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug(req.url);


            this.configObj.listDevices((devices) => {
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(devices))
            }, (error) => {
                // Log the error, but return empty array
                log.log(LogLevelEnum.notice, "listDevices: " + error.message)
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify([]), error)
            })
        })

        this.post(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("POST /specification: " + req.query.busid + "/" + req.query.slaveid);
            let rd = new ConfigSpecification();
            let msg = this.checkBusidSlaveidParameter(req);
            let bus: Bus | undefined
            let slave: Islave | undefined
            let busId: number | undefined
            let testdata: ImodbusValues | undefined
            if (req.query.busid, req.query.slaveid) {
                busId = Number.parseInt(req.query.busid);
                let slaveId = Number.parseInt(req.query.slaveid);
                bus = Bus.getBus(busId)
                if (bus !== undefined) {
                    slave = bus.getSlaveBySlaveId(slaveId)
                    let slaveAddresses = bus.getModbusAddressesForSlave(slaveId)
                    if (slaveAddresses)
                        testdata = M2mSpecification.getEmptyModbusAddressesFromSlaveToTestdata(slaveAddresses)
                }
            }
            if (testdata == undefined) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify('No extended testdata available, try again later'));
                return;
            }
            if (msg !== "") {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "{message: '" + msg + "'}");
                return;
            }
            let originalFilename: string | null = (req.query.originalFilename ? req.query.originalFilename : null)
            var rc = rd.writeSpecification(req.body, testdata, (filename: string) => {
                if (busId != undefined && bus != undefined && slave != undefined) {
                    slave.specificationid = filename;
                    this.configObj.writeslave(busId, slave.slaveid, slave.specificationid, slave.name);

                }
            }, originalFilename);

            bus?.getAvailableSpecs(Number.parseInt(req.query.slaveid), false).then(() => {
                debug("Cache updated")
            }).catch(e => {
                debug("getAvailableModbusData failed:" + e.message)
            })

            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc));
        });
        this.post(apiUri.specificationValidate, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            if (!req.query.language || req.query.language.length == 0) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify("pass language "));
                return;
            }
            let spec = new M2mSpecification(req.body);
            let messages = spec.validate(req.query.language)
            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages));

        })

        this.get(apiUri.specificationValidate, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            if (!req.query.language || req.query.language.length == 0) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify("pass language "));
                return;
            }
            if (!req.query.spec || req.query.spec.length == 0) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify("pass specification "));
                return;
            }
            let fspec = ConfigSpecification.getSpecificationByFilename(req.query.spec)
            if (!fspec) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, JSON.stringify("specification not found " + req.query.spec));
                return;
            }
            let spec = new M2mSpecification(fspec);
            let messages = spec.validate(req.query.language)
            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(messages));
        });
        this.post(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("POST /slave: " + JSON.stringify(req.body));
            let bus = Bus.getBus(Number.parseInt(req.query.busid))
            if (!req.query.busid || !bus) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Bus not found. Id: " + req.query.busid);
                return;
            }
            if (req.body.slaveid == undefined) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Bus Id: " + req.query.busid + " Slave Id is not defined");
                return;
            }

            res.setHeader('charset', 'utf-8')
            res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token");
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Content-Type", "application/json");
            let rc: Islave = bus.writeSlave(req.body.slaveid, req.body.specificationid, req.body.name, req.body.polInterval);
            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(rc));
        });
        this.post(apiUri.addFilesUrl, (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
            try {
                if (req.query.specification) {
                    if (req.body) {
                        // req.body.documents
                        let config = new ConfigSpecification();
                        let files = config.appendSpecificationUrl(req.query.specification!, req.body)
                        if (files)
                            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files));
                        else
                            HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, " specification not found");
                    }
                    else {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, " specification not found");
                    }
                } else {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, " specification no passed");
                }


            }
            catch (e: any) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Adding URL failed: " + e.message, e);
            }

        })

        var upload = multer({ storage: fileStorage });
        this.app.post(apiUri.upload, upload.array('documents'), (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
            try {
                if (!req.query.usage) {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "No Usage passed");
                    return;

                }

                let msg = this.checkBusidSlaveidParameter(req as any);
                if (msg !== "") {
                    HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, msg);
                    return;
                } else {
                    debug("Files uploaded")
                    if (req.files) {
                        // req.body.documents
                        let config = new ConfigSpecification();
                        let files: IimageAndDocumentUrl[] | undefined
                        (req.files as Express.Multer.File[])!.forEach(f => {
                            files = config.appendSpecificationFile(req.query.specification!, f.originalname, req.query.usage!)
                        })
                        if (files)
                            HttpServer.returnResult(req, res, HttpErrorsEnum.OkCreated, JSON.stringify(files));
                        else
                            HttpServer.returnResult(req, res, HttpErrorsEnum.OkNoContent, " specification not found or no files passed");
                    }
                    else {
                        HttpServer.returnResult(req, res, HttpErrorsEnum.OkNoContent, " specification not found or no files passed");
                    }
                }
            } catch (e: any) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Upload failed: " + e.message, e);
            }
        });
        this.delete(apiUri.upload, (req: GetRequestWithUploadParameter, res: http.ServerResponse) => {
            if (req.query.specification && req.query.url && req.query.usage) {
                let files = ConfigSpecification.deleteSpecificationFile(req.query.specification, req.query.url, req.query.usage);
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(files));
            }
            else {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "Invalid Usage");;
            }


        });
        this.delete(apiUri.newSpecificationfiles, (req: Request, res: http.ServerResponse) => {
            try {
                new ConfigSpecification().deleteNewSpecificationFiles()
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify("OK"));

            }
            catch (err: any) {
                HttpServer.returnResult(req, res, HttpErrorsEnum.ErrBadRequest, "deletion failed: " + err.message, err);
            }

        });
        // app.post('/specification',  ( req:express.TypedRequestBody<IfileSpecification>) =>{
        //         debug( req.body.name);
        //    });
        this.delete(apiUri.specfication, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("DELETE /specification: " + req.query.spec);
            let rd = new ConfigSpecification();
            var rc = rd.deleteSpecification(req.query.spec);
            Bus.getBusses().forEach(bus => {
                bus.getSlaves().forEach(slave => {
                    if (slave.specificationid == req.query.spec) {
                        delete slave.specificationid
                        bus.writeSlave(slave.slaveid, undefined, slave.name, slave.polInterval);
                    }
                })
            })
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc));
        });
        this.delete(apiUri.bus, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("DELETE /busses: " + req.query.busid);
            Bus.deleteBus(Number.parseInt(req.query.busid))
            HttpServer.returnResult(req, res, HttpErrorsEnum.OK, "");
        });
        this.delete(apiUri.slave, (req: GetRequestWithParameter, res: http.ServerResponse) => {
            debug("Delete /slave: " + req.query.slaveid);
            if (req.query.slaveid.length > 0 && req.query.busid.length > 0) {
                let bus = Bus.getBus(Number.parseInt(req.query.busid))
                if (bus)
                    bus.deleteSlave(Number.parseInt(req.query.slaveid))
                HttpServer.returnResult(req, res, HttpErrorsEnum.OK, "");
            }

        });
        this.app.all("*", (req: Request, res: express.Response, next: NextFunction) => {
            let dir = this.getStaticsForLanguage(req)
            if (dir) {
                res.removeHeader("Content-Type")
                res.status(200).sendFile(join(dir, "index.html"))
            }
        })

    }

    checkBusidSlaveidParameter(req: GetRequestWithParameter): string {
        if (req.query.busid === "")
            return req.originalUrl + ": busid was not passed";
        if (req.query.slaveid === "")
            return req.originalUrl + ": slaveid was not passed";
        return "";
    }

    validateMqttConnectionResult(req: Request, res: http.ServerResponse, valid: boolean, message: string) {

        let rc = {
            valid: valid,
            message: message
        }
        HttpServer.returnResult(req, res, HttpErrorsEnum.OK, JSON.stringify(rc));
    }
}

