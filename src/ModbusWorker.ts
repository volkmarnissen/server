import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { Bus, ReadRegisterResultWithDuration } from './bus'
import { ModbusRTUQueue, IQueueEntry } from './ModbusRTUQueue'
import { IFunctionCode, ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import ModbusRTU from 'modbus-serial'

type TModbusReadFunction = (slaveid: number, dataaddress: number, length: number) => Promise<ReadRegisterResultWithDuration>
type TModbusWriteFunction = (slaveid: number, dataaddress: number, data: ReadRegisterResult) => Promise<void>

export interface IModbusAPI {
  readHoldingRegisters: TModbusReadFunction
  readCoils: TModbusReadFunction
  readDiscreteInputs: TModbusReadFunction
  readInputRegisters: TModbusReadFunction
  writeHoldingRegisters: TModbusWriteFunction
  writeCoils: TModbusWriteFunction
}
export class ModbusWorker {
  protected functionCodeReadMap: Map<ModbusRegisterType, TModbusReadFunction>
  protected functionCodeWriteMap: Map<ModbusRegisterType, TModbusWriteFunction>
  private modbusClient: ModbusRTU | undefined
  constructor(
    private modbusAPI: IModbusAPI,
    protected queue: ModbusRTUQueue
  ) {
    this.functionCodeReadMap = new Map<ModbusRegisterType, TModbusReadFunction>()
    this.functionCodeWriteMap = new Map<ModbusRegisterType, TModbusWriteFunction>()
    queue.addNewEntryListener(this.run.bind(this))
    queue.addCachedEntryListener(this.getCached.bind(this))
    this.functionCodeReadMap.set(ModbusRegisterType.HoldingRegister, this.modbusAPI.readHoldingRegisters)
    this.functionCodeReadMap.set(ModbusRegisterType.Coils, this.modbusAPI.readCoils)
    this.functionCodeReadMap.set(ModbusRegisterType.DiscreteInputs, this.modbusAPI.readDiscreteInputs)
    this.functionCodeReadMap.set(ModbusRegisterType.AnalogInputs, this.modbusAPI.readInputRegisters)
    this.functionCodeWriteMap.set(ModbusRegisterType.HoldingRegister, this.modbusAPI.writeHoldingRegisters)
    this.functionCodeWriteMap.set(ModbusRegisterType.Coils, this.modbusAPI.writeCoils)
  }
  /**
   * If entry is for readind: searchs for entry in cache. If not found, it forwards entry to queue
   * @param entry: Entry to search in cache
   */
  private getCached(entry: IQueueEntry): void {
    if (!entry.address.write) {
      // TODO not implemented
    }
    // not found in cache
    this.queue.retry(entry)
  }

  run(): void {
    let current: IQueueEntry | undefined = undefined
    while (undefined != (current = this.queue.dequeue())) {
      if (current.address.write)
        this.functionCodeWriteMap.get(current.address.registerType)!(
          current.slaveId,
          current.address.address,
          current.address.write
        )
          .then(() => {
            current!.onResolve()
          })
          .catch((e) => {
            current!.onError(current!, e)
          })
      else
        this.functionCodeReadMap.get(current.address.registerType)!(
          current.slaveId,
          current.address.address,
          current.address.length == undefined ? 1 : current.address.length
        )
          .then((result) => {
            current!.onResolve(result)
          })
          .catch((e) => {
            current!.onError(current!, e)
          })
    }
  }
}
