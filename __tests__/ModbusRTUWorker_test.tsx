import { describe, expect, it } from '@jest/globals'
import { ModbusRTUWorker } from '../src/ModbusRTUWorker'
import { IModbusAPI } from '../src/ModbusWorker'
import { IModbusResultWithDuration } from '../src/bus'
import { IQueueEntry, ModbusErrorActions, ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { ModbusTasks } from '@modbus2mqtt/server.shared'
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
  writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wroteDataCount++
      expect(data[0]).toBeGreaterThanOrEqual(200)
      resolve()
    })
  }
  writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('Error'))
    })
  }
  defaultRC = (resolve: (result: IModbusResultWithDuration) => void, reject: (e: any) => void) => {
    resolve({ data: [0], duration: 199 })
  }
  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve) => {
      data++
      resolve({ data: [data], duration: data })
    })
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.callCount > 0) {
        this.callCount = 0
        let r: IModbusResultWithDuration = {
          data: [1],
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
            let e1: any = new Error('CRC error')
            reject(e1)
            break
          case 202:
              let e2: any = new Error('CRC error')
              reject(e2)
          break
            case 200:
            let e = new Error('Error')
            ;(e as any).errno = 'ETIMEDOUT'
            reject(e)
            break
          default:
            let r: IModbusResultWithDuration = {
              data: [1],
              duration: 100,
            }
            if( length >1)
              for ( let l = 1; l < length; l++)
                  r.data.push(1)
            resolve(r)
          }
      }
    })
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
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
    (qe,data) => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true

      expect(data).toBeDefined()
      expect(data![0]).toBe(num)
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    }, { task:ModbusTasks.specification,errorHandling:{}}
  )
}
function enqueueWrite(queue: ModbusRTUQueue, num: number, test: Itest) {
  queue.enqueue(
    1,
    { registerType: ModbusRegisterType.HoldingRegister, address: num, write: [num] },
    () => {
      // validate no paralell processing
      expect(test.worker!.isRunningForTest).toBeFalsy()
      test.worker!.isRunningForTest = true
      test.worker!.isRunningForTest = false
    },
    (e) => {
      return ModbusErrorActions.handledNoReconnect
    },
    { task:ModbusTasks.specification,errorHandling:{}}
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
      (qe,result) => {
        expect(result![0]).toBe(1)
      },
      (e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task:ModbusTasks.specification,errorHandling:{retry:true}}
    )
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (qe,result) => {
        expect(result![0]).toBe(1)
      },
      (qe,e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task:ModbusTasks.specification,errorHandling:{retry:true}}
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
      (qe,result) => {
        expect(true).toBeFalsy()
      },
      (qe,e) => {
        fb.callCount = 199 // unique identifier to validate in onFinish()
      },
      { task:ModbusTasks.specification,errorHandling:{}}
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
      (qe,result) => {
        expect(result![0]).toBe(1)
      },
      (qe,e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task:ModbusTasks.specification,errorHandling:{retry:true}}
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'read')
    test.worker.expectedReconnected = true
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })

  it('Sequential read error processing with split', (done) => {
    let queue = new ModbusRTUQueue()
    let test: Itest = {}
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 202, length: 3 },
      (qe,result) => {
        expect(result![0]).toBe(1)
      },
      (qe,e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task:ModbusTasks.specification,errorHandling:{retry:true, split:true}}
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
      (qe,result) => {
        // should not be called, because of error
        expect(result![0]).toBe(1)
      },
      (qe,e) => {
        // This should not happen
        expect(true).toBeFalsy()
      },
      { task:ModbusTasks.specification,errorHandling:{retry:true}}
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 'readExcpetion')
    test.worker.expectedReconnected = false
    test.worker.expectedAPIcallCount = 0
    test.worker.run()
  })
})
function genCacheEntry(
  address: number,
  onResult: (queueEntry:IQueueEntry,result: number[] | undefined) => void,
  onError: (queueEntry:IQueueEntry,error: any) => void
): IQueueEntry {
  return {
    slaveId: 1,
    address: { address: address, length: 1, registerType: ModbusRegisterType.HoldingRegister },
    options: { useCache: true, task:ModbusTasks.specification,errorHandling:{} },
    onResolve: onResult,
    onError: onError
  }
}
class RTUWorkerCached extends ModbusRTUWorker {
  constructor(
    api: IModbusAPI,
    queue: ModbusRTUQueue,
    private onFinishP: () => void,
    public currentDate:Date = new Date(2025,1,1,5,0,0,0)
  ) {
    super(api, queue)
  }
  
  protected override getCurrentDate(): Date {
    return new Date(this.currentDate.getTime());
  } 
  override onFinish(): void {
    this.onFinishP()
  }
}
describe('ModbusRTUWorker Cache', () => {
  it('updateCacheError', () => {
    let queue = new ModbusRTUQueue()
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
      let e199 = genCacheEntry(
        199,
        (qe,result) => {},
        () => {}
      )

    worker['updateCache'](e199, [-199])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-199)
    worker['updateCache'](e199, [-201])
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    worker['updateCacheError'](e199, new Error("Error"))
    // Cache Entry is "new"
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data![0]).toBe(-201)
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeUndefined()
    worker.currentDate = new Date(2025,1,1,13,0,0,0)
    // Entry is "old"
    worker['updateCacheError'](e199, new Error("Error"))
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeUndefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.error).toBeDefined()

  })
  it('cleanupCache', () => {
    let queue = new ModbusRTUQueue()
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {})
      let e199 = genCacheEntry(
        199,
        (qe,result) => {},
        () => {}
      )
    // expired entry
    let e200 = genCacheEntry(
      200,
      (qe,result) => {},
      () => {}
    )
    worker['updateCache'](e199, [-199])
    let cd = worker.currentDate
    worker.currentDate = new Date(2025,1,1,5 - 13,0,0,0)
    worker['updateCache'](e200, [-200])
    worker.currentDate = cd
    worker['cleanupCache']()
    expect(worker['cache'].get(1)!.holdingRegisters.get(199)!.data).toBeDefined()
    expect(worker['cache'].get(1)!.holdingRegisters.get(200)).toBeUndefined()
  })
  it('Read from cache', (done) => {
    let queue = new ModbusRTUQueue()
    let onResultCallCount = 0
    let onErrorCallCount = 0
    let e199 = genCacheEntry(
      199,
      (qe,result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    let e200 = genCacheEntry(
      200,
      (qe,result) => {
        onResultCallCount++
        expect(result![0]).toBe(2)
      },
      () => {
        onErrorCallCount++
      }
    )
    let e201 = genCacheEntry(
      201,
      (qe,result) => {
        onResultCallCount++
        expect(result![0]).toBe(3)
      },
      () => {
        onErrorCallCount++
      }
    )
    let worker = new RTUWorkerCached(new FakeBus(), queue, () => {
      expect(onResultCallCount).toBe(2)
      expect(onErrorCallCount).toBe(1)
      done()
    })
    worker['updateCache'](e199, [2])
    worker['updateCacheError'](e200, new Error('Error'))
    worker['updateCache'](e201, [3])
    queue.enqueueEntry(e199)
    queue.enqueueEntry(e200)
    queue.enqueueEntry(e201)
    worker.run()
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
