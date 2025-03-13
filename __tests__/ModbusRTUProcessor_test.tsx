import { jest, expect, it } from "@jest/globals"
import { ModbusRegisterType } from "@modbus2mqtt/specification.shared"
import test from "node:test"
import { ModbusRTUProcessor } from "../src/ModbusRTUProcessor"
import { ImodbusAddress, ModbusRTUQueue } from "../src/ModbusRTUQueue"
function addAddresses(addresses: Set<ImodbusAddress>, registerType:ModbusRegisterType, startAddress:number,endAddress:number ){
    for( let idx= startAddress; idx < endAddress; idx++)
    addresses.add({
        address: idx,
        registerType: registerType,
      })
}
it('prepare', () => {
  let addresses = new Set<ImodbusAddress>()
  addAddresses(addresses,ModbusRegisterType.HoldingRegister, 0,4)
  addAddresses(addresses,ModbusRegisterType.HoldingRegister, 7,9)
  addAddresses(addresses,ModbusRegisterType.HoldingRegister, 27,29)
 
  addAddresses(addresses,ModbusRegisterType.Coils, 0,4)

  let queue = new ModbusRTUQueue()
  let modbusProcessor = new ModbusRTUProcessor(queue)
  let preparedAddresses = modbusProcessor['prepare'](1,addresses)
  expect(preparedAddresses.length).toBe(3)
  expect(preparedAddresses[0].address).toBe(0)
  expect(preparedAddresses[0].length).toBe(4)
  expect(preparedAddresses[0].registerType).toBe(ModbusRegisterType.Coils)
  expect(preparedAddresses[1].address).toBe(0)
  expect(preparedAddresses[1].length).toBe(9)
  expect(preparedAddresses[1].registerType).toBe(ModbusRegisterType.HoldingRegister)
  expect(preparedAddresses[2].address).toBe(27)
  expect(preparedAddresses[2].length).toBe(2)
  expect(preparedAddresses[2].registerType).toBe(ModbusRegisterType.HoldingRegister)
})

it('execute', () => {
    let addresses = new Set<ImodbusAddress>()
    addAddresses(addresses,ModbusRegisterType.HoldingRegister, 0,4)
    addAddresses(addresses,ModbusRegisterType.HoldingRegister, 7,9) 
    addAddresses(addresses,ModbusRegisterType.Coils, 0,4)
  
    let queue = new ModbusRTUQueue()
    let modbusProcessor = new ModbusRTUProcessor(queue)
    let length = queue.getLength()
    let entries = queue.getEntries()
    queue.clear
    entries.forEach( (qe,idx)=>{
        if( qe.address.registerType == ModbusRegisterType.Coils )
            qe.onResolve({result:{data:[1,1,0,0], buffer: Buffer.allocUnsafe(8)}, duration:199 })
        else
            if( qe.address.address == 0 && qe.address.length != undefined && qe.address.length > 1){
                let e:any = new Error("Timeout")
                e.errno = "ETIMEOUT"
                qe.onError(qe,e )
            }
    })

    queue.getEntries().splice(0,2) // delete processed entries
    queue.getEntries().forEach( (qe,idx)=>{
        if( qe.address.registerType == ModbusRegisterType.HoldingRegister && qe.address.length && qe.address.length == 1 )
            if( [0,1,2,3,7,8].includes(qe.address.address) )
                qe.onResolve({result:{data:[10], buffer: Buffer.allocUnsafe(2)}, duration:199 })
            else {
                let e:any = new Error("Timeout")
                e.errno = "ETIMEOUT"
                qe.onError(qe,e )
            }
    })
    modbusProcessor.execute(1,addresses).then((result)=>{

    })
  })