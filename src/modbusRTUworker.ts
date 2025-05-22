import { ModbusRTUQueue, IQueueEntry, IQueueOptions } from './modbusRTUqueue'
import { IModbusAPI, ModbusWorker } from './modbusWorker'
import { IModbusResultOrError, Logger, LogLevelEnum } from '@modbus2mqtt/specification'
import Debug from 'debug'
import { IexecuteOptions } from './modbusRTUprocessor'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import {
  ImodbusAddress,
  ImodbusErrorsForSlave,
  ImodbusStatusForSlave,
  ModbusErrorStates,
  ModbusTasks,
} from '@modbus2mqtt/server.shared'
import { TupleType } from 'typescript'

const debug = Debug('modbusrtuworker')
const log = new Logger('modbusrtuworker')
const logNoticeMaxWaitTime = 1000 * 60 * 30 // 30 minutes
const maxErrorRetriesCrc = 4
const maxErrorRetriesTimeout = 1
const maxErrorRetriesOther = 1
const errorCleanTimeout = 60 * 60 * 1 * 1000 // 1 hour
const errorTimeout = 60 * 60 * 5 * 1000 // 5 hours
const dataTimeout = 60 * 60 * 10 * 1000 // 10 hours
interface IModbusResultCache extends IModbusResultOrError {
  date: Date
}
class ModbusErrorDescription {
  constructor(
    private queueEntry: IQueueEntry,
    private state: ModbusErrorStates,
    public date: Date = new Date()
  ) {}
  getModbusErorForSlave(): ImodbusErrorsForSlave {
    return {
      date: this.date.getTime(),
      task: this.queueEntry.options.task,
      address: this.queueEntry.address,
      state: this.state,
    }
  }
}

interface ImodbusValuesCache {
  holdingRegisters: Map<number, IModbusResultCache>
  analogInputs: Map<number, IModbusResultCache>
  coils: Map<number, IModbusResultCache>
  discreteInputs: Map<number, IModbusResultCache>
  errors: ModbusErrorDescription[]
  requestCount: number[][]
}
export class ModbusRTUWorker extends ModbusWorker {
  private isRunning = false
  private queuePromise: Promise<void> | undefined = undefined
  private static lastNoticeMessageTime: number
  private static lastNoticeMessage: string
  private static caches = new Map<string, Map<number, ImodbusValuesCache>>()
  private cache: Map<number, ImodbusValuesCache>
  constructor(modbusAPI: IModbusAPI, queue: ModbusRTUQueue) {
    super(modbusAPI, queue)
    let c = ModbusRTUWorker.caches.get(modbusAPI.getCacheId())
    if (c) this.cache = c
    else ModbusRTUWorker.caches.set(modbusAPI.getCacheId(), (this.cache = new Map<number, ImodbusValuesCache>()))
  }
  debugMessage(currentEntry: IQueueEntry, msg: string) {
    let id =
      ' slave: ' +
      currentEntry.slaveId +
      ' Reg: ' +
      currentEntry.address.registerType +
      ' Address: ' +
      currentEntry.address.address +
      ' (l: ' +
      (currentEntry.address.length ? currentEntry.address.length : 1) +
      ')'
    debug(id + ': ' + msg)
  }

  private logNotice(msg: string, options: IexecuteOptions) {
    if (options == undefined || !options.printLogs) {
      debug(msg)
      return
    }
    // suppress similar duplicate messages
    let repeatMessage =
      ModbusRTUWorker.lastNoticeMessageTime != undefined &&
      ModbusRTUWorker.lastNoticeMessageTime + logNoticeMaxWaitTime < Date.now()
    if (repeatMessage || msg != ModbusRTUWorker.lastNoticeMessage) {
      ModbusRTUWorker.lastNoticeMessage = msg
      ModbusRTUWorker.lastNoticeMessageTime = Date.now()
      log.log(LogLevelEnum.notice, options.task ? options.task + ' ' : '' + msg)
    }
  }
  private retry(current: IQueueEntry, error: any): Promise<void> {
    // retry is not configured
    if (!current.options.errorHandling.retry)
      return new Promise((resolve, reject) => {
        reject(error)
      })
    if (current.errorState == undefined || [ModbusErrorStates.noerror].includes(current.errorState))
      return new Promise((resolve, reject) => {
        reject(new Error('Retry is not helpful'))
      })
    if (current.errorCount != undefined) current.errorCount++
    else current.errorCount = 1

    let maxErrors = 0
    switch (current.errorState) {
      case ModbusErrorStates.crc || ModbusErrorStates.illegaladdress:
        if (current.errorCount >= maxErrorRetriesCrc)
          return new Promise((resolve, reject) => {
            reject(new Error('Too many retries ' + (current.errorState == ModbusErrorStates.crc ? 'crc' : 'illegal address')))
          })
        return new Promise<void>((resolve, reject) => {
          this.modbusAPI
            .reconnectRTU('ReconnectOnError')
            .then(() => {
              debug('Reconnected')
              this.executeModbusFunctionCodeRead(current).then(resolve).catch(reject)
            })
            .catch((e1) => {
              log.log(LogLevelEnum.error, 'Unable to reconnect: ' + e1.message)
              reject(e1)
            })
        })
      case ModbusErrorStates.timeout:
        maxErrors = maxErrorRetriesTimeout
        break
      default:
        maxErrors = maxErrorRetriesOther
    }
    if (current.errorCount > maxErrors)
      return new Promise((resolve, reject) => {
        reject(new Error('Too many retries: ' + (current.errorState == ModbusErrorStates.timeout ? 'timeout' : 'other')))
      })
    else {
      this.debugMessage(current, 'Retrying ...')
      return this.executeModbusFunctionCodeRead(current)
    }
  }

