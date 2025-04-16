import { describe, expect, it } from '@jest/globals'
import { ModbusRTUWorker } from '../src/ModbusRTUWorker'
import { IModbusAPI } from '../src/ModbusWorker'
import { ReadRegisterResultWithDuration } from '../src/bus'
import { ModbusErrorActions, ModbusRTUQueue } from '../src/ModbusRTUQueue'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
let data = 198
class FakeBus implements IModbusAPI {
  reconnected:boolean =false
  reconnectRTU(task: string) {
    return new Promise<void>((resolve)=>{this.reconnected = true; resolve()}) 
  }
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
      switch (dataaddress){
        case 199:
          reject(new Error('Error'))
          break;
        case 200:
          let e = new Error("Error");
          (e as any).errno = "ETIMEOUT"
          reject( e)
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
  public callCount: number
  public isRunningForTest: boolean
  public expectedReconnected: boolean = false
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
   expect(this.callCount).toBe(this.expectedCallCount);
    expect((this.modbusAPI as FakeBus).reconnected).toBe( this.expectedReconnected)
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
    (e) => {return ModbusErrorActions.handledNoReconnect}
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
      (e) => {return ModbusErrorActions.handledNoReconnect}
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
        return ModbusErrorActions.notHandled
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 1, "read")
    test.worker.expectedReconnected = false
    test.worker.run()
  })
  it('Sequential read error processing with reconnect', (done) => {
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
        if( test.worker!.callCount < 2){
          queue.retry(e)
          return ModbusErrorActions.handledReconnect
        }
        else
          return ModbusErrorActions.notHandled
        
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 2, "read")
    test.worker.expectedReconnected = true
    test.worker.run()
    
})

  it('Sequential read error processing: Timeout', (done) => {
    let queue = new ModbusRTUQueue()
    let test:Itest = { }
    queue.enqueue(
      1,
      { registerType: ModbusRegisterType.Coils, address: 200 },
      (result) => {
        // should not be called, because of error
        expect(true).toBeFalsy()
      },
      (e) => {
        test.worker!.callCount++
        if(test.worker!.callCount <2){
          queue.retry(e)
          return ModbusErrorActions.handledNoReconnect
        }
        else
          return ModbusErrorActions.notHandled
      }
    )

    test.worker = new ModbusRTUWorkerForTest(new FakeBus(), queue, done, 2, "readExcpetion")
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

  })