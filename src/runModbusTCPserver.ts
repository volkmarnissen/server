import { Command } from 'commander'
import { addRegisterValue, clearRegisterValues, logValues, runModbusServer } from './modbusTCPserver'
import { VERSION } from 'ts-node'
import * as fs from 'fs'
import { join } from 'path'
import { parse } from 'yaml'
import { ConfigSpecification, IfileSpecification, Logger, LogLevelEnum, M2mGitHub, Migrator } from '@modbus2mqtt/specification'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import Debug from 'debug'
import { IBus, IModbusConnection, ITCPConnection } from '@modbus2mqtt/server.shared'
import { Config } from './config'
const debug = Debug('modbusTCPserver')
const log = new Logger('modbusTCPserver')

export function startModbusTCPserver(yamlDir: string, busId: number, port:number) {
  debug('starting')
  let gh = new M2mGitHub(
    null,
    join(yamlDir, 'public')
  )
  gh.init().then(()=>{
    clearRegisterValues()
    let directoryBus = join(yamlDir, 'local/busses/bus.' + busId)
    let directoryPublicSpecs = join(yamlDir, 'public/specifications')
    let directoryLocalSpecs = join(yamlDir, 'local/specifications')
    if( !fs.existsSync(directoryBus )){
      log.log(LogLevelEnum.error,"Unable to start TCP server: Bus directory not found " + directoryBus )
      return
    }
    console.log('read bus' + directoryBus)
    let files = fs.readdirSync(directoryBus)
    files.forEach((slaveFileName) => {
      if (slaveFileName == 'bus.yaml') {
        let content = fs.readFileSync(join(directoryBus, slaveFileName), {
          encoding: 'utf8',
        })
        let connection: IModbusConnection = parse(content.toString())
      }
  
      if (slaveFileName.startsWith('s'))
        try {
          console.log('read slave' + slaveFileName)
          let content = fs.readFileSync(join(directoryBus, slaveFileName), {
            encoding: 'utf8',
          })
          let slave = parse(content.toString())
          let slaveid = slave.slaveid
          let specFilename = slave.specificationid
          if (specFilename) {
            let fn = join(directoryLocalSpecs, specFilename + '.yaml')
            if (!fs.existsSync(fn)) fn = join(directoryPublicSpecs, specFilename + '.yaml')
            if (!fs.existsSync(fn)) console.log('TCP Server: Spec file not found: ' + fn)
            else {
              content = fs.readFileSync(fn, { encoding: 'utf8' })
              let spec: IfileSpecification = parse(content.toString())
              spec = new Migrator().migrate(spec)
              if (spec.testdata) {
                let testdata = spec.testdata
                if (spec.testdata.analogInputs)
                  spec.testdata.analogInputs.forEach((avp) => {
                    let a = avp.address
                    if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.AnalogInputs, avp.value)
                  })
                if (spec.testdata.holdingRegisters)
                  spec.testdata.holdingRegisters.forEach((avp) => {
                    let a = avp.address
                    if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.HoldingRegister, avp.value)
                  })
                if (spec.testdata.coils)
                  spec.testdata.coils.forEach((avp) => {
                    let a = avp.address
                    if (avp.value != undefined) addRegisterValue(slaveid, a, ModbusRegisterType.Coils, avp.value)
                  })
              }
            }
          }
        //  logValues()
        } catch (e: any) {
          console.error('Unable to read  directory for ' + e)
        }
    })
    runModbusServer(port)
  }).catch((e:any)=>{
    log.log(LogLevelEnum.error,"Failed to init github: " + e.message)
  })

}


let cli = new Command()
cli.version(VERSION)
cli.usage('--yaml <yaml-dir> --port <TCP port> --busid <buis id number>')
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
let port = 502
if (options['port']) {
  port = parseInt(options['port'])
}
if (options['busid']) 
    startModbusTCPserver(ConfigSpecification.yamlDir, parseInt(options['busid']), port) 
else
    log.log(LogLevelEnum.error,"Unable to start Modbus TCP server invalid argument: " + options['busid'] )

