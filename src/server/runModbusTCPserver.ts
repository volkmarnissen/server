import { Command } from 'commander'
import { VERSION } from 'ts-node'
import { ConfigSpecification, Logger, LogLevelEnum } from '../specification'
import Debug from 'debug'
import { Config } from './config'
import process from 'process'
import { startModbusTCPserver } from './modbusTCPserver'
const debug = Debug('modbusTCPserver')
const log = new Logger('modbusTCPserver')

let cli = new Command()
cli.version(VERSION)
cli.usage('--yaml <yaml-dir> --busid <buis id number>')
cli.option('-y, --yaml <yaml-dir>', 'set directory for add on configuration')
cli.option('-b, --busid <busid>', 'starts Modbus TCP server for the given yaml-dir and bus')
cli.parse(process.argv)
let options = cli.opts()
if (options['yaml']) {
  Config.yamlDir = options['yaml']
  ConfigSpecification.yamlDir = options['yaml']
} else {
  Config.yamlDir = '.'
  ConfigSpecification.yamlDir = '.'
}
if (options['busid']) {
  startModbusTCPserver(ConfigSpecification.yamlDir, parseInt(options['busid']))
} else log.log(LogLevelEnum.error, 'Unable to start Modbus TCP server invalid argument: ' + options['busid'])
