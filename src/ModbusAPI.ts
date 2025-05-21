import { ImodbusAddress, ModbusTasks, ModbusErrorStates, IRTUConnection, ITCPConnection, IModbusConnection, ImodbusStatusForSlave } from "@modbus2mqtt/server.shared";
import { ImodbusValues, Logger, LogLevelEnum } from "@modbus2mqtt/specification";
import { ModbusRegisterType } from "@modbus2mqtt/specification.shared";
import { Mutex } from "async-mutex";
import ModbusRTU from "modbus-serial";
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";
import { IModbusResultWithDuration } from "./bus";
import { Config } from "./config";
import { IexecuteOptions, ModbusRTUProcessor } from "./ModbusRTUProcessor";
import { IModbusAPI } from "./ModbusWorker";
import { submitGetHoldingRegisterRequest } from "./submitRequestMock";
import { ModbusRTUWorker } from "./ModbusRTUWorker";
import { IQueueOptions, ModbusRTUQueue } from "./ModbusRTUQueue";
import Debug from 'debug'

const log = new Logger('bus')
const debug = Debug('bus')
export interface IconsumerModbusAPI{
      getName(): string
      writeModbusRegister:(
          slaveId: number,
          address: number,
          registerType: ModbusRegisterType,
          data: number[],
          options: IQueueOptions
        )=> Promise<void>
      readModbusRegister:(slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions)=> Promise<ImodbusValues>     
}
export interface IModbusConfiguration{
    getId: ()=>number,
    getName: ()=>string,
    getSlaveTimeoutBySlaveId: (slaveid:number)=>number
    getModbusConnection:()=>IModbusConnection
}

export class ModbusAPI implements IModbusAPI, IconsumerModbusAPI{
  private modbusClient: ModbusRTU | undefined
  private modbusClientTimedOut: boolean = false
  private _modbusRTUWorker: ModbusRTUWorker
    constructor( private modbusConfiguration: IModbusConfiguration, private modbusRTUQueue = new ModbusRTUQueue(),
    private modbusRTUprocessor = new ModbusRTUProcessor(modbusRTUQueue)
){
        this._modbusRTUWorker = new ModbusRTUWorker(this, modbusRTUQueue)
}
getCacheId(): string {
    return this.modbusConfiguration.getName()
}
getName(): string{
    return this.modbusConfiguration.getName()
}

readModbusRegister(slaveId: number, addresses: Set<ImodbusAddress>, options: IexecuteOptions): Promise<ImodbusValues> {
    if (Config.getConfiguration().fakeModbus) return submitGetHoldingRegisterRequest(slaveId, addresses)

    if (this.modbusClient && this.modbusClient.isOpen) return this.modbusRTUprocessor.execute(slaveId, addresses, options)
    else
      return new Promise<ImodbusValues>((resolve, reject) => {
        this.connectRTU('InitialConnect')
          .then(() => {
            return this.modbusRTUprocessor.execute(slaveId, addresses, options).then(resolve).catch(reject)
          })
          .catch((e) => {
            let addr = addresses.values().next().value
            if (addr) {
              let date = new Date()
              this._modbusRTUWorker.addError(
                {
                  slaveId: slaveId,
                  address: addr,
                  onResolve: (qe) => {},
                  onError: (e) => {},
                  options: { task: ModbusTasks.initialConnect, errorHandling: {} },
                },
                ModbusErrorStates.initialConnect,
                date
              )
            }
            reject(e)
          })
      })
  }

