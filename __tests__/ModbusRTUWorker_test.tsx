import { describe, expect, it } from '@jest/globals'
import { ModbusRTUWorker } from '../src/ModbusRTUWorker'
import { IModbusAPI } from '../src/ModbusWorker'
import { ReadRegisterResultWithDuration } from '../src/bus'
import { ModbusErrorActions, ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
let data = 198
class FakeBus implements IModbusAPI {
  reconnected: boolean = false
  wroteDataCount: number = 0
  callCount: number = 0
  reconnectRTU(task: string) {
    return new Promise<void>((resolve) => {
      this.reconnected = true
      resolve()
    })
  }
  writeHoldingRegisters(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wroteDataCount++
      expect(data.data[0]).toBeGreaterThanOrEqual(200)
      resolve()
    })
  }
  writeCoils(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('Error'))
    })
  }
  defaultRC = (resolve: (result: ReadRegisterResultWithDuration) => void, reject: (e: any) => void) => {
    resolve({ result: { data: [0], buffer: Buffer.allocUnsafe(2) }, duration: 199 })
  }
  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    return new Promise<ReadRegisterResultWithDuration>((resolve) => {
      data++
      resolve({ result: { data: [data], buffer: Buffer.allocUnsafe(2) }, duration: data })
    })
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    return new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
      if (this.callCount > 0) {
        this.callCount = 0
        let r: ReadRegisterResultWithDuration = {
          result: { data: [1], buffer: Buffer.allocUnsafe(1) },
          duration: 100,
        }
        resolve(r)
      } else {
        this.callCount = 1
        switch (dataaddress) {
          case 197:
            {
              this.callCount = 1
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function address
              reject(e1)
            }
            break
          case 198:
            {
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function code
              reject(e1)
            }
            break
          case 199:
            let e1: any = new Error('Error')
            e1.modbusCode = 4 // CRC?
            reject(e1)
            break
          case 200:
            let e = new Error('Error')
            ;(e as any).errno = 'ETIMEDOUT'
            reject(e)
        }
      }
    })
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    return new Promise<ReadRegisterResultWithDuration>(this.defaultRC)
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
    return new Promise<ReadRegisterResultWithDuration>(this.defaultRC)
  }
}
class ModbusRTUWorkerForTest extends ModbusRTUWorker {
  public isRunningForTest: boolean
  public expectedReconnected: boolean = false
  public expectedAPIcallCount: number = 1
  public expectedAPIwroteDataCount: number = 0
  constructor(
    modbusAPI: IModbusAPI,
    queue: ModbusRTUQueue,
    private done: () => void,
    private testcase: string
  ) {
    super(modbusAPI, queue)
    this.isRunningForTest = false
  }
  override onFinish(): void {
    let fakeBus: FakeBus = this.modbusAPI as any
    expect(fakeBus.callCount).toBe(this.expectedAPIcallCount)
    expect((this.modbusAPI as FakeBus).reconnected).toBe(this.expectedReconnected)
    expect(fakeBus.wroteDataCount).toBe(this.expectedAPIwroteDataCount)
    this.done()
  }
}
interface Itest {
  worker?: ModbusRTUWorkerForTest
}
function enqueue(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num },
    (result) => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true

      expect(result).toBeDefined()
      expect(result!.duration).toBe(num)
      expect(result!.result).toBeDefined()
      expect(result!.result?.data[0]).toBe(num)
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    }
  )
}
function enqueueWrite(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num, write: { data: [num], buffer: Buffer.allocUnsafe(2) } },
    () => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    }
  )
}
describe('ModbusRTUWorker read', () => {
  it('Sequential read successful processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    enqueue(queue, 199, test) //CRC
    enqueue(queue, 200, test) //Timeout

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
    // Hopefully, the run process resetted the queue before next queue entry is added
    enqueue(queue, 201, test)
  })
  it('Sequential read error processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (result) => {
        expect(result?.result?.data[0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      }
    )
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (result) => {
        expect(result?.result?.data[0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })
  it('Sequential read error Illegal Function code', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    let fb = new FakeBus()
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 198 },
      (result) => {
        expect(true).toBeFalsy()
      },
      (e) => {
        fb.callCount = 199 // unique identifier to validate in onFinish()
      }
    )
    test.worker = new ModbusRTUWorkerForTest(fb, queue, done, 'read')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 199
    test.worker.run()
  })

  it('Sequential read error processing with reconnect', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (result) => {
        expect(result?.result?.data[0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })

  it('Sequential read error processing: Timeout', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (result) => {
        // should not be called, because of error
        expect(result?.result?.data[0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'readExcpetion')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })
})
describe('ModbusRTUWorker write', () => {
  it('Sequential read and write successful processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    data = 198
    enqueue(queue, 199, test)
    enqueueWrite(queue, 200, test)

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'write')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 0
    test.worker.expectedAPIwroteDataCount = 2
    test.worker.run()
    // Hopefully, the run process resetted the queue before next queue entry is added
    enqueueWrite(queue, 201, test)
  })
})
