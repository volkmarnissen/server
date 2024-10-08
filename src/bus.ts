import Debug from 'debug'
import { Observable, Subject, first } from 'rxjs'
import {
  ImodbusEntityIdentification,
  ImodbusSpecification,
  ModbusRegisterType,
  SpecificationStatus,
} from '@modbus2mqtt/specification.shared'
import { IdentifiedStates } from '@modbus2mqtt/specification.shared'
import { Mutex } from 'async-mutex'
import { ImodbusAddress, ModbusCache } from './modbuscache'
import {
  ConverterMap,
  IReadRegisterResultOrError,
  ImodbusValues,
  M2mSpecification,
  emptyModbusValues,
} from '@modbus2mqtt/specification'
import { Config } from './config'
import { Modbus } from './modbus'
import * as fs from 'fs'
import { submitGetHoldingRegisterRequest } from './submitRequestMock'
import { IfileSpecification } from '@modbus2mqtt/specification'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import ModbusRTU from 'modbus-serial'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import {
  Islave,
  IModbusConnection,
  IBus,
  IRTUConnection,
  ITCPConnection,
  IidentificationSpecification,
} from '@modbus2mqtt/server.shared'
import { ConfigSpecification } from '@modbus2mqtt/specification'
import { MqttDiscover } from './mqttdiscover'
const debug = Debug('bus')
const debugMutex = Debug('bus.mutex')
const log = new Logger('bus')

export interface ReadRegisterResultWithDuration extends IReadRegisterResultOrError {
  duration: number
}

