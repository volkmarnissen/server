import { Config } from './config';
import { HttpServer } from './httpserver';
import { Bus } from './bus';
import { Command } from 'commander'
import { VERSION } from 'ts-node';
import { LogLevelEnum, Logger } from 'specification';
import * as os from 'os'

import Debug from "debug"
import { MqttDiscover } from './mqttdiscover.js';
import { ConfigSpecification } from 'specification';
import path = require('path');

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

    init() {
        let cli = new Command()
        cli.version(VERSION)
        cli.usage("[--ssl <ssl-dir>][--config <config-dir>]")
        cli.option("-s, --ssl <ssl-dir>", "set directory for certificates")
        cli.option("-c, --config <config-dir>", "set directory for add on configuration")
        cli.option("-y, --yaml <yaml-dir>", "set directory for add on configuration")
        cli.parse(process.argv)
        let options = cli.opts()
        if (options['yaml']){
            Config.yamlDir = options['yaml']
            ConfigSpecification.yamlDir = options['yaml']
        }else{
            Config.yamlDir ="."
            ConfigSpecification.yamlDir="."
        }
            
        if (options['ssl'])
            Config.sslDir = options['ssl']
        else
            Config.sslDir = "."

        readConfig = new Config();
        readConfig.readYaml();
        new ConfigSpecification().readYaml()
        debug(Config.getConfiguration().mqttconnect.mqttserverurl);
        let angulardir = require.resolve("angular")
        let angulardirLang = path.parse(angulardir).dir
        angulardir = path.parse(angulardirLang).dir
        let httpServer = new HttpServer(angulardir);
        debugAction("readBussesFromConfig starts")
        Bus.readBussesFromConfig()
        debugAction("readBussesFromConfig done")
        debug("Inititialize busses done")

        //execute every 30 minutes
        setInterval(() => {
            debug("start new interval")
            debugAction("readBussesFromConfig starts")
            Bus.readBussesFromConfig()
        }, 30 * 1000 * 60)
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
