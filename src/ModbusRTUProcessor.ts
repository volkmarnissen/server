import { ImodbusValues, IReadRegisterResultOrError, LogLevelEnum } from '@modbus2mqtt/specification'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ImodbusAddress, IQueueEntry, IQueueOptions, ModbusErrorStates, ModbusRTUQueue } from './ModbusRTUQueue'
import { ReadRegisterResultWithDuration } from './bus'
import { Logger } from '@modbus2mqtt/specification'
import Debug from 'debug'

const debug = Debug('modbusrtuprocessor')
const debugData = Debug('modbusrtuprocessor.data')
const debugNext = Debug('modbusrtuprocessor.next')
const debugTime = Debug('modbusrtuprocessor.time')
const log = new Logger('modbusrtuprocessor')

const maxAddressDelta = 10
const logNoticeMaxWaitTime = 1000 * 60 * 30 // 30 minutes

export interface IexecuteOptions extends IQueueOptions{
  printLogs?: boolean
  task?: string
}
export class ModbusRTUProcessor {
  private static lastNoticeMessageTime: number
  private static lastNoticeMessage: string

  constructor(private queue: ModbusRTUQueue) {}
  private prepare(slaveId: number, addresses: Set<ImodbusAddress>): ImodbusAddress[] {
    let preparedAddresses: ImodbusAddress[] = []

    let previousAddress = {
      address: -1,
      registerType: ModbusRegisterType.IllegalFunctionCode,
    }
    let startAddress = {
      address: -1,
      registerType: ModbusRegisterType.IllegalFunctionCode,
    }
    let sortedAddresses = Array.from<ImodbusAddress>(addresses.values()).sort(function (a, b) {
      let v = a.registerType - b.registerType
      if (v) return v
      return a.address - b.address
    })
    for (let addr of sortedAddresses) {
      if (previousAddress.address == -1) previousAddress = addr
      if (startAddress.address == -1) startAddress = addr
      if (addr.registerType != previousAddress.registerType || addr.address - previousAddress.address > maxAddressDelta) {
        preparedAddresses.push({
          address: startAddress.address,
          length: previousAddress.address - startAddress.address + 1,
          registerType: previousAddress.registerType,
        })
        previousAddress = addr
        startAddress = addr
      } else previousAddress = addr
    }
    if (startAddress.address >= 0)
      preparedAddresses.push({
        address: startAddress.address,
        length: previousAddress.address - startAddress.address + 1,
        registerType: previousAddress.registerType,
      })
    return preparedAddresses
  }
  private logNotice(msg: string, options?: IexecuteOptions) {
    if (options == undefined|| !options.printLogs) return
    // suppress similar duplicate messages
    let repeatMessage =
      ModbusRTUProcessor.lastNoticeMessageTime != undefined &&
      ModbusRTUProcessor.lastNoticeMessageTime + logNoticeMaxWaitTime < Date.now()
    if (repeatMessage || msg != ModbusRTUProcessor.lastNoticeMessage) {
      ModbusRTUProcessor.lastNoticeMessage = msg
      ModbusRTUProcessor.lastNoticeMessageTime = Date.now()
      log.log(LogLevelEnum.notice, options.task ? options.task + ' ' : '' + msg)
    }
  }
  /**
   * if timeout retry
   * if connection is RTU and any other error: reconnect then continue
   * if CRC error retry
   * if retried and length > 1 => split addresses and requeue
   * store error for
   * @param currentEntry
   * @param error
   * @returns true if the error was handled
   */
  private errorHandler(currentEntry: IQueueEntry, result: IReadRegisterResultOrError, options?: IexecuteOptions): boolean {
    if ((result.error! as any).errno == 'ETIMEDOUT' && currentEntry.errorState != ModbusErrorStates.timeout) {
      this.logNotice(
        (options && options.task ? options.task : '') +
          ' TIMEOUT: slave:' +
          currentEntry!.slaveId +
          ' address: ' +
          currentEntry!.address.address +
          ' length:' +
          currentEntry!.address.length +
          ' ' +
          ((result.error! as any).readDetails ? (result.error! as any).readDetails : '') +
          ' retrying ... ',
          options
      )
      currentEntry.errorState = ModbusErrorStates.timeout
      this.queue.retry(currentEntry)
      return true
    }

    return false
  }
  private countResults(results:ImodbusValues):number{
    let properties = Object.getOwnPropertyNames(results)
    let size:number = results.analogInputs.size
    size += results.coils.size
    size += results.discreteInputs.size
    return size + results.holdingRegisters.size
  }
  private countAddresses(addresses: Set<ImodbusAddress>):number{
    let size:number = 0
    addresses.forEach(address=>{ size +=(address.length != undefined? address.length:1)})
    return size
  }
  execute(slaveId: number, addresses: Set<ImodbusAddress>, options?: IexecuteOptions): Promise<ImodbusValues> {
    return new Promise<ImodbusValues>((resolve) => {
      let preparedAddresses = this.prepare(slaveId, addresses)
      let addressCount = this.countAddresses(addresses)
      let values: ImodbusValues = {
        holdingRegisters: new Map<number, IReadRegisterResultOrError>(),
        analogInputs: new Map<number, IReadRegisterResultOrError>(),
        coils: new Map<number, IReadRegisterResultOrError>(),
        discreteInputs: new Map<number, IReadRegisterResultOrError>(),
      }
      let resultMaps = new Map<ModbusRegisterType, Map<number, IReadRegisterResultOrError>>()
      resultMaps.set(ModbusRegisterType.AnalogInputs, values.analogInputs)
      resultMaps.set(ModbusRegisterType.HoldingRegister, values.holdingRegisters)
      resultMaps.set(ModbusRegisterType.Coils, values.coils)
      resultMaps.set(ModbusRegisterType.DiscreteInputs, values.discreteInputs)
      let resultCount = 0
      preparedAddresses.forEach((address) => {
        this.queue.enqueue(
          slaveId,
          address,
          (result) => {
            if( result == undefined || undefined == address.write)
                throw new Error("Only read results expected for slave: " + slaveId + " function code: " + address.registerType + " address: " + address.address)
            resultCount++
            if (address.length != undefined)
              for (let idx = 0; idx < address.length; idx++) {
                let r: IReadRegisterResultOrError = {
                  result: { data: [result.result!.data[idx]], buffer: Buffer.allocUnsafe(2) },
                }
                r.result!.buffer.writeUIntBE(result.result!.data[idx], 0, 2)
                resultMaps.get(address.registerType)!.set(address.address + idx, r)
              }
            else resultMaps.get(address.registerType)!.set(address.address, result)

            if (this.countResults(values) == addressCount) resolve(values)
          },
          (currentEntry, error) => {
            let r: IReadRegisterResultOrError = { error: error }

            if (!this.errorHandler(currentEntry, r, options)) resultCount++

            if (address.length != undefined)
              for (let idx = 0; idx < address.length; idx++) resultMaps.get(address.registerType)!.set(address.address + idx, r)
            else resultMaps.get(address.registerType)!.set(address.address, r)
        
            if (this.countResults(values) == addressCount) resolve(values)
          },options
        )
      })
    })
  }
}
