import { FCallbackVal, IServiceVector, ServerTCP } from 'modbus-serial'
import { IQueueEntry, ModbusRTUQueue } from './modbusRTUqueue'
import { ImodbusAddress, ModbusTasks } from '@modbus2mqtt/server.shared'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { Logger, LogLevelEnum } from '@modbus2mqtt/specification'
import { Config } from './config'
import Debug from 'debug'

const log = new Logger('tcprtubridge')
let debug = Debug('tcprtubridge')

function queueRegister<T>(
  queue: ModbusRTUQueue,
  registerType: ModbusRegisterType,
  onResolve: (value?: number[]) => T,
  addr: number,
  write: number[] | undefined,
  unitID: number,
  length: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let a: ImodbusAddress = { address: addr, length: length, registerType: registerType, write: write }
    queue.enqueue(
      unitID,
      a,
      (_qe: IQueueEntry, result?: number[]) => {
        try {
          let v = onResolve(result)
          resolve(v)
        } catch (e: any) {
          reject(e)
        }
      },
      (_qe: IQueueEntry, e: any) => {
        reject(e)
      },
      { useCache: false, task: ModbusTasks.tcpBridge, errorHandling: {} }
    )
  })
}
function queueOneRegister<T>(
  queue: ModbusRTUQueue,
  registerType: ModbusRegisterType,
  mapper: (inp: number) => T,
  addr: number,
  write: number[] | undefined,
  unitID: number,
  cb: FCallbackVal<T>
): void {
  let w: number[] | undefined = undefined
  if (write != undefined) w = write
  queueRegister<T>(
    queue,
    registerType,
    (value?: number[]): T => {
      if (value && value.length < 1) throw new Error('No value returned')
      else return mapper(value![0])
    },
    addr,
    w,
    unitID,
    1
  )
    .then((value) => {
      debug('success: %d %d', addr, 1)
      cb(null, value)
    })
    .catch((e) => {
      // Timeout must be ignored. It will be handled on client side
      if (e.errno && e.errno != 'ETIMEDOUT') {
        debug('error: %d %d %s', addr, 1, e.message)
        cb(e, mapper(-1))
      } else debug('Ignoring timeout: %d %d %s', addr, 1, e.message)
    })
}

export class ModbusTcpRtuBridge {
  serverTCP: ServerTCP | undefined = undefined
  constructor(private queue: ModbusRTUQueue) {}

  static getDefaultPort(): number {
    return Config.getConfiguration().tcpBridgePort!
  }
  private static resultMapperNumber(inp: number): number {
    return inp
  }
  private static resultMapperBoolean(inp: number): boolean {
    return inp ? true : false
  }

  queueMultipleRegister(
    registerType: ModbusRegisterType,
    addr: number,
    length: number,
    unitID: number,
    cb: FCallbackVal<number[]>
  ): void {
    debug('queueing: %d %d', addr, length)
    queueRegister<number[]>(
      this.queue,
      registerType,
      (value?: number[]): number[] => {
        if (value == undefined) throw new Error('No value returned')
        else return value!
      },
      addr,
      undefined,
      unitID,
      length
    )
      .then((value) => {
        debug('success: %d %d', addr, length)
        cb(null, value)
      })
      .catch((e) => {
        // Timeout must be ignored. It will be handled on client side
        if (e.errno && e.errno != 'ETIMEDOUT') {
          debug('error: %d %d %s', addr, length, e.message)
          cb(e, [])
        } else debug('Ignoring timeout: %d %d %s', addr, length, e.message)
      })
  }
  vector: IServiceVector = {
    setRegister: (addr: number, write: number, unit: number, cb: FCallbackVal<number>) => {
      queueOneRegister<number>(
        this.queue,
        ModbusRegisterType.HoldingRegister,
        ModbusTcpRtuBridge.resultMapperNumber,
        addr,
        [write],
        unit,
        cb
      )
    },
    setCoil: (addr: number, write: boolean, unit: number, cb: FCallbackVal<boolean>) => {
      queueOneRegister<boolean>(
        this.queue,
        ModbusRegisterType.Coils,
        ModbusTcpRtuBridge.resultMapperBoolean,
        addr,
        [write ? 1 : 0],
        unit,
        cb
      )
    },
    getMultipleInputRegisters: this.queueMultipleRegister.bind(this, ModbusRegisterType.AnalogInputs),
    getMultipleHoldingRegisters: this.queueMultipleRegister.bind(this, ModbusRegisterType.HoldingRegister),

    getInputRegister: (addr: number, unit: number, cb: FCallbackVal<number>) => {
      queueOneRegister<number>(
        this.queue,
        ModbusRegisterType.AnalogInputs,
        ModbusTcpRtuBridge.resultMapperNumber,
        addr,
        undefined,
        unit,
        cb
      )
    },
    getHoldingRegister: (addr: number, unit: number, cb: FCallbackVal<number>) => {
      queueOneRegister<number>(
        this.queue,
        ModbusRegisterType.HoldingRegister,
        ModbusTcpRtuBridge.resultMapperNumber,
        addr,
        undefined,
        unit,
        cb
      )
    },
    getDiscreteInput: (addr: number, unit: number, cb: FCallbackVal<boolean>) => {
      queueOneRegister<boolean>(
        this.queue,
        ModbusRegisterType.DiscreteInputs,
        ModbusTcpRtuBridge.resultMapperBoolean,
        addr,
        undefined,
        unit,
        cb
      )
    },
    getCoil: (addr: number, unit: number, cb: FCallbackVal<boolean>) => {
      queueOneRegister<boolean>(
        this.queue,
        ModbusRegisterType.Coils,
        ModbusTcpRtuBridge.resultMapperBoolean,
        addr,
        undefined,
        unit,
        cb
      )
    },
  }
  async startServer(port: number = ModbusTcpRtuBridge.getDefaultPort()): Promise<ServerTCP> {
    let rc = new Promise<ServerTCP>((resolve, reject) => {
      this.serverTCP = new ServerTCP(this.vector, {
        host: '0.0.0.0',
        port: port,
      })

      this.serverTCP.on('socketError', function (err: any) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge' + err!.message + ' (Continue w/o TCP bridge)')
      })
      this.serverTCP.on('serverError', function (err) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge: ' + err!.message + ' (Continue w/o TCP bridge)')
      })
      this.serverTCP.on('error', function (err) {
        // Handle socket error if needed, can be ignored
        log.log(LogLevelEnum.error, 'TCP bridge error: ' + err!.message + ' (Continue w/o TCP bridge)')
      })
      this.serverTCP.on('initialized', () => {
        log.log(LogLevelEnum.notice, 'TCP bridge: listening on modbus://0.0.0.0:' + port)
        resolve(this.serverTCP!)
      })
    })
    return rc
  }
  stopServer(cb?: () => void) {
    if (this.serverTCP)
      this.serverTCP.close(() => {
        if (cb) cb()
        this.serverTCP = undefined
      })
    else if (cb) cb()
  }
}
