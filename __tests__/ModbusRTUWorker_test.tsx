import { describe, expect, it } from '@jest/globals'
import { IModbusAPI, ModbusRTUWorker } from '../src/ModbusRTUWorker'
import { ReadRegisterResultWithDuration } from '../src/bus'
import { ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
let data = 198
class FakeBus implements IModbusAPI {
  writeHoldingRegisters(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {                     
    return new Promise<void>((resolve) => {
        expect(data.data[0]).toBeGreaterThanOrEqual( 200)
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
    return new Promise<ReadRegisterResultWithDuration>((_resolve, reject) => {
      reject(new Error('Error'))
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
  public callCount: number
  public isRunningForTest: boolean
  constructor(
    modbusAPI: IModbusAPI,
    queue: ModbusRTUQueue,
    private done: () => void,
    private expectedCallCount: number,
    private testcase:string
  ) {
    super(modbusAPI, queue)
    this.callCount = 0
    this.isRunningForTest = false
  }
  override onFinish(): void {                    
   expect(this.callCount).toBe(this.expectedCallCount)
    this.done()
  }
}
interface Itest  { worker?: ModbusRTUWorkerForTest }
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
      test.worker!.callCount++
      test.worker!.isRunningForTest = false
      
    },
    (e) => {}
  )
}
function enqueueWrite(queue: ModbusRTUQueue, num: number, test: Itest) {
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.HoldingRegister, address: num, write: {data:[num], buffer:Buffer.allocUnsafe(2)} },
      () => {
        // validate no paralell processing
        expect(test.worker!.isRunningForTest).toBeFalsy()
        test.worker!.isRunningForTest = true
       
        test.worker!.callCount++
                       
        test.worker!.isRunningForTest = false
        
      },
      (e) => {}
    )
  }
describe('ModbusRTUWorker read', () => {
  it('Sequential read successful processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test:Itest = { }
    enqueue(queue, 199, test)
    enqueue(queue, 200,test)

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 3, "read")
    test.worker.run()
    // Hopefully, the run process resetted the queue before next queue entry is added
    enqueue(queue, 201, test)
  })
  it('Sequential read error processing', (done) => {
    let queue = new ModbusRTUQueue()
    let test:Itest = { }
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 199 },
      (result) => {
        // should not be called, because of error
        expect(true).toBeFalsy()
      },
      (e) => {
        test.worker!.callCount++
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 1, "read")
    test.worker.run()
  })
})
describe('ModbusRTUWorker write', () => {
    it('Sequential read and write successful processing', (done) => {
      let queue = new ModbusRTUQueue()
      let test:Itest = { }
      data = 198
      enqueue(queue, 199, test)
      enqueueWrite(queue, 200, test)
  
      test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 3, "write")
      test.worker.run()
      // Hopefully, the run process resetted the queue before next queue entry is added
      enqueueWrite(queue, 201,test)
    })
    it('Sequential read error processing', (done) => {
      let queue = new ModbusRTUQueue()
      let test:Itest = { }
      queue.enqueue(
        1,
        { registerType: ModbusRegisterType.Coils, address: 199 },
        (result) => {
          // should not be called, because of error
          expect(true).toBeFalsy()
        },
        (e) => {
          test.worker!.callCount++
        }
      )
  
      test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 1, "writeExcpetion")
      test.worker.run()
    })
  })