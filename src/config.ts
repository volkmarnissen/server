import Debug from "debug"
import { parse, stringify } from 'yaml';
import * as fs from 'fs';
import { MqttDiscover } from './mqttdiscover';
import * as path from 'path';
import { join } from 'path';
import { Observable, Subject } from "rxjs";
import { BUS_TIMEOUT_DEFAULT, getBaseFilename } from '@modbus2mqtt/specification.shared';
import { sign, verify } from 'jsonwebtoken';
import * as bcrypt from "bcryptjs";
import * as http from 'http'
import { ConfigSpecification, LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { SerialPort } from 'serialport'
import { ImqttClient, AuthenticationErrors, IBus, Iconfiguration, IModbusConnection, Islave } from '@modbus2mqtt/server.shared';
const CONFIG_VERSION = "0.1"
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            HASSIO_TOKEN: string;
        }
    }
}

export enum MqttValidationResult {
    OK = 0,
    tokenExpired = 1,
    error = 2
}
const log = new Logger("config")
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
    static tokenExpiryTime: number = defaultTokenExpiryTime;
    mqttLoginData: ImqttClient | undefined = undefined;
    static login(name: string, password: string): Promise<string> {
        let rc = new Promise<string>((resolve, reject) => {
            if (Config.config && Config.config.username && Config.config.password) {
                // Login
                if (name === Config.config.username)
                    bcrypt.compare(password, Config.config.password).then((success) => {
                        if (success) {
                            try {
                                //const iat = Math.floor(Date.now() / 1000)
                                //const exp = iat + Config.config.tokenExpiryTimeInMSec // seconds
                                let s = sign({ password: password }, Config.secret, {
                                    expiresIn: Config.tokenExpiryTime + "ms",
                                    algorithm: "HS256",
                                })
                                resolve(s)
                            } catch (err) {
                                log.log(LogLevelEnum.error, err)
                                reject(AuthenticationErrors.SignError)
                            }

                        }
                        else
                            reject(AuthenticationErrors.InvalidUserPasswordCombination)
                    }).catch(err => {
                        log.log(LogLevelEnum.error, "login: compare failed: " + err)
                        reject(AuthenticationErrors.InvalidParameters)
                    })
                else {
                    log.log(LogLevelEnum.error, "login: Username was not set")
                    reject(AuthenticationErrors.InvalidParameters)
                }

            }
        });
        return rc;
    }
    static register(name: string, password: string): Promise<void> {
        let rc = new Promise<void>((resolve, reject) => {
            if (Config.config) {
                // Login
                //No username and password configured.: Register login
                bcrypt.hash(password, saltRounds).then((enc) => {
                    Config.config.password = enc;
                    Config.config.username = name;
                    new Config().writeConfiguration(Config.config)
                    resolve();
                }).catch(err => {
                    reject(err)
                })
            }
            else
                reject(AuthenticationErrors.InvalidParameters)
        });
        return rc;
    }
    static validateUserToken(token: string): MqttValidationResult {
        try {
            let v: any = verify(token, Config.secret, { complete: true })
            v = verify(token, Config.secret, { complete: true, ignoreExpiration: false })
            if (bcrypt.compareSync(v.payload.password, Config.config.password!))
                return MqttValidationResult.OK
            else
                return MqttValidationResult.error
        }
        catch (err) {
            if ((err as any).name && (err as any).name == 'TokenExpiredError')
                return MqttValidationResult.tokenExpired
            log.log(LogLevelEnum.error, "Validate: " + err)
            return MqttValidationResult.error;
        }

    }

    static getPublicDir(): string {
        return join(Config.yamlDir, "public")
    }
    static getLocalDir(): string {
        return join(Config.yamlDir, "local")
    }
    private getFilesPath(specfilename: string): string {
        return getSpecificationImageOrDocumentUrl(join(Config.getConfiguration().filelocation, "local"), specfilename, "")
    }


    //@ts-ignore
    private static config: Iconfiguration;
    private static secret: string;
    private static specificationsChanged = new Subject<string>()
    private static bussesChanged = new Subject<void>()
    private static busses: IBus[];
    private getRequest: (options: http.RequestOptions, result: (res: http.IncomingMessage) => void) => void = http.request;
    private static newConfig: Iconfiguration = {
        version: CONFIG_VERSION,
        mqttbasetopic: "modbus2mqtt",
        mqttdiscoveryprefix: "homeassistant",
        mqttdiscoverylanguage: "en",
        mqttconnect: {
            connectTimeout: 60 * 1000,

        },
        httpport: 3000,
        fakeModbus: false,
        filelocation: "/data/local",
    }

    static yamlDir: string = "";
    static sslDir: string = "";

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
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;
        let counter = 0;
        if (fs.existsSync(pathStr))
            return fs.readFileSync(pathStr, { encoding: 'utf8' }).toString();
        debug("getSecret: Create secrets file at" + pathStr)
        while (counter < secretsLength) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
            counter += 1;
        }
        let dir = path.dirname(pathStr)
        debug("Config.getSecret: write Secretfile to " + pathStr)
        if (dir && !fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(pathStr, result, { encoding: 'utf8' });
        debug("Config.getSecret: write successful")

        return result;
    }
    static addBusProperties(connection: IModbusConnection): IBus {
        let maxBusId = -1;
        Config.busses.forEach(b => { if (b.busId > maxBusId) maxBusId = b.busId });
        maxBusId++;
        let busArrayIndex = Config.busses.push({ busId: maxBusId, connectionData: connection, slaves: [] }) - 1;
        let busDir = Config.yamlDir + "/local/busses/bus." + maxBusId;
        if (!fs.existsSync(busDir)) {
            fs.mkdirSync(busDir, { recursive: true });
            debug("creating slaves path: " + busDir)
        }
        let src = stringify(connection);
        fs.writeFileSync(join(busDir, "bus.yaml"), src, { encoding: 'utf8' });
        Config.bussesChanged.next()
        return Config.busses[busArrayIndex];
    }
    static updateBusProperties(bus: IBus, connection: IModbusConnection): IBus {
        bus.connectionData = connection
        let busDir = Config.yamlDir + "/local/busses/bus." + bus.busId;
        if (!fs.existsSync(busDir)) {
            fs.mkdirSync(busDir, { recursive: true });
            debug("creating slaves path: " + busDir)
        }
        let src = stringify(connection);
        fs.writeFileSync(join(busDir, "bus.yaml"), src, { encoding: 'utf8' });
        Config.bussesChanged.next()
        return bus;
    }
    static deleteBusProperties(busid: number) {
        let idx = Config.busses.findIndex(b => b.busId == busid);
        if (idx >= 0) {
            let busDir = Config.yamlDir + "/local/busses/bus." + busid;
            Config.busses.splice(idx, 1);
            fs.rmSync(busDir, { recursive: true });
            let mqd = new MqttDiscover(Config.config.mqttconnect)
            mqd.deleteBus(busid)
            Config.bussesChanged.next()
        }
    }


    static getConfiguration(): Iconfiguration {
        if (Config.secret == undefined) {
            var secretsfile = (Config.sslDir.length > 0 ? join(Config.sslDir, "secrets.txt") : "secrets.txt")
            var sslDir = path.parse(secretsfile).dir
            if (sslDir.length && !fs.existsSync(sslDir))
                fs.mkdirSync(sslDir, { recursive: true })
            try {
                if (fs.existsSync(secretsfile)) {
                    debug("secretsfile " + "secretsfile exists")
                    fs.accessSync(secretsfile, fs.constants.W_OK)
                }
                else
                    fs.accessSync(sslDir, fs.constants.W_OK)
                debug("Config.getConfiguration: secretsfile permissions are OK " + secretsfile);
                Config.secret = Config.getSecret(secretsfile)
            } catch (err) {
                let msg = "Secrets file " + secretsfile + " or parent directory is not writable! No registration possible!(cwd: " + process.cwd() + ")"
                log.log(LogLevelEnum.error, msg)

                debug("secretsfile=" + secretsfile + " ssldir = " + Config.sslDir)
                throw (new Error(msg))
            }
        }

        if (!Config.config)
            new Config().readYaml();
        if (Config.config) {
            Config.config.version = (Config.config.version ? Config.config.version : CONFIG_VERSION)
            Config.config.mqttbasetopic = (Config.config.mqttbasetopic ? Config.config.mqttbasetopic : "modbus2mqtt");
            Config.config.mqttdiscoveryprefix = (Config.config.mqttdiscoveryprefix ? Config.config.mqttdiscoveryprefix : "homeassistant");
            Config.config.mqttdiscoverylanguage = (Config.config.mqttdiscoverylanguage ? Config.config.mqttdiscoverylanguage : "en");
            if (!Config.config.mqttconnect)
                Config.config.mqttconnect = {}
            Config.updateMqttTlsConfig(Config.config)

            Config.config.mqttconnect.connectTimeout = (Config.config.mqttconnect.connectTimeout ? Config.config.mqttconnect.connectTimeout : 60 * 1000);
            Config.config.mqttconnect.clientId = (Config.config.mqttconnect.clientId ? Config.config.mqttconnect.clientId : "modbus2mqtt")
            Config.config.mqttconnect.clean = (Config.config.mqttconnect.clean ? Config.config.mqttconnect.clean : true)
            Config.config.httpport = (Config.config.httpport ? Config.config.httpport : 3000);
            Config.config.fakeModbus = (Config.config.fakeModbus ? Config.config.fakeModbus : false);
            Config.config.filelocation = (Config.config.filelocation ? Config.config.filelocation : "/data/local");
            Config.busses = (Config.busses && Config.busses.length > 0 ? Config.busses : []);
            Config.config.hassiotoken = (process.env.HASSIO_TOKEN && process.env.HASSIO_TOKEN.length ? process.env.HASSIO_TOKEN : undefined)
            Config.config.mqttusehassiotoken = (Config.config.mqttusehassiotoken && Config.config.hassiotoken ? Config.config.mqttusehassiotoken : Config.config.hassiotoken != undefined && Config.config.hassiotoken.length > 0);
        }
        else {
            log.log(LogLevelEnum.notice, "No config file found ")
            Config.config = structuredClone(Config.newConfig)
            Config.busses = [];
        }
        return structuredClone(Config.config);
    }

    async readGetResponse(res: http.IncomingMessage): Promise<any> {

        return new Promise<any>((resolve, reject) => {
            let lbuffers: Uint8Array[] = [];
            res.on('data', chunk => lbuffers.push(chunk))
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode < 299) {
                        let lbuffer = Buffer.concat(lbuffers);
                        let json = JSON.parse(lbuffer.toString());
                        resolve(json);
                    }
                    else {
                        // http Error
                        reject(lbuffers)
                    }
                } catch (e: any) { reject(e) }
            })
        })
    }
    listDevicesUdev(next: (devices: string[]) => void, reject: (error: any) => void): void {

        SerialPort.list().then((portInfo) => {
            log.log(LogLevelEnum.notice, JSON.stringify(portInfo))
            let devices: string[] = []
            portInfo.forEach(port => {
                devices.push(port.path);
            })
            next(devices);
        }).catch((error) => {
            reject(error);
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
            }
            catch (e) {
                next([]);
            }
        }
    }
    listDevicesHassio(next: (devices: string[]) => void, reject: (error: any) => void): void {
        let hassiotoken: string | undefined = Config.getConfiguration().hassiotoken
        if (!hassiotoken || hassiotoken.length == 0)
            throw new Error("ENV: HASSIO_TOKEN not defined")

        let options: http.RequestOptions = {
            headers: {
                authorization: "Bearer " + hassiotoken,
                accept: "application/json"
            },
            hostname: 'supervisor',
            port: 80,
            path: '/hardware/info',
            method: 'GET'
        }
        let body: string = "";
        http.request(options).on('data', (chunk: string) => {
            body.concat(chunk);
            this.grepDevices(body)
        }).on('end', () => {
            var devices = this.grepDevices(body)
            if (devices)
                next(devices)
            else
                reject("No readable serial device found in add on")
            // at this point, `body` has the entire request body stored in it as a string
        });
    }
    private grepDevices(body: string): string[] {
        var bodyObject: any = JSON.parse(body)
        var devices: any[] = bodyObject.data.devices;
        var rc: string[] = []
        devices.forEach(device => {
            if (device.subsystem === "tty")
                try {
                    fs.accessSync(device.dev_path, fs.constants.R_OK)
                    rc.push(device.dev_path)
                }
                catch (error) {
                    log.log(LogLevelEnum.error, "Permission denied for read serial device %s", device.dev_path)
                }
        });
        return rc;
    }
    validateHassioToken(hassiotoken: string, next: () => void, reject: () => void): void {
        if (!hassiotoken || hassiotoken.length == 0)
            throw new Error("ENV: HASSIO_TOKEN not defined")

        let options: http.RequestOptions = {
            headers: {
                authorization: "Bearer " + hassiotoken,
                accept: "application/json"
            },
            hostname: 'supervisor',
            port: 80,
            path: '/auth',
            method: 'GET'
        }
        this.getRequest(options, (res) => {
            if (res.statusCode! >= 200 && res.statusCode! < 300)
                next()
            else
                reject()
        })
    }
    private static readCertfile(filename?: string): string | undefined {
        if (filename && Config.sslDir) {
            let fn = join(Config.sslDir, filename)
            if (fs.existsSync(fn))
                return fs.readFileSync(fn, { encoding: 'utf8' }).toString()
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
        return new Promise<ImqttClient>(
            (resolve, reject) => {
                try {
                    let hassiotoken = process.env.HASSIO_TOKEN
                    if (!hassiotoken || hassiotoken.length == 0) {
                        reject(new Error("ENV: HASSIO_TOKEN not defined"))
                        return
                    }
                    debugAddon("getMqttLoginFromHassio: try to read MQTTLogin from Hassio")


                    let options: http.RequestOptions = {
                        headers: {
                            authorization: "Bearer " + hassiotoken,
                            accept: "application/json"
                        },
                        hostname: 'supervisor',
                        port: 80,
                        path: '/services/mqtt',
                        method: 'GET'
                    }
                    this.getRequest(options, (res) => {
                        this.readGetResponse(res).then((mqtt) => {
                            let config = Config.getConfiguration()
                            config.mqttconnect = mqtt
                            if (mqtt.ssl)
                                Config.updateMqttTlsConfig(config)
                            delete (config.mqttconnect as any).ssl
                            delete (config.mqttconnect as any).protocol
                            delete (config.mqttconnect as any).addon
                            debugAddon("getMqttLoginFromHassio: Read MQTT login data from Hassio")

                            resolve(config.mqttconnect)
                        }, reject)
                    })
                }
                catch (e: any) {
                    debugAddon("getMqttLoginFromHassio: failed to read MQTT login data from Hassio " + e.message)
                    reject(e);
                }
            })
    }

    async getMqttConnectOptions(): Promise<ImqttClient> {
        return new Promise<ImqttClient>((resolve, reject) => {
            let config = Config.getConfiguration()
            if (config.mqttusehassiotoken) {
                this.getMqttLoginFromHassio().then((mqttFromHassio) => {
                    resolve(mqttFromHassio);
                }, (reason) => {
                    reject(reason)
                })
            }
            else {
                let config = Config.getConfiguration()
                Config.updateMqttTlsConfig(config)
                if (!Config.config.mqttconnect.mqttserverurl)
                    reject("Configuration problem: no mqttserverurl defined")
                else if (!Config.config.mqttconnect.username)
                    reject("Configuration problem: no mqttuser defined")
                else if (!Config.config.mqttconnect.password)
                    reject("Configuration problem: no mqttpassword defined")
                else
                    resolve(Config.getConfiguration().mqttconnect);
            }
        })
    }

    // set the base file for relative includes
    readYaml(): void {
        try {
            if (!Config.yamlDir || Config.yamlDir.length == 0) {
                log.log(LogLevelEnum.error, "Yamldir not defined in command line")
            }
            if (!fs.existsSync(Config.yamlDir)) {
                log.log(LogLevelEnum.notice, "configuration directory  not found " + process.cwd() + "/" + Config.yamlDir);
                Config.config = structuredClone(Config.newConfig);
                Config.busses = [];
                return;
            }
            debug("yamlDir: " + Config.yamlDir + " " + process.argv.length);

            var yamlFile = Config.getConfigPath();

            if (!fs.existsSync(yamlFile)) {
                log.log(LogLevelEnum.notice, "configuration file  not found " + yamlFile);
                Config.config = structuredClone(Config.newConfig);
            }
            else {
                var secretsFile = Config.yamlDir + "/local/secrets.yaml";
                var src: string = fs.readFileSync(yamlFile, { encoding: 'utf8' });
                if (fs.existsSync(secretsFile)) {
                    var matches: RegExpMatchArray | null = null;
                    var secrets = parse(fs.readFileSync(secretsFile, { encoding: 'utf8' }));
                    do {
                        matches = src.match(/("*!secret \S*"*)/);
                        if (matches)
                            for (let match of matches!) {
                                let pt = match.split(" ");
                                if (pt.length == 2) {
                                    let pos = -1;
                                    do {
                                        pos = pt[1].indexOf('"');
                                        if (pos >= 0)
                                            pt[1] = pt[1].slice(0, pos);
                                    } while (pos >= 0);
                                    if (secrets[pt[1]] && -1 == secrets[pt[1]].indexOf("!secret "))
                                        src = src.replace(match, '"' + secrets[pt[1]] + '"');
                                    else {
                                        if (!secrets[pt[1]]) {
                                            debug("no entry in secrets file for " + pt[1]);
                                            throw new Error("no entry in secrets file for " + pt[1]);
                                        }
                                        else {
                                            debug("secrets file entry contains !secret for " + pt[1]);
                                            throw new Error("secrets file entry contains !secret for " + pt[1]);
                                        }
                                    }

                                }
                            }
                    } while (matches);
                }
                Config.config = parse(src);
                if (Config.yamlDir.length)
                    Config.config.filelocation = Config.yamlDir;

                this.getMqttConnectOptions().then((mqttLoginData) => {
                    this.mqttLoginData = mqttLoginData;
                }).catch((reason => {
                    log.log(LogLevelEnum.error, "Unable to connect to mqtt " + reason)
                }))
            }
            Config.busses = [];
            let busDir = Config.yamlDir + "/local/busses"
            let oneBusFound = false;
            if (fs.existsSync(busDir)) {
                let busDirs: fs.Dirent[] = fs.readdirSync(busDir, { withFileTypes: true });
                busDirs.forEach(de => {
                    if (de.isDirectory() && de.name.startsWith("bus.")) {
                        let busid = Number.parseInt(de.name.substring(4))
                        let busYaml = join(de.path, de.name, "bus.yaml");
                        let connectionData: IModbusConnection;
                        if (fs.existsSync(busYaml)) {
                            var src: string = fs.readFileSync(busYaml, { encoding: 'utf8' });
                            connectionData = parse(src);
                            Config.busses.push({ busId: busid, connectionData: connectionData, slaves: [] })
                            oneBusFound = true;
                            let devFiles: string[] = fs.readdirSync(Config.yamlDir + "/local/busses/" + de.name);
                            devFiles.forEach(function (file: string) {
                                if (file.endsWith(".yaml") && file !== "bus.yaml") {
                                    var src: string = fs.readFileSync(Config.yamlDir + "/local/busses/" + de.name + "/" + file, { encoding: 'utf8' });
                                    var o: Islave = parse(src);
                                    Config.busses[Config.busses.length - 1].slaves.push(o);
                                }
                            });
                        }
                    }
                })
            }
            if (!oneBusFound)
                Config.addBusProperties({ serialport: "/dev/ttyACM0", timeout: BUS_TIMEOUT_DEFAULT, baudrate: 9600 });
            debug("config: busses.length: " + Config.busses.length);
        }
        catch (error: any) {
            log.log(LogLevelEnum.error, "readyaml failed: " + error.message);
            throw error;
            // Expected output: ReferenceError: nonExistentFunction is not defined
            // (Note: the exact output may be browser-dependent)
        }
    }

    async filterAllslaves<T>(busid: number, specFunction: <T>(slave: Islave) => Set<T> | any): Promise<Set<T>> {
        let addresses = new Set<T>();
        for (let slave of Config.busses[busid].slaves) {

            for (let addr of specFunction(slave))
                addresses.add(addr);
        }
        return addresses;
    }


    triggerMqttPublishSlave(busid: number, slave: Islave) {
        if (this.mqttLoginData)
            new MqttDiscover(this.mqttLoginData, Config.config.mqttdiscoverylanguage).triggerPoll(busid, slave);
    }

    deleteSlave(busid: number, slaveid: number) {
        let bus = Config.busses.find(bus => bus.busId == busid)
        if (bus != undefined) {
            debug("DELETE /slave slaveid" + busid + "/" + slaveid + " number of slaves: " + bus.slaves.length);
            let found = false;
            for (let idx = 0; idx < bus.slaves.length; idx++) {
                let dev = bus.slaves[idx];

                if (dev.slaveid === slaveid) {
                    found = true;
                    if (fs.existsSync(this.getslavePath(busid, dev)))
                        fs.unlink(this.getslavePath(busid, dev), (err) => {
                            if (err)
                                debug(err);
                        });
                    bus.slaves.splice(idx, 1);
                    let mqd = new MqttDiscover(Config.config.mqttconnect)
                    mqd.deleteSlave(bus.busId, slaveid)
                    debug("DELETE /slave finished " + slaveid + " number of slaves: " + bus.slaves.length);
                    return;
                }
            }
            if (!found)
                debug("slave not found for deletion " + slaveid);

        }
        else {
            let msg = "Unable to delete slave. Check server log for details"
            log.log(LogLevelEnum.error, msg + " busid " + busid + " not found")

            throw new Error(msg)
        }
    }
    writeConfiguration(config: Iconfiguration) {

        let cpConfig = structuredClone(config);
        Config.config = config;
        let secrets = {};
        if (cpConfig.mqttconnect.password) {
            (secrets as any)['mqttpassword'] = cpConfig.mqttconnect.password;
            cpConfig.mqttconnect.password = "!secret mqttpassword";
        }
        if (cpConfig.mqttconnect.username) {
            (secrets as any)['mqttuser'] = cpConfig.mqttconnect.username;
            cpConfig.mqttconnect.username = "!secret mqttuser";
        }
        if (cpConfig.githubPersonalToken) {
            (secrets as any)['githubPersonalToken'] = cpConfig.githubPersonalToken;
            cpConfig.githubPersonalToken = "!secret githubPersonalToken";
        }
        if (cpConfig.username) {
            (secrets as any)['username'] = cpConfig.username;
            cpConfig.username = "!secret username";
        }
        if (cpConfig.password) {
            (secrets as any)['password'] = cpConfig.password;
            cpConfig.password = "!secret password";
        }
        let filename = Config.getConfigPath();
        let dir = path.dirname(filename);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        let s = stringify(cpConfig);
        fs.writeFileSync(filename, s, { encoding: 'utf8' });
        s = stringify(secrets);
        fs.writeFileSync(this.getSecretsPath(), s, { encoding: 'utf8' });
    }

    writeslave(busid: number, slaveid: number, specification: string | undefined, name?: string, polInterval?: number): Islave {
        // Make sure slaveid is unique
        let slave: Islave = {
            slaveid: slaveid,
            specificationid: specification,
            name: name,
            polInterval: polInterval
        }
        let oldFilePath = this.getslavePath(busid, slave);
        let filename = Config.getFileNameFromSlaveId(slave.slaveid);
        let newFilePath = this.getslavePath(busid, slave);
        let dir = path.dirname(newFilePath);
        if (!fs.existsSync(dir))
            try { fs.mkdirSync(dir, { recursive: true }) }
            catch (e) {
                debug("Unable to create directory " + dir + " + e");
                throw e;
            }
        let s = stringify(slave);
        fs.writeFileSync(newFilePath, s, { encoding: 'utf8' });
        if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath))
            fs.unlink(oldFilePath, (err: any) => {
                debug("writeslave: Unable to delete " + oldFilePath + " " + err);
            });

        if (specification) {
            if (specification == "_new")
                new ConfigSpecification().deleteNewSpecificationFiles();
            else {
                let spec = ConfigSpecification.getSpecificationByFilename(specification)
                this.triggerMqttPublishSlave(busid, slave);
                slave.specification = spec
            }
        } else
            debug("No Specification found for slave: " + filename + " specification: " + slave.specificationid)
        return slave;
    }
    getslavePath(busid: number, slave: Islave): string {
        return Config.yamlDir + "/local/busses/bus." + busid + "/s" + slave.slaveid + ".yaml"
    }
    static getConfigPath() {
        return Config.yamlDir + "/local/modbus2mqtt.yaml";
    }
    getSecretsPath() {
        return Config.yamlDir + "/local/secrets.yaml";
    }

    static getSlave(busid: number, slaveid: number): Islave | undefined {
        if (Config.busses.length <= busid) {
            debug("Config.getslave: unknown bus")
            return undefined;
        }
        let rc = Config.busses[busid].slaves.find(dev => { return dev.slaveid === slaveid });
        if (!rc)
            debug("slaves.length: " + Config.busses[busid].slaves.length)
        for (let dev of Config.busses[busid].slaves) {
            debug(dev.name);
        }
        return rc;
    }
    static getslaveBySlaveId(busid: number, slaveId: number) {
        let rc = Config.busses[busid].slaves.find(dev => { return dev.slaveid === slaveId });
        return rc;
    }


    static setFakeModbus(newMode: boolean) {
        Config.config.fakeModbus = newMode;
    }
    static getFileNameFromSlaveId(slaveid: number): string {
        return "s" + slaveid;
    }


}
export function getSpecificationImageOrDocumentUrl(rootUrl: string | undefined, specName: string, url: string): string {
    let fn = getBaseFilename(url)
    let rc: string = ""
    if (rootUrl) {
        let append = '/'
        if (rootUrl.endsWith('/'))
            append = ''
        rc = rootUrl + append + join(filesUrlPrefix, specName, fn);
    }
    else
        rc = "/" + join(filesUrlPrefix, specName, fn);

    return rc;
}


