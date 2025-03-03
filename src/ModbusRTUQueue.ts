import { IFunctionCode, ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { Bus, ReadRegisterResultWithDuration } from './bus'
import EventEmitter from 'events'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
const EventNewEntry = 'newEntry'
const EventCachedEntry = 'cachedEntry'
export interface ImodbusAddress {
  address: number
  registerType: ModbusRegisterType
  write?: ReadRegisterResult
  length?: number
}
export enum ModbusErrorStates {
  timeout,
  crc,
  other,
}
export interface IQueueEntry {
  slaveId: number
  address: ImodbusAddress
  onResolve: (result?: ReadRegisterResultWithDuration) => void
  onError: (queueEntry: IQueueEntry, e: any) => void
  errorState?: ModbusErrorStates
  options?: IQueueOptions
}
export interface IQueueOptions {
  useCache?: boolean
}
export class ModbusRTUQueue {
  private eventEmitter = new EventEmitter()
  private list: IQueueEntry[] = []
  constructor() {
    this.list = []
  }
  retry(entry: IQueueEntry) {
    this.list.push(entry)
    this.eventEmitter.emit('newEntry')
  }
  enqueue(
    slaveId: number,
    address: ImodbusAddress,
    onResolve: (result?: ReadRegisterResultWithDuration) => void,
    onError: (queueEntry: IQueueEntry, e: any) => void,
    options?: IQueueOptions
  ) {
    let entry: IQueueEntry = {
      slaveId: slaveId,
      address: address,
      onResolve: onResolve,
      onError: onError,
      options: options,
    }
    if (entry.options && entry.options.useCache) this.eventEmitter.emit(EventCachedEntry, entry)
    else this.retry(entry)
  }
  dequeue(): IQueueEntry | undefined {
    return this.list.shift()
  }
  addNewEntryListener(listener: () => void) {
    this.eventEmitter.addListener(EventNewEntry, listener)
  }
  addCachedEntryListener(listener: (entry: IQueueEntry) => void) {
    this.eventEmitter.addListener<IQueueEntry>(EventCachedEntry, listener)
  }
  clear() {
    this.list = []
  }
  getEntries(): IQueueEntry[] {
    return this.list
  }
  getLength(): number {
    return this.list.length
  }
}