  writeModbusRegister(
    slaveId: number,
    address: number,
    registerType: ModbusRegisterType,
    data: number[],
    options: IexecuteOptions
  ): Promise<void> {
    let executeWrite = (onResolve: () => void, onReject: (e: any) => void) => {
      let addr: ImodbusAddress = { address: address, length: data.length, registerType: registerType, write: data }
      this.modbusRTUQueue.enqueue(slaveId, addr, onResolve, onReject, options)
    }
    if (this.modbusClient && this.modbusClient.isOpen)
      return new Promise((onResolve, onReject) => {
        executeWrite.bind(this)(onResolve, onReject)
      })
    else
      return new Promise<void>((resolve, reject) => {
        this.connectRTU('InitialConnect')
          .then(() => {
            executeWrite.bind(this)(resolve, reject)
          })
          .catch(reject)
      })
  }

  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        reject(new Error('modbusClient is undefined'))
      } else {
        this.prepareRead(slaveid)

        let start = Date.now()
        this.modbusClient!.readHoldingRegisters(dataaddress, length)
          .then((result) => {
            this.clearModbusTimout()
            let rc: IModbusResultWithDuration = {
              data: result.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            e.duration = Date.now() - start
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readInputRegisters(dataaddress, length)
          .then((result) => {
            this.clearModbusTimout()
            let rc: IModbusResultWithDuration = {
              data: result.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readDiscreteInputs(dataaddress, length)
          .then((resolveBoolean) => {
            this.clearModbusTimout()
            let readResult: ReadRegisterResult = {
              data: [],
              buffer: Buffer.allocUnsafe(0),
            }
            resolveBoolean.data.forEach((d) => {
              readResult.data.push(d ? 1 : 0)
            })
            let rc: IModbusResultWithDuration = {
              data: readResult.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    let rc = new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.modbusClient == undefined) {
        log.log(LogLevelEnum.error, 'modbusClient is undefined')
        return
      } else {
        this.prepareRead(slaveid)
        let start = Date.now()
        this.modbusClient!.readCoils(dataaddress, length)
          .then((resolveBoolean) => {
            this.clearModbusTimout()
            let readResult: ReadRegisterResult = {
              data: [],
              buffer: Buffer.allocUnsafe(0),
            }
            resolveBoolean.data.forEach((d) => {
              readResult.data.push(d ? 1 : 0)
            })
            let rc: IModbusResultWithDuration = {
              data: readResult.data,
              duration: Date.now() - start,
            }
            resolve(rc)
          })
          .catch((e) => {
            this.setModbusTimout(reject, e)
          })
      }
    })
    return rc
  }
 
  private prepareRead(slaveid: number) {
     this.modbusClient!.setID(slaveid)
     let slaveTimout = this.modbusConfiguration.getSlaveTimeoutBySlaveId(slaveid)
     if (slaveTimout == undefined) slaveTimout = (this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout
       this.modbusClient!.setTimeout(slaveTimout)
   }
   getMaxModbusTimeout() {
     return (this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout
   }
 
   writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
     let rc = new Promise<void>((resolve, reject) => {
       if (this.modbusClient == undefined) {
         log.log(LogLevelEnum.error, 'modbusClient is undefined')
         return
       } else {
         this.modbusClient!.setID(slaveid)
         this.modbusClient!.setTimeout((this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout)
         this.modbusClient!.writeRegisters(dataaddress, data)
           .then(() => {
             this.modbusClientTimedOut = false
             resolve()
           })
           .catch((e) => {
             this.setModbusTimout(reject, e)
           })
       }
     })
     return rc
   }
   writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
     let rc = new Promise<void>((resolve, reject) => {
       if (this.modbusClient == undefined) {
         log.log(LogLevelEnum.error, 'modbusClient is undefined')
         return
       } else {
         this.modbusClient!.setID(slaveid)
         this.modbusClient!.setTimeout((this.modbusConfiguration.getModbusConnection() as IRTUConnection).timeout)
         let dataB: boolean[] = []
         data.forEach((d) => {
           dataB.push(d == 1)
         })
         if (dataB.length === 1) {
           //Using writeCoil for single value in case of situation that device does not support multiple at once like
           // LC Technology relay/input boards
           this.modbusClient!.writeCoil(dataaddress, dataB[0])
             .then(() => {
               this.modbusClientTimedOut = false
               resolve()
             })
             .catch((e) => {
               this.setModbusTimout(reject, e)
             })
         } else {
           this.modbusClient!.writeCoils(dataaddress, dataB)
             .then(() => {
               this.modbusClientTimedOut = false
               resolve()
             })
             .catch((e) => {
               this.setModbusTimout(reject, e)
             })
         }
       }
     })
     return rc
   }
   setModbusTimout(reject: (e: any) => void, e: any) {
     this.modbusClientTimedOut = e.errno && e.errno == 'ETIMEDOUT'
     reject(e)
   }
   clearModbusTimout() {
     this.modbusClientTimedOut = false
   }
 
   private connectMutex = new Mutex()
   private connectRTUClient(): Promise<void> {
     return new Promise<void>((resolve, reject) => {
       let resolveRelease= ()=>{
           this.connectMutex.release()
           resolve()
       }
       let rejectRelease= (e:any)=>{
           this.connectMutex.release()
           reject(e)
       }
       // Make sure, this modbusClient get's initialized only once. Even if called in paralell
       this.connectMutex.acquire().then(()=>{
         if (this.modbusClient == undefined) this.modbusClient = new ModbusRTU()
         if (this.modbusClient.isOpen) {
           resolveRelease()
           return
         }
 
         // debug("connectRTUBuffered")
         let port = (this.modbusConfiguration.getModbusConnection() as IRTUConnection).serialport
         let baudrate = (this.modbusConfiguration.getModbusConnection() as IRTUConnection).baudrate
         if (port && baudrate) {
           this.modbusClient.connectRTUBuffered(port, { baudRate: baudrate }).then(resolveRelease).catch(rejectRelease)
         } else {
           let host = (this.modbusConfiguration.getModbusConnection() as ITCPConnection).host
           let port = (this.modbusConfiguration.getModbusConnection() as ITCPConnection).port
           this.modbusClient.connectTCP(host, { port: port }).then(resolveRelease).catch(rejectRelease)
         }
       })
     })
   }
   reconnectRTU(task: string): Promise<void> {
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
         reject(new Error(task + ' unable to open'))
       }
     })
     return rc
   }
   private connectRTU(task: string): Promise<void> {
     let rc = new Promise<void>((resolve, reject) => {
       this.connectRTUClient()
         .then(resolve)
         .catch((e) => {
           log.log(LogLevelEnum.error, task + ' ' + this.getCacheId() + ': ' + e.message)
           reject(e)
         })
     })
     return rc
   }
 
   private closeRTU(task: string, callback: Function) {
     if (this.modbusClientTimedOut) {
       debug("Workaround: Last calls TIMEDOUT won't close")
       callback()
     } else if (this.modbusClient == undefined) {
       log.log(LogLevelEnum.error, 'modbusClient is undefined')
     } else
       this.modbusClient.close(() => {
         // debug("closeRTU: " + (this.modbusClient?.isOpen ? "open" : "closed"))
         callback()
       })
   }
   private isRTUopen(): boolean {
     if (this.modbusClient == undefined) {
       log.log(LogLevelEnum.error, 'modbusClient is undefined')
       return false
     } else return this.modbusClient.isOpen
   }
   getQueue():ModbusRTUQueue{
    return this.modbusRTUQueue
   }
  cleanupCache(){
    this._modbusRTUWorker.cleanupCache()
  }
  initialConnect():Promise<void>{
    return this.connectRTU("InitialConnect")
  }
  getErrors(slaveid:number):ImodbusStatusForSlave{
    return this._modbusRTUWorker.getErrors(slaveid)
  }
}