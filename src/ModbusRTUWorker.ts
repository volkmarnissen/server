import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { Bus, ReadRegisterResultWithDuration } from './bus'
import { ModbusRTUQueue, IQueueEntry, ModbusErrorActions } from './ModbusRTUQueue'
import { IFunctionCode, ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import ModbusRTU from 'modbus-serial'
import { IModbusAPI, ModbusWorker } from './ModbusWorker'
import { IReadRegisterResultOrError, Logger, LogLevelEnum } from '@modbus2mqtt/specification'

type TModbusReadFunction = (slaveid: number, dataaddress: number, length: number) => Promise<ReadRegisterResultWithDuration>
type TModbusWriteFunction = (slaveid: number, dataaddress: number, data: ReadRegisterResult) => Promise<void>
const log = new Logger('modbusrtuworker')

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
                        if(current.onError(current, e) == ModbusErrorActions.handledReconnect)
                          this.modbusAPI.reconnectRTU('ReconnectOnError').then(()=>{
                          }).catch(e1=>{
                            log.log(LogLevelEnum.error, "Unable to reconnect: " + e1.message )
                            current.onError(current, e)
                          })
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
