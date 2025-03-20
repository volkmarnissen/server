import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { Bus, ReadRegisterResultWithDuration } from './bus'
import { ModbusRTUQueue, IQueueEntry } from './ModbusRTUQueue'
import { IFunctionCode, ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import ModbusRTU from 'modbus-serial'
import { ModbusWorker } from './ModbusWorker'

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
export class ModbusRTUWorker extends ModbusWorker {
  private isRunning = false
  constructor(modbusAPI: IModbusAPI, queue: ModbusRTUQueue) {
    super(modbusAPI, queue)
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
              promise
                .then(() => {
                  if (current.address.write)
                    return this.functionCodeWriteMap.get(current.address.registerType)!(
                      current.slaveId,
                      current.address.address,
                      current.address.write
                    )
                      .then(() => {
                        current.onResolve()
                        resolve()
                      })
                      .catch((e) => {
                        current.onError(current, e)
                        resolve()
                      })
                  else
                    return this.functionCodeReadMap.get(current.address.registerType)!(
                      current.slaveId,
                      current.address.address,
                      current.address.length == undefined ? 1 : current.address.length
                    )
                      .then((result) => {
                        current.onResolve(result)
                        resolve()
                      })
                      .catch((e) => {
                        current.onError(current, e)
                        resolve()
                      })
                })
                .catch(reject)
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
