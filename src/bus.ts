import Debug from 'debug'
import {
  getSpecificationI18nName,
  ImodbusEntity,
  ImodbusSpecification,
  SpecificationStatus,
} from '@modbus2mqtt/specification.shared'
import { ImodbusAddress, ModbusTasks } from '@modbus2mqtt/server.shared'
import { IdentifiedStates } from '@modbus2mqtt/specification.shared'
import { ConverterMap, ImodbusValues, M2mSpecification } from '@modbus2mqtt/specification'
import { ConfigBus } from './configbus'
import * as fs from 'fs'
import { IfileSpecification } from '@modbus2mqtt/specification'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import {
  Islave,
  IModbusConnection,
  IBus,
  IRTUConnection,
  ITCPConnection,
  IidentificationSpecification,
} from '@modbus2mqtt/server.shared'
import { ConfigSpecification } from '@modbus2mqtt/specification'
import { Config } from './config'
import { ModbusTcpRtuBridge } from './tcprtubridge'
import { MqttPoller } from './mqttpoller'
import { MqttConnector } from './mqttconnector'
import { IconsumerModbusAPI, IModbusConfiguration, ModbusAPI } from './ModbusAPI'
const debug = Debug('bus')
const log = new Logger('bus')
export interface IModbusResultWithDuration {
  data: number[]
  duration?: number
}
export class Bus implements IModbusConfiguration {
  private static busses: Bus[] | undefined = undefined
  private static allSpecificationsModbusAddresses: Set<ImodbusAddress> | undefined = undefined
  static stopBridgeServers(): void {
    Bus.getBusses().forEach((bus) => {
      if (bus.tcprtuBridge) bus.tcprtuBridge.stopServer()
    })
  }
  static readBussesFromConfig(): Promise<PromiseSettledResult<void>[]> {
    let promisses: Promise<void>[] = []
    let ibs = ConfigBus.getBussesProperties()
    if (!Bus.busses) Bus.busses = []
    ibs.forEach((ib) => {
      let bus = Bus.busses!.find((bus) => bus.getId() == ib.busId)
      if (bus !== undefined) bus.properties = ib
      else {
        let b = new Bus(ib)
        promisses.push(b.modbusAPI.initialConnect())
        b.getSlaves().forEach((s) => {
          s.evalTimeout = true
        })
        Bus.busses!.push(b)
      }
    })
    // delete removed busses
    for (let idx = 0; idx < Bus.busses!.length; idx++) {
      if (!ibs.find((ib) => ib.busId == Bus.busses![idx].properties.busId)) Bus.busses!.splice(idx, 1)
    }
    return Promise.allSettled(promisses)
  }
  getName(): string {
    let rtu = this.properties.connectionData as IRTUConnection
    let tcp = this.properties.connectionData as ITCPConnection
    if (undefined != rtu.serialport) return rtu.serialport
    if (undefined != tcp.host) return tcp.host + ':' + tcp.port
    return 'unknown'
  }
  static getBusses(): Bus[] {
    //if (!Bus.busses || Bus.busses.length != ConfigBus.getBussesProperties().length) {
    //  Bus.readBussesFromConfig()
    //}
    //debug("getBusses Number of busses:" + Bus.busses!.length)
    return Bus.busses!
  }
  static addBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('addBus()')
      let busP = ConfigBus.addBusProperties(connection)
      let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
      if (b == undefined)
        Bus.readBussesFromConfig()
          .then(() => {
            let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
            if (b != undefined)
              b.modbusAPI
                .initialConnect()
                .then(() => {
                  resolve(b!)
                })
                .catch(reject)
          })
          .catch(reject)
      else
        b.modbusAPI
          .initialConnect()
          .then(() => {
            resolve(b!)
          })
          .catch(reject)
    })
  }

  private connectionChanged(connection: IModbusConnection): boolean {
    let rtu = this.properties.connectionData as IRTUConnection
    if (rtu.serialport) {
      let connectionRtu = connection as IRTUConnection
      if (!connectionRtu.serialport || connectionRtu.serialport !== rtu.serialport) return true
      if (!connectionRtu.baudrate || connectionRtu.baudrate !== rtu.baudrate) return true
      if (!connectionRtu.timeout || connectionRtu.timeout !== rtu.timeout) return true
      if (connectionRtu.tcpBridge !== rtu.tcpBridge) return true
      return false
    } else {
      let tcp = this.properties.connectionData as ITCPConnection
      let connectionTcp = connection as ITCPConnection
      if (!connectionTcp.host || connectionTcp.host !== tcp.host) return true
      if (!connectionTcp.port || connectionTcp.port !== tcp.port) return true
      if (!connectionTcp.timeout || connectionTcp.timeout !== tcp.timeout) return true
      return false
    }
  }
  private startTcpRtuBridge(port: number = ModbusTcpRtuBridge.getDefaultPort()) {
    this.tcprtuBridge = new ModbusTcpRtuBridge(this.modbusAPI.getQueue())
    this.tcprtuBridge.startServer().catch((e) => {
      log.log(LogLevelEnum.error, 'Unable to start Server : ' + e.message)
    })
  }

  updateBus(connection: IModbusConnection): Promise<Bus> {
    return new Promise<Bus>((resolve, reject) => {
      debug('updateBus()')
      if (this.connectionChanged(connection)) {
        let fct = () => {
          if ((connection as IRTUConnection).tcpBridge) this.startTcpRtuBridge()
        }
        if (this.tcprtuBridge && this.tcprtuBridge.serverTCP) this.tcprtuBridge.stopServer(fct)
        else fct()

        let busP = ConfigBus.updateBusProperties(this.properties, connection)
        let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
        if (b) {
          b.properties = busP
          // Change of bus properties can influence the modbus data
          // E.g. set of lower timeout can lead to error messages
          b.modbusAPI
            .reconnectRTU('updateBus')
            .then(() => {
              resolve(b)
            })
            .catch(reject)
        } else reject('Bus does not exist')
      } else resolve(this)
    })
  }
  static deleteBus(busid: number) {
    let idx = Bus.getBusses().findIndex((b) => b.properties.busId == busid)
    if (idx >= 0) {
      Bus.getBusses().splice(idx, 1)
      ConfigBus.deleteBusProperties(busid)
    }
  }
  static getBus(busid: number): Bus | undefined {
    // debug("getBus()")
    if (Bus.getBusses() == undefined) return undefined
    return Bus.getBusses().find((b) => b.properties.busId == busid)
  }

  properties: IBus
  private tcprtuBridge: ModbusTcpRtuBridge | undefined
  private modbusAPI: ModbusAPI
  constructor(ibus: IBus) {
    this.properties = ibus
    this.modbusAPI = new ModbusAPI(this)
    if ((ibus.connectionData as IRTUConnection).tcpBridge) {
      this.startTcpRtuBridge()
    }
  }
  getModbusAPI(): IconsumerModbusAPI {
    return this.modbusAPI
  }
  getSlaveTimeoutBySlaveId(slaveid: number): number {
    let slave = this.getSlaveBySlaveId(slaveid)
    if (slave) if (slave.modbusTimout != undefined) return slave.modbusTimout
    return this.properties.connectionData.timeout
  }
  getModbusConnection(): IModbusConnection {
    return this.properties.connectionData
  }
  getId(): number {
    return this.properties.busId
  }
  deleteSlave(slaveid: number) {
    ConfigBus.deleteSlave(this.properties.busId, slaveid)
  }
  static getModbusAddressesForSpec(spec: IfileSpecification, addresses: Set<ImodbusAddress>): void {
    for (let ent of spec.entities) {
      let converter = ConverterMap.getConverter(ent)
      if (ent.modbusAddress != undefined && converter && ent.registerType)
        for (let i = 0; i < converter.getModbusLength(ent); i++) {
          addresses.add({
            address: ent.modbusAddress + i,
            registerType: ent.registerType,
          })
        }
    }
  }
  private static updateAllSpecificationsModbusAddresses(specificationid: string | null) {
    let cfg = new Config()
    // If a used specificationid was deleted, remove it from slaves
    if (specificationid != null) {
      new ConfigSpecification().filterAllSpecifications((spec) => {
        if (spec.filename == specificationid) specificationid = null
      })
      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          debug('updateAllSpecificationsModbusAddresses slaveid: ' + slave.slaveid)
          if (specificationid == null) slave.specificationid = undefined
          else slave.specificationid = specificationid
          if (slave.specificationid == specificationid) ConfigBus.writeslave(bus.getId(), slave)
        })
      })
    }
    Bus.allSpecificationsModbusAddresses = new Set<ImodbusAddress>()
    new ConfigSpecification().filterAllSpecifications((spec) => {
      Bus.getModbusAddressesForSpec(spec, Bus.allSpecificationsModbusAddresses!)
    })
  }
  /*
   * returns cached set of all modbusaddresses for all specifications.
   * It will be updated after any change to Config.specifications array
   */
  private static getModbusAddressesForAllSpecs(): Set<ImodbusAddress> {
    debug('getAllModbusAddresses')
    if (!Bus.allSpecificationsModbusAddresses) {
      Bus.updateAllSpecificationsModbusAddresses(null)
      // Config.getSpecificationsChangedObservable().subscribe(Bus.updateAllSpecificationsModbusAddresses)
    }
    return Bus.allSpecificationsModbusAddresses!
  }

  /*
   * getAvailableSpecs uses bus.slaves cache if possible
   */
  getAvailableSpecs(slaveid: number, showAllPublicSpecs: boolean, language: string): Promise<IidentificationSpecification[]> {
    return new Promise<IidentificationSpecification[]>((resolve, reject) => {
      let addresses = Bus.getModbusAddressesForAllSpecs()

      let rcf = (ispecs: IidentificationSpecification[], modbusData: ImodbusValues): void => {
        let slave = this.getSlaveBySlaveId(slaveid)
        let cfg = new ConfigSpecification()
        cfg.filterAllSpecifications((spec) => {
          let mspec = M2mSpecification.fileToModbusSpecification(spec, modbusData)
          debug('getAvailableSpecs')
          if (mspec) {
            // list only identified public specs, but all local specs
            // Make sure the current configured specification is in the list
            if (
              [SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status) &&
              (showAllPublicSpecs ||
                (slave && slave.specificationid == mspec.filename) ||
                mspec.identified == IdentifiedStates.identified)
            )
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
            else if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status))
              iSpecs.push(this.convert2IidentificationSpecification(slaveid, mspec, language))
          } else if (
            ![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status) ||
            (slave && slave.specificationid == spec.filename)
          )
            iSpecs.push(this.convert2IidentificationSpecificationFromSpec(slaveid, spec, language, IdentifiedStates.notIdentified))
        })
      }
      let iSpecs: IidentificationSpecification[] = []
      // no result in cache, read from modbus
      // will be called once (per slave)
      let usbPort = (this.properties.connectionData as IRTUConnection).serialport
      if (usbPort && !fs.existsSync(usbPort)) {
        reject(new Error('RTU is configured, but device is not available'))
        return
      }
      this.modbusAPI
        .readModbusRegister(slaveid, addresses, {
          task: ModbusTasks.deviceDetection,
          printLogs: false,
          errorHandling: { split: true },
          useCache: true,
        })
        .then((values) => {
          // Add not available addresses to the values
          // Store it for cache
          rcf(iSpecs, values)
          resolve(iSpecs)
        })
        .catch(reject)
    })
  }

  private convert2IidentificationSpecification(
    slaveid: number,
    mspec: ImodbusSpecification,
    language: string
  ): IidentificationSpecification {
    // for each spec
    let entityIdentifications: ImodbusEntity[] = []
    for (let ment of mspec.entities) {
      entityIdentifications.push(ment)
    }
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === mspec.filename && dev.slaveid == slaveid)
    let name: string | undefined | null = getSpecificationI18nName(mspec, language)
    if (name == null) name = undefined
    return {
      filename: mspec.filename,
      name: name,
      status: mspec.status!,
      identified: mspec.identified,
      entities: ConfigBus.getIdentityEntities(mspec, language),
    }
  }
  private convert2IidentificationSpecificationFromSpec(
    slaveid: number,
    spec: IfileSpecification,
    language: string,
    identified: IdentifiedStates
  ): IidentificationSpecification {
    // for each spec
    let name: string | undefined | null = getSpecificationI18nName(spec, language)
    if (name == null) name = undefined
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === spec.filename && dev.slaveid == slaveid)
    return {
      filename: spec.filename,
      name: name,
      identified: identified,
      status: spec.status!,
      entities: ConfigBus.getIdentityEntities(spec, language),
    }
  }

  writeSlave(slave: Islave): Islave {
    if (slave.slaveid < 0) throw new Error('Try to save invalid slave id ') // Make sure slaveid is unique
    let oldIdx = this.properties.slaves.findIndex((dev) => {
      return dev.slaveid === slave.slaveid
    })
    ConfigBus.writeslave(this.properties.busId, slave)

    if (oldIdx >= 0) this.properties.slaves[oldIdx] = slave
    else this.properties.slaves.push(slave)
    return slave
  }

  private getISlave(properties: Islave, language?: string): Islave {
    if (properties && properties.specificationid) {
      let spec = ConfigSpecification.getSpecificationByFilename(properties.specificationid)
      if (spec) {
        let name = null
        if (language) name = getSpecificationI18nName(spec, language)
        let iident: IidentificationSpecification = {
          filename: spec.filename,
          name: name ? name : undefined,
          status: spec.status,
          identified: IdentifiedStates.unknown,
          entities: ConfigBus.getIdentityEntities(spec, language),
        }
        properties.specification = spec
      }
      properties.modbusStatusForSlave = this.modbusAPI.getErrors(properties.slaveid)
    }
    return properties
  }
  getSlaves(language?: string): Islave[] {
    this.properties.slaves.forEach((s) => {
      s = this.getISlave(s, language)
    })
    return this.properties.slaves
  }
  getSlaveBySlaveId(slaveid: number | undefined, language?: string): Islave | undefined {
    let slave = this.properties.slaves.find((dev) => dev.slaveid == slaveid)
    if (slave) slave = this.getISlave(slave, language)
    return slave
  }
  public static cleanupCaches() {
    Bus.getBusses().forEach((bus) => bus.modbusAPI.cleanupCache())
  }
  startPolling() {
    let poller = new MqttPoller(MqttConnector.getInstance())
    poller.startPolling(this)
  }
}
