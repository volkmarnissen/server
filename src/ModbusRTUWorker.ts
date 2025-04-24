import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { IModbusResultWithDuration } from './bus'
import { ModbusRTUQueue, ModbusErrorActions, IQueueEntry, ModbusErrorStates } from './ModbusRTUQueue'
import { IModbusAPI, ModbusWorker } from './ModbusWorker'
import { ImodbusValues, IModbusResultOrError, Logger, LogLevelEnum } from '@modbus2mqtt/specification'
import Debug from 'debug'
import { IexecuteOptions, ModbusRTUProcessor } from './ModbusRTUProcessor'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'

const debug = Debug('modbusrtuworker')
const log = new Logger('modbusrtuworker')
const logNoticeMaxWaitTime = 1000 * 60 * 30 // 30 minutes
const maxErrorRetriesCrc = 4
const maxErrorRetriesTimeout = 1

export class ModbusRTUWorker extends ModbusWorker {
  private isRunning = false
  private static lastNoticeMessageTime: number
  private static lastNoticeMessage: string
  private cache = new Map<number, ImodbusValues>()

  constructor(modbusAPI: IModbusAPI, queue: ModbusRTUQueue) {
    super(modbusAPI, queue)
  }
  debugMessage(currentEntry: IQueueEntry, msg: string) {
    let id =
      'slave: ' +
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

  private logNotice(msg: string, options?: IexecuteOptions) {
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
  private retry(current: IQueueEntry): Promise<void> {
    if (current.errorState == undefined || [ModbusErrorStates.noerror, ModbusErrorStates.other].includes(current.errorState))
      return new Promise((resolve, reject) => {
        reject(new Error('Retry is not helpful'))
      })

    if (current.errorCount != undefined) current.errorCount++
    else current.errorCount = 1
    this.debugMessage(current, 'Retrying ...')
    switch (current.errorState) {
      case ModbusErrorStates.crc:
        if (current.errorCount > maxErrorRetriesCrc)
          return new Promise((resolve, reject) => {
            reject(new Error('Too many retries crc'))
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
        if (current.errorCount > maxErrorRetriesTimeout)
          return new Promise((resolve, reject) => {
            reject(new Error('Too many retries timeout'))
          })
        return this.executeModbusFunctionCodeRead(current)
    }
    return new Promise((resolve, reject) => {
      reject(new Error('End of function reached'))
    })
  }
  private handleErrors(current: IQueueEntry, error: any, options?: IexecuteOptions): Promise<void> {
    if (error == undefined)
      return new Promise((resolve, reject) => {
        reject(new Error('Unable to handle undefined error'))
      })
    current.error = error
    if (error.errno == 'ETIMEDOUT' && current.errorState != ModbusErrorStates.timeout) {
      this.logNotice(
        (options && options.task ? options.task : '') +
          ' TIMEOUT: slave:' +
          current!.slaveId +
          ' address: ' +
          current!.address.address +
          ' length:' +
          current!.address.length +
          ' ' +
          (error.readDetails ? error.readDetails : '') +
          ' retrying ... ',
        options
      )
      current.errorState = ModbusErrorStates.timeout
      return this.retry(current)
    } else {
      let modbusCode = error.modbusCode
      if (modbusCode == undefined)
        return new Promise((resolve, reject) => {
          reject(new Error('Unable to handle undefined modbuscode'))
        })
      switch (modbusCode) {
        case 1: //Illegal Function Code. No need to retry
          current.errorState = ModbusErrorStates.other
          return new Promise((resolve, reject) => {
            reject(new Error('Unable to handle Illegal function code'))
          })
        case 2: // Illegal Address. No need to retry
          current.errorState = ModbusErrorStates.other
          return new Promise((resolve, reject) => {
            reject(new Error('Unable to handle Illegal address'))
          })
        default:
          current.errorState = ModbusErrorStates.crc
          return this.retry(current)
      }
    }
  }
  private createEmptyIModbusValues(): ImodbusValues {
    return {
      holdingRegisters: new Map<number, IModbusResultOrError>(),
      analogInputs: new Map<number, IModbusResultOrError>(),
      coils: new Map<number, IModbusResultOrError>(),
      discreteInputs: new Map<number, IModbusResultOrError>(),
    }
  }

  private getSelectedMap(current: IQueueEntry, values: ImodbusValues): Map<number, IModbusResultOrError> | undefined {
    let table: Map<number, IModbusResultOrError> | undefined = undefined
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
  private getCachedMap(current: IQueueEntry): Map<number, IModbusResultOrError> | undefined {
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
        if (result.length > idx) table.set(current.address.address + idx, { data: [result[idx]] })
      }
  }
  private updateCacheError(current: IQueueEntry, error: Error) {
    let table = this.getCachedMap(current)
    if (table != undefined)
      for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
        table.set(current.address.address + idx, { error: error })
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

  private executeModbusFunctionCodeRead(current: IQueueEntry): Promise<void> {
    let mp = this.isInCacheMap(current)
    if (mp != undefined) {
      return new Promise<void>((resolve, reject) => {
        current.errorState = ModbusErrorStates.noerror
        // Read from Cache
        for (let idx = 0; idx < (current.address.length ? current.address.length : 1); idx++) {
          let rc = mp.get(current.address.address + idx)
          if (rc!.data != undefined) current.onResolve(rc!.data)
          else {
            let tmpEntry: IQueueEntry = {
              address: { address: current.address.address + idx, length: 1, registerType: current.address.registerType },
              slaveId: current.slaveId,
              onResolve: current.onResolve,
              onError: current.onError,
            }
            tmpEntry.onError(tmpEntry, rc!.error)
          }
        }
        resolve()
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
              current.onResolve(result.data)
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
                current.onError(current, e)
                resolve()
              })
          })
      })
  }

  override run() {
    if (!this.isRunning && this.queue.getLength() > 0) {
      this.isRunning = true
      let processing = this.queue.getEntries()
      this.queue.clear()
      // process all queue entries sequentially:
      processing
        .reduce<Promise<void>>(
          (promise, current): Promise<void> => {
            return new Promise<void>((resolve, reject) => {
              promise.then(() => {
                if (current.address.write)
                  return this.functionCodeWriteMap.get(current.address.registerType)!(
                    current.slaveId,
                    current.address.address,
                    current.address.write
                  )
                    .then(() => {
                      resolve()
                    })
                    .catch((e) => {
                      current.onError(current, e)
                      resolve()
                    })
                else
                  return this.executeModbusFunctionCodeRead(current).then(() => {
                    resolve()
                  })
              })
            })
          },
          new Promise<void>((resolve) => {
            resolve()
          })
        )
        .then(() => {
          if (this.queue.getLength() == 0) {
            this.isRunning = false
            this.onFinish()
          } else {
            this.isRunning = false
            this.run()
          }
        })
    }
  }
  onFinish() {}
}