export class Bus {
  private static busses: Bus[] | undefined = undefined
  private static allSpecificationsModbusAddresses: Set<ImodbusAddress> | undefined = undefined
  static readBussesFromConfig(): void {
    let ibs = Config.getBussesProperties()
    if (!Bus.busses) Bus.busses = []
    ibs.forEach((ib) => {
      let bus = Bus.busses!.find((bus) => bus.getId() == ib.busId)
      if (bus !== undefined) bus.properties = ib
      else {
        let b = new Bus(ib)
        b.getSlaves().forEach((s) => {
          s.evalTimeout = true
        })
        this.busses?.push(b)
      }
    })
    // delete removed busses
    for (let idx = 0; idx < Bus.busses!.length; idx++) {
      if (!ibs.find((ib) => ib.busId == Bus.busses![idx].properties.busId)) Bus.busses!.splice(idx, 1)
    }
  }
  static getBusses(): Bus[] {
    if (!Bus.busses) {
      Bus.readBussesFromConfig()
    }
    //debug("getBusses Number of busses:" + Bus.busses!.length)
    return Bus.busses!
  }
  static addBus(connection: IModbusConnection): Bus {
    debug('addBus()')
    let busP = Config.addBusProperties(connection)
    let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
    if (b) throw new Error('Unable to add Bus it exists')
    else {
      b = new Bus(busP)
      Bus.getBusses().push(b)
    }
    return b
  }
  private connectionChanged(connection: IModbusConnection): boolean {
    let rtu = this.properties.connectionData as IRTUConnection
    if (rtu.serialport) {
      let connectionRtu = connection as IRTUConnection
      if (!connectionRtu.serialport || connectionRtu.serialport !== rtu.serialport) return true
      if (!connectionRtu.baudrate || connectionRtu.baudrate !== rtu.baudrate) return true
      if (!connectionRtu.timeout || connectionRtu.timeout !== rtu.timeout) return true
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

  updateBus(connection: IModbusConnection): Bus {
    debug('updateBus()')
    if (this.connectionChanged(connection)) {
      let busP = Config.updateBusProperties(this.properties, connection)
      let b = Bus.getBusses().find((b) => b.getId() == busP.busId)
      if (b) {
        b.properties = busP
        // Change of bus properties can influence the modbus data
        // E.g. set of lower timeout can lead to error messages
        b.slaves.clear()
        Bus.getAllAvailableModusData()
      } else throw new Error('Bus does not exist')
      return b
    }
    return this
  }
  static deleteBus(busid: number) {
    let idx = Bus.getBusses().findIndex((b) => b.properties.busId == busid)
    if (idx >= 0) {
      Bus.getBusses().splice(idx, 1)
      Config.deleteBusProperties(busid)
    }
  }
  static getBus(busid: number): Bus | undefined {
    // debug("getBus()")
    return Bus.getBusses().find((b) => b.properties.busId == busid)
  }

  //Runs in background only no feedback
  static getAllAvailableModusData(): void {
    debug('getAllAvailableModusData')
    let subject = new Subject<void>()
    let busCount = Bus.getBusses().length
    if (busCount == 0)
      setTimeout(() => {
        subject.next()
      }, 2)
    Bus.getBusses().forEach((bus) => {
      bus.properties.slaves.forEach((slave) => {
        bus
          .getAvailableSpecs(slave.slaveid, true)
          .then(() => {
            debug('Specs for ' + bus.getId() + '/' + slave.slaveid + ' cached')
          })
          .catch((e) => {
            log.log(LogLevelEnum.error, 'getAllAvailableModusData failed: ' + e.message)
          })
      })
    })
  }

  slaves = new Map<number, ImodbusValues>()
  properties: IBus
  private modbusClient: ModbusRTU | undefined
  private modbusClientTimedOut: boolean = false
  private modbusClientMutex = new Mutex()
  private modbusClientMutexAquireCount = 0
  private modbusClientActionMutex = new Mutex()
  constructor(ibus: IBus) {
    this.properties = ibus
  }
  getId(): number {
    return this.properties.busId
  }
  private connectRTUClient(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) this.modbusClient = new ModbusRTU()
      if (this.modbusClient.isOpen) {
        resolve()
        return
      }

      // debug("connectRTUBuffered")
      let port = (this.properties.connectionData as IRTUConnection).serialport
      let baudrate = (this.properties.connectionData as IRTUConnection).baudrate
      if (port && baudrate) {
        this.modbusClient.connectRTUBuffered(port, { baudRate: baudrate }).then(resolve).catch(reject)
      } else {
        let host = (this.properties.connectionData as ITCPConnection).host
        let port = (this.properties.connectionData as ITCPConnection).port
        this.modbusClient.connectTCP(host, { port: port }).then(resolve).catch(reject)
      }
    })
  }
  reconnectRTU(task: string): Promise<void> {
    debugMutex(task + ' reconnecting ' + (this.modbusClient?.isOpen ? 'opened' : 'closed'))
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClientTimedOut) {
        if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
          reject(task + ' Last read failed with TIMEOUT and modbusclient is not ready')
          return
        } else resolve()
      } else if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
        this.connectRTUClient()
          .then(resolve)
          .catch((e) => {
            log.log(LogLevelEnum.error, task + ' connection failed ' + e)
            debugMutex(task + ' release ' + this.modbusClientMutexAquireCount--)
            this.modbusClientMutex.release()
            reject(e)
          })
      } else if (this.modbusClient!.isOpen) {
        this.modbusClient.close(() => {
          debug('closed')
          if (this.modbusClient!.isOpen)
            setTimeout(() => {
              if (this.modbusClient!.isOpen) reject(new Error('ModbusClient is open after close'))
              else this.reconnectRTU(task).then(resolve).catch(reject)
            }, 10)
          else this.reconnectRTU(task).then(resolve).catch(reject)
        })
      } else {
        debugMutex(task + ' release ' + this.modbusClientMutexAquireCount--)
        this.modbusClientMutex.release()
        reject(new Error(task + ' unable to open'))
      }
    })
    return rc
  }
  connectRTU(task: string): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      debugMutex(
        task +
          ' connectRTU modbusClientMutex ' +
          (this.modbusClientMutex.isLocked() ? 'locked' : 'unlocked') +
          ' mutex:' +
          this.modbusClientMutexAquireCount++
      )
      this.modbusClientMutex.acquire().then(() => {
        this.connectRTUClient()
          .then(resolve)
          .catch((e) => {
            log.log(LogLevelEnum.error, task + ' connection failed ' + e)
            debugMutex(task + ' release ' + this.modbusClientMutexAquireCount--)
            this.modbusClientMutex.release()
            reject(e)
          })
      })
    })
    return rc
  }

  closeRTU(task: string, callback: Function) {
    debugMutex(task + ' closeRTU')
    if (this.modbusClientTimedOut) {
      debugMutex(task + ' Timeout: release ' + this.modbusClientMutexAquireCount--)
      this.modbusClientMutex.release()
      debug("Workaround: Last calls TIMEDOUT won't close")
      callback()
    } else if (this.modbusClient == undefined) {
      debugMutex(task + ' modbusClient undefined: release ' + this.modbusClientMutexAquireCount--)

      this.modbusClientMutex.release()
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
    } else
      this.modbusClient.close(() => {
        debugMutex(task + ' close: release ' + this.modbusClientMutexAquireCount--)

        this.modbusClientMutex.release()
        // debug("closeRTU: " + (this.modbusClient?.isOpen ? "open" : "closed"))
        callback()
      })
  }
  isRTUopen(): boolean {
    if (this.modbusClient == undefined) {
      log.log(LogLevelEnum.error, 'modbusClient is undefined')
      return false
    } else return this.modbusClient.isOpen
  }
  setModbusTimout(reject: (e: any) => void, e: any) {
    this.modbusClientTimedOut = e.errno && e.errno == 'ETIMEDOUT'
    reject(e)
  }
  clearModbusTimout() {
    this.modbusClientTimedOut = false
  }

  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        reject(new Error('modbusClient is undefined'))
      } else {
        this.prepareRead(slaveid)
        this.modbusClientActionMutex.acquire().then(() => {
          let start = Date.now()
          this.modbusClient!.readHoldingRegisters(dataaddress, length)
            .then((data) => {
              this.modbusClientActionMutex.release()
              this.clearModbusTimout()
              let rc: ReadRegisterResultWithDuration = {
                result: data,
                duration: Date.now() - start,
              }
              resolve(rc)
            })
            .catch((e) => {
              this.modbusClientActionMutex.release()
              e.duration = Date.now() - start
              this.setModbusTimout(reject, e)
            })
        })
      }
    })
    return rc
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        this.modbusClientActionMutex.acquire().then(() => {
          let start = Date.now()
          this.modbusClient!.readInputRegisters(dataaddress, length)
            .then((data) => {
              this.modbusClientActionMutex.release()
              this.clearModbusTimout()
              let rc: ReadRegisterResultWithDuration = {
                result: data,
                duration: Date.now() - start,
              }
              resolve(rc)
            })
            .catch((e) => {
              this.modbusClientActionMutex.release()
              this.setModbusTimout(reject, e)
            })
        })
      }
    })
    return rc
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        this.modbusClientActionMutex.acquire().then(() => {
          let start = Date.now()
          this.modbusClient!.readDiscreteInputs(dataaddress, length)
            .then((resolveBoolean) => {
              this.modbusClientActionMutex.release()
              this.clearModbusTimout()
              let readResult: ReadRegisterResult = {
                data: [],
                buffer: Buffer.allocUnsafe(0),
              }
              resolveBoolean.data.forEach((d) => {
                readResult.data.push(d ? 1 : 0)
              })
              let rc: ReadRegisterResultWithDuration = {
                result: readResult,
                duration: Date.now() - start,
              }
              resolve(rc)
            })
            .catch((e) => {
              this.modbusClientActionMutex.release()
              this.setModbusTimout(reject, e)
            })
        })
      }
    })
    return rc
  }
  private prepareRead(slaveid: number) {
    this.modbusClient!.setID(slaveid)
    let slave = this.getSlaveBySlaveId(slaveid)
    if (slave) {
      if (slave.modbusTimout == undefined) slave.modbusTimout = (this.properties.connectionData as IRTUConnection).timeout
      this.modbusClient!.setTimeout(slave.modbusTimout)
    }
  }
  getMaxModbusTimeout() {
    return (this.properties.connectionData as IRTUConnection).timeout
  }

  writeHoldingRegisters(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.modbusClientActionMutex.acquire().then(() => {
          this.modbusClient!.setID(slaveid)
          this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
          this.modbusClient!.writeRegisters(dataaddress, data.data)
            .then(() => {
              this.modbusClientTimedOut = false
              this.modbusClientActionMutex.release()
              resolve()
            })
            .catch((e) => {
              this.modbusClientActionMutex.release()
              this.setModbusTimout(reject, e)
            })
        })
      }
    })
    return rc
  }
  writeCoils(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
    let rc = new Promise<void>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.modbusClientActionMutex.acquire().then(() => {
          this.modbusClient!.setID(slaveid)
          this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
          let dataB: boolean[] = []
          data.data.forEach((d) => {
            dataB.push(d == 1)
          })
          this.modbusClient!.writeCoils(dataaddress, dataB)
            .then(() => {
              this.modbusClientActionMutex.release()
              this.modbusClientTimedOut = false
              resolve()
            })
            .catch((e) => {
              this.modbusClientActionMutex.release()
              this.setModbusTimout(reject, e)
            })
        })
      }
    })
    return rc
  }

  private setModbusAddressesForSlave(slaveid: number, addresses: ImodbusValues) {
    if (this.slaves) this.slaves!.set(slaveid, addresses)
  }
  getModbusAddressesForSlave(slaveid: number): ImodbusValues | undefined {
    if (this.slaves) return this.slaves!.get(slaveid)
    return undefined
  }

  deleteSlave(slaveid: number) {
    new Config().deleteSlave(this.properties.busId, slaveid)
    if (this.slaves) this.slaves!.delete(slaveid)
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
          if (slave.specificationid == specificationid)
            cfg.writeslave(bus.getId(), slave.slaveid, specificationid == null ? undefined : specificationid, slave.name)
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
      Config.getSpecificationsChangedObservable().subscribe(Bus.updateAllSpecificationsModbusAddresses)
    }
    return Bus.allSpecificationsModbusAddresses!
  }

  private readModbusRegisterLogControl(
    task: string,
    printLog: boolean,
    slaveid: number,
    addresses: Set<ImodbusAddress>
  ): Promise<ImodbusValues> {
    return new Promise((resolve, reject) => {
      debug('readModbusRegister slaveid: ' + slaveid + ' addresses: ' + JSON.stringify(Array.from(addresses)))

      if (Config.getConfiguration().fakeModbus)
        submitGetHoldingRegisterRequest({ busid: this.getId(), slaveid: slaveid }, addresses).then(resolve).catch(reject)
      else
        new ModbusCache(task + '(' + slaveid + ')', printLog)
          .submitGetHoldingRegisterRequest({ busid: this.getId(), slaveid: slaveid }, addresses)
          .then(resolve)
          .catch(reject)
    })
  }
  readModbusRegister(task: string, slaveid: number, addresses: Set<ImodbusAddress>): Promise<ImodbusValues> {
    return this.readModbusRegisterLogControl(task, true, slaveid, addresses)
  }

  /*
   * getAvailableSpecs uses bus.slaves cache if possible
   */
  getAvailableSpecs(slaveid: number, showAllPublicSpecs: boolean): Promise<IidentificationSpecification[]> {
    return new Promise<IidentificationSpecification[]>((resolve, reject) => {
      let addresses = Bus.getModbusAddressesForAllSpecs()

      let rcf = (modbusData: ImodbusValues): void => {
        let cfg = new ConfigSpecification()
        cfg.filterAllSpecifications((spec) => {
          let mspec = M2mSpecification.fileToModbusSpecification(spec, modbusData)
          MqttDiscover.addTopicAndPayloads(mspec, this.getId(), this.getSlaveBySlaveId(slaveid)!)
          debug('getAvailableSpecs')
          if (mspec) {
            // list only identified public specs, but all local specs
            if (
              [SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status) &&
              (showAllPublicSpecs || mspec.identified == IdentifiedStates.identified)
            )
              iSpecs.push(this.convert2ImodbusSpecification(slaveid, mspec))
            else if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status))
              iSpecs.push(this.convert2ImodbusSpecification(slaveid, mspec))
          } else if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status))
            iSpecs.push(this.convert2ImodbusSpecificationFromSpec(slaveid, spec))
        })
        resolve(iSpecs)
      }
      let iSpecs: IidentificationSpecification[] = []
      // try to find the result in cache
      let values = this.slaves.get(slaveid)
      if (values) {
        let addrs: number[] = []
        let cacheFailed = false
        addresses.forEach((address) => {
          if (address.length) for (let a = address.address; a < address.address + address.length; a++) addrs.push(a)
          else addrs.push(address.address)
          addrs.forEach((a) => {
            switch (address.registerType) {
              case ModbusRegisterType.HoldingRegister:
                if (!values!.holdingRegisters.has(address.address)) cacheFailed = true
                break
              case ModbusRegisterType.AnalogInputs:
                if (!values!.analogInputs.has(address.address)) cacheFailed = true
                break
              case ModbusRegisterType.Coils:
                if (!values!.coils.has(address.address)) cacheFailed = true
                break
            }
          })
        })
        if (!cacheFailed) {
          rcf(values)
          return
        }
      }
      // no result in cache, read from modbus
      // will be called once (per slave)
      let usbPort = (this.properties.connectionData as IRTUConnection).serialport
      if (usbPort && !fs.existsSync(usbPort)) {
        reject(new Error('RTU is configured, but device is not available'))
        return
      }

      this.readModbusRegisterLogControl('getAvailableSpecs', false, slaveid, addresses)
        .then((values) => {
          // Add not available addresses to the values
          let noData = { error: new Error('No data available') }
          addresses.forEach((address) => {
            switch (address.registerType) {
              case ModbusRegisterType.HoldingRegister:
                if (!values.holdingRegisters.has(address.address)) values.holdingRegisters.set(address.address, noData)
                break
              case ModbusRegisterType.AnalogInputs:
                if (!values.analogInputs.has(address.address)) values.analogInputs.set(address.address, noData)
                break
              case ModbusRegisterType.Coils:
                if (!values.coils.has(address.address)) values.coils.set(address.address, noData)
                break
            }
          })
          // Store it for cache
          this.setModbusAddressesForSlave(slaveid, values)
          rcf(values)
        })
        .catch(reject)
    })
  }

  private convert2ImodbusSpecification(slaveid: number, mspec: ImodbusSpecification): IidentificationSpecification {
    // for each spec
    let entityIdentifications: ImodbusEntityIdentification[] = []
    for (let ment of mspec.entities) {
      entityIdentifications.push({
        id: ment.id,
        modbusValue: ment.modbusValue,
        mqttValue: ment.mqttValue,
        identified: ment.identified,
        commandTopic: ment.commandTopic,
        commandTopicModbus: ment.commandTopicModbus,
      })
    }
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === mspec.filename && dev.slaveid == slaveid)
    return {
      filename: mspec.filename,
      stateTopic: mspec.stateTopic,
      statePayload: mspec.statePayload,
      files: mspec.files,
      i18n: mspec.i18n,
      status: mspec.status!,
      configuredSlave: configuredslave,
      entities: entityIdentifications,
      identified: mspec.identified,
    }
  }
  private convert2ImodbusSpecificationFromSpec(slaveid: number, spec: IfileSpecification): IidentificationSpecification {
    // for each spec
    let entityIdentifications: ImodbusEntityIdentification[] = []
    for (let ent of spec.entities) {
      entityIdentifications.push({
        id: ent.id,
        modbusValue: [],
        mqttValue: '',
        identified: IdentifiedStates.notIdentified,
      })
    }
    let configuredslave = this.properties.slaves.find((dev) => dev.specificationid === spec.filename && dev.slaveid == slaveid)
    return {
      filename: spec.filename,
      files: spec.files,
      i18n: spec.i18n,
      status: spec.status!,
      configuredSlave: configuredslave,
      entities: entityIdentifications,
      identified: IdentifiedStates.notIdentified,
    }
  }

  writeSlave(
    slaveid: number,
    specification: string | undefined,
    name: string | undefined,
    polInterval: number | undefined
  ): Islave {
    if (slaveid < 0) throw new Error('Try to save invalid slave id ') // Make sure slaveid is unique
    let oldIdx = this.properties.slaves.findIndex((dev) => {
      return dev.slaveid === slaveid
    })
    let slave = new Config().writeslave(this.properties.busId, slaveid, specification, name, polInterval)

    if (oldIdx >= 0) this.properties.slaves[oldIdx] = slave
    else this.properties.slaves.push(slave)
    return slave
  }
  getCachedValues(slaveid: number, addresses: Set<ImodbusAddress>): ImodbusValues | null {
    let rc = emptyModbusValues()
    if (this.slaves) {
      let saddresses = this.slaves.get(slaveid)
      if (saddresses)
        for (let address of addresses) {
          let value = saddresses!.holdingRegisters.get(address.address)
          let m = saddresses!.holdingRegisters
          let r = rc.holdingRegisters
          switch (address.registerType) {
            case ModbusRegisterType.AnalogInputs:
              m = saddresses!.analogInputs
              r = rc.analogInputs
              break
            case ModbusRegisterType.Coils:
              m = saddresses!.coils
              r = rc.coils
              break
          }
          value = m.get(address.address)

          if (value == undefined || value == null) return null
          r.set(address.address, value)
        }
    }
    return rc
  }

  getSlaves(): Islave[] {
    this.properties.slaves.forEach((s) => {
      if (s && s.specificationid) {
        let ispec = ConfigSpecification.getSpecificationByFilename(s.specificationid)
        if (ispec) s.specification = ispec
      }
    })
    return this.properties.slaves
  }
  getSlaveBySlaveId(slaveid: number): Islave | undefined {
    let slave = this.properties.slaves.find((dev) => dev.slaveid == slaveid)

    if (slave && slave.specificationid) {
      let ispec = ConfigSpecification.getSpecificationByFilename(slave.specificationid)
      if (ispec) slave.specification = ispec
    }
    return slave
  }
}
