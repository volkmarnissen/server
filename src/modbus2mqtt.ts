import { Config } from './config';
import { HttpServer } from './httpserver';
import { Bus } from './bus';
import { Command } from 'commander'
import { VERSION } from 'ts-node';
import { LogLevelEnum, Logger, M2mGitHub, M2mSpecification } from '@modbus2mqtt/specification';
import * as os from 'os'

import Debug from "debug"
import { MqttDiscover } from './mqttdiscover.js';
import { ConfigSpecification } from '@modbus2mqtt/specification';
import path from 'path';
import { startModbusTCPserver } from './runModbusTCPserver';
import { SpecificationStatus } from '@modbus2mqtt/specification.shared';
import { join } from 'path';

const debug = Debug("modbus2mqtt");
const debugAction = Debug('actions')
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            MODBUS_NOPOLL: string | undefined;
        }
    }
}
//var modbusConfiguration;
let readConfig: Config;
const log = new Logger('modbus2mqtt')
export class Modbus2Mqtt {
    pollTasks() {
        debugAction("readBussesFromConfig starts")
        Bus.readBussesFromConfig()
        if (Config.getConfiguration().githubPersonalToken)
            new ConfigSpecification().filterAllSpecifications(spec => {
                if (spec.status == SpecificationStatus.contributed && spec.pullNumber != undefined) {
                    new M2mSpecification(spec).startPolling((e) => {
                        log.log(LogLevelEnum.error, e.message)
                    })
                }
            })

    }
    init() {
        let cli = new Command()
        cli.version(VERSION)
        cli.usage("[--ssl <ssl-dir>][--yaml <yaml-dir>][ --port <TCP port>]")
        cli.option("-s, --ssl <ssl-dir>", "set directory for certificates")
        cli.option("-y, --yaml <yaml-dir>", "set directory for add on configuration")
        cli.option("-b, --busid <busid>", "starts Modbus TCP server for the given bus")
        cli.parse(process.argv)
        let options = cli.opts()
        if (options['yaml']) {
            Config.yamlDir = options['yaml']
            ConfigSpecification.yamlDir = options['yaml']
        } else {
            Config.yamlDir = "."
            ConfigSpecification.yamlDir = "."
        }

        if (options['ssl'])
            Config.sslDir = options['ssl']
        else
            Config.sslDir = "."
        if (options['busid'])
            startModbusTCPserver(Config.yamlDir, parseInt(options['busid']))
        readConfig = new Config();
        readConfig.readYaml();
        new ConfigSpecification().readYaml()
        ConfigSpecification.setMqttdiscoverylanguage(Config.getConfiguration().mqttdiscoverylanguage, Config.getConfiguration().githubPersonalToken)
        debug(Config.getConfiguration().mqttconnect.mqttserverurl);
        let angulardir = require.resolve("@modbus2mqtt/angular")
        log.log(LogLevelEnum.notice, "module dir: " + angulardir)
        let angulardirLang = path.parse(angulardir).dir
        angulardir = path.parse(angulardirLang).dir
        log.log(LogLevelEnum.notice, "http root : " + angulardir)
        let gh = new M2mGitHub(Config.getConfiguration().githubPersonalToken ? Config.getConfiguration().githubPersonalToken! : null, join(ConfigSpecification.yamlDir, "public"))

        let httpServer = new HttpServer(angulardir);
        debugAction("readBussesFromConfig starts")
        gh.init().then(() => {
            this.pollTasks()
            debugAction("readBussesFromConfig done")
            debug("Inititialize busses done")
            //execute every 30 minutes
            setInterval(() => {
                this.pollTasks()
            }, 30 * 1000 * 60)
        })
        httpServer.init();
        httpServer.app.listen(Config.getConfiguration().httpport, () => {
            log.log(LogLevelEnum.notice, `modbus2mqtt listening on  ${os.hostname()}: ${Config.getConfiguration().httpport}`)
            let config = Config.getConfiguration()

            if (process.env.MODBUS_NOPOLL != undefined) {
                let md = new MqttDiscover(config.mqttconnect, config.mqttdiscoverylanguage)
                md.startPolling((error: any) => {
                    log.log(LogLevelEnum.error, error.message)
                })

            }
        });
    }
}
let m = new Modbus2Mqtt();
m.init();


//module.exports = {connectMqtt, init}