  private splitAddresses(entry: IQueueEntry, e: any): void {
    // split request into single parts to avoid invalid address errors as often as possible
    let length = entry.address.length != undefined ? entry.address.length : 1
    if (length > 1) {
      let address: ImodbusAddress = {
        address: entry.address.address,
        registerType: entry.address.registerType,
        length: 1,
      }
      for (let l = 0; l < length; l++) {
        this.queue.enqueue(entry.slaveId, structuredClone(address), entry.onResolve, entry.onError, {
          task: ModbusTasks.splitted,
          errorHandling: {},
          useCache: entry.options.useCache,
        } as IQueueOptions)
        address.address++
      }
    } else throw e
  }
  private logErrorInCache(current: IQueueEntry, state: ModbusErrorStates) {
    this.addError(current, state, new Date())
  }
  private splitWithRestartServer(current: IQueueEntry, error: any, errorState: ModbusErrorStates): Promise<void> {
    current.errorState = errorState
    this.logErrorInCache(current, errorState)
    if (current.options.errorHandling.split && current.address.length != undefined && current.address.length > 1) {
      this.splitAddresses(current, error) // will reject if split is not possible
      // Wait for reconnect before handling new queue entries
      return this.modbusAPI.reconnectRTU('ReconnectOnError')
    } else return this.retry(current, error)
  }

  private handleErrors(current: IQueueEntry, error: any): Promise<void> {
    if (error == undefined)
      return new Promise((resolve, reject) => {
        reject(new Error('Unable to handle undefined error'))
      })

    current.error = error
    if (this.cache.get(current.slaveId) == undefined) this.cache.set(current.slaveId, this.createEmptyIModbusValues())

    if (error.message.includes('CRC error')) {
      return this.splitWithRestartServer(current, error, ModbusErrorStates.crc)
    } else if (error.errno == 'ETIMEDOUT')
      if (current.options.errorHandling.split && current.address.length != undefined && current.address.length > 1) {
        this.splitAddresses(current, error)
        // New entries are queued. Nothing more to do
        return new Promise((resolve) => {
          resolve()
        })
      } else {
        current.errorState = ModbusErrorStates.timeout
        this.addError(current, ModbusErrorStates.timeout, new Date())
        return this.retry(current, error)
      }
    else {
      let modbusCode = error.modbusCode
      if (modbusCode == undefined) {
        current.errorState = ModbusErrorStates.other
        this.addError(current, ModbusErrorStates.other)
        return this.retry(current, error)
      }
      switch (modbusCode) {
        case 1: //Illegal Function Code. No need to retry
          current.errorState = ModbusErrorStates.other
          this.addError(current, ModbusErrorStates.illegalfunctioncode)
          return new Promise((resolve, reject) => {
            reject(new Error('Unable to handle Illegal function code'))
          })
        case 2: // Illegal Address. No need to retry
          return this.splitWithRestartServer(current, error, ModbusErrorStates.illegaladdress)
        default:
          current.errorState = ModbusErrorStates.crc
          this.addError(current, ModbusErrorStates.crc)
          return this.retry(current, error)
      }
    }
  }
  private createQueueRequestCountArray(): number[][] {
    let minutes: number[] = []
    for (let idx2 = 0; idx2 < 60; idx2++) minutes.push(0)

    let rc: number[][] = []

    for (let idx = 0; idx < Object.keys(ModbusTasks).length / 2; idx++) rc.push(structuredClone(minutes))

    return rc
  }

  private createEmptyIModbusValues(): ImodbusValuesCache {
    return {
      holdingRegisters: new Map<number, IModbusResultCache>(),
      analogInputs: new Map<number, IModbusResultCache>(),
      coils: new Map<number, IModbusResultCache>(),
      discreteInputs: new Map<number, IModbusResultCache>(),
      errors: [],
      requestCount: this.createQueueRequestCountArray(),
    }
  }

  private getSelectedMap(current: IQueueEntry, values: ImodbusValuesCache): Map<number, IModbusResultCache> | undefined {
    let table: Map<number, IModbusResultCache> | undefined = undefined
    switch (current.address.registerType) {
      case ModbusRegisterType.AnalogInputs:
        table = values.analogInputs
        break
      case ModbusRegisterType.Coils:
        table = values.coils
        break
      case ModbusRegisterType.DiscreteInputs:
        table = values.discreteInputs
        break
      case ModbusRegisterType.HoldingRegister:
        table = values.holdingRegisters
        break
    }
    return table
  }
  private getCachedMap(current: IQueueEntry): Map<number, IModbusResultCache> | undefined {
    let cacheEntry = this.cache.get(current.slaveId)
    let f: IModbusResultOrError
    if (cacheEntry == undefined) {
      cacheEntry = this.createEmptyIModbusValues()
      this.cache.set(current.slaveId, cacheEntry)
    }
    return this.getSelectedMap(current, cacheEntry)
  }
  private updateCache(current: IQueueEntry, result: number[]) {
    let table = this.getCachedMap(current)
    if (table != undefined)
      for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
        if (result[idx] == undefined) debug
        if (result.length > idx)
          table.set(current.address.address + idx, structuredClone({ data: [result[idx]], date: this.getCurrentDate() }))
      }
  }
  // for testing
  protected getCurrentDate(): Date {
    return new Date()
  }
  private updateCacheError(current: IQueueEntry, error: Error) {
    let table = this.getCachedMap(current)
    if (table != undefined)
      for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
        let cv = table.get(current.address.address + idx)

        if (cv && cv.data) {
          // overwrite with error only if really old
          let expired: Date = this.getCurrentDate()
          expired.setTime(cv.date.getTime() + errorTimeout)
          if (expired < this.getCurrentDate()) {
            // expired is more than errorTimeout (5 hours) old
            let k = 7
            table.set(current.address.address + idx, { error: error, date: this.getCurrentDate() })
          }
        } // No data available
        else table.set(current.address.address + idx, { error: error, date: this.getCurrentDate() })
      }
  }

  private isInCacheMap(current: IQueueEntry): Map<number, IModbusResultOrError> | undefined {
    if (current.options && current.options.useCache) {
      let mp = this.getCachedMap(current)
      if (mp != undefined) {
        for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
          let rc = mp.get(current.address.address + idx)
          if (rc == undefined) return undefined
        }
        return mp
      }
    }
    return undefined
  }

  private executeModbusFunctionCodeRead(current: IQueueEntry | undefined): Promise<void> {
    if (!current) return Promise.resolve()
    let mp = this.isInCacheMap(current)
    if (mp != undefined) {
      return new Promise<void>((resolve, reject) => {
        current.errorState = ModbusErrorStates.noerror
        // Read from Cache
        for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
          let rc = mp!.get(current.address.address + idx)
          let tmpEntry: IQueueEntry = {
            address: { address: current.address.address + idx, length: 1, registerType: current.address.registerType },
            slaveId: current.slaveId,
            onResolve: current.onResolve,
            onError: current.onError,
            options: current.options,
          }
          if (rc != undefined && rc.data != undefined) tmpEntry.onResolve(tmpEntry, rc.data)
          else if (rc!.error != undefined) tmpEntry.onError(tmpEntry, rc!.error)
          else tmpEntry.onError(tmpEntry, new Error('Unknown error when reading from cache'))
          resolve()
        }
      })
    } else
      return new Promise<void>((resolve, reject) => {
        let fct = this.functionCodeReadMap.get(current.address.registerType)
        fct!(current.slaveId, current.address.address, current.address.length == undefined ? 1 : current.address.length)
          .then((result) => {
            delete current.error
            if (current.errorState != undefined && current.errorState != ModbusErrorStates.noerror)
              this.debugMessage(current, ' was successful now')
            current.errorState = ModbusErrorStates.noerror
            if (result.data) {
              this.updateCache(current, result.data)
              debug('Success: ' + current.address.address)
              current.onResolve(current, result.data)
            }
            resolve()
          })
          .catch((e) => {
            this.handleErrors(current, e)
              .then((result) => {
                resolve()
              })
              .catch((e) => {
                this.debugMessage(current, ' failed permanently')
                this.updateCacheError(current, e)
                debug('Success: ' + current.address.address + 'e: ' + e.message)
                current.onError(current, e)
                resolve()
              })
          })
      })
  }
  private cleanCacheTable(table: Map<number, IModbusResultCache>): void {
    let notExpired: Date = this.getCurrentDate()
    notExpired.setTime(notExpired.getTime() - dataTimeout)
    table.forEach((v, key) => {
      if (v.date < notExpired) table.delete(key)
    })
  }
  public cleanupCache(): void {
    this.cache.forEach((v) => {
      this.cleanCacheTable(v.holdingRegisters)
      this.cleanCacheTable(v.analogInputs)
      this.cleanCacheTable(v.discreteInputs)
      this.cleanCacheTable(v.coils)
      let notExpired: Date = this.getCurrentDate()
      notExpired.setTime(notExpired.getTime() - errorCleanTimeout)
      v.errors.forEach((e, idx) => {
        if (e.date < notExpired) v.errors.splice(idx, 1)
      })
      let currentMinute = new Date().getMinutes()
      // reset current minute counter
      v.requestCount.forEach((type) => {
        type.forEach((count, minute) => {
          if (minute == currentMinute - 1 || (minute == 0 && currentMinute == 59)) type[minute] = 0
        })
      })
    })
  }
  public addError(queueEntry: IQueueEntry, state: ModbusErrorStates, date: Date = new Date()) {
    let c = this.cache.get(queueEntry.slaveId)
    if (this.cache.get(queueEntry.slaveId) == undefined) this.cache.set(queueEntry.slaveId, this.createEmptyIModbusValues())
    c = this.cache.get(queueEntry.slaveId)
    c?.errors.splice(0, c.errors.length - 50)
    c?.errors.push(new ModbusErrorDescription(queueEntry, state, date))
  }
  private compareEntities(a: IQueueEntry, b: IQueueEntry): number {
    return b.options.task - a.options.task
  }
  private processOneEntry(): Promise<void> | undefined {
    let current = this.queue.dequeue()
    if (current) {
      debug('processOneEntry: ql:' + this.queue.getLength() + ' address: ' + current?.address.address)
      let dt = new Date()
      if (this.cache.get(current.slaveId) == undefined) this.cache.set(current.slaveId, this.createEmptyIModbusValues())
      let cacheEntry = this.cache.get(current.slaveId)
      cacheEntry!.requestCount[current.options.task][dt.getMinutes()]++
      if (current.address.write) {
        let fct = this.functionCodeWriteMap.get(current.address.registerType)
        if (fct)
          return fct(current.slaveId, current.address.address, current.address.write)
            .then(() => this.processOneEntry())
            .catch((e) => this.processOneEntry())
        else return Promise.reject(new Error('Invalid function code for write' + current.address.registerType))
      } else
        return this.executeModbusFunctionCodeRead(current)
          .then(() => this.processOneEntry())
          .catch((e) => this.processOneEntry())
    } else {
      this.isRunning = false
      this.onFinish()
      return undefined
    }
  }
  override run() {
    if (this.queue.getLength() == 0) return // nothing to do
    this.queue.getEntries().sort(this.compareEntities)
    let ql = this.queue.getLength()
    if (!(ql % 10)) debug('Number of queue entries: ' + ql)
    // process all queue entries sequentially:
    if (this.isRunning) return
    this.isRunning = true
    this.processOneEntry()
  }

  onFinish() {}
  getErrors(slaveid: number): ImodbusStatusForSlave {
    let cache = this.cache.get(slaveid)
    cache?.errors
    if (cache) {
      return {
        errors: cache.errors.map((d) => {
          return d.getModbusErorForSlave()
        }),
        requestCount: cache.requestCount.map((d) => {
          return d.reduce((sum, count) => {
            return (sum += count)
          }, 0)
        }),
        queueLength: this.queue.getLength(),
      }
    }
    return { errors: [], requestCount: [0, 0, 0, 0, 0, 0, 0, 0], queueLength: 0 } as ImodbusStatusForSlave
  }
}
