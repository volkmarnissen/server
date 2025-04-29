import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared'
import { IModbusResultOrError, ImodbusValues, emptyModbusValues } from '@modbus2mqtt/specification'
import { ImodbusAddress } from '@modbus2mqtt/server.shared'

export function getReadRegisterResult(n: number): IModbusResultOrError {
  let one: IModbusResultOrError = {
    data: [n],
  }
  return one
}

export function submitGetHoldingRegisterRequest(slaveid: number, addresses: Set<ImodbusAddress>): Promise<ImodbusValues> {
  return new Promise<ImodbusValues>((resolve, reject) => {
    let rc = emptyModbusValues()
    if (slaveid > 10) {
      reject(new Error('terminate more slaveid '))
      return
    }

    addresses.forEach((addr) => {
      let a = addr.address
      let m = rc.holdingRegisters
      switch (addr.registerType) {
        case ModbusRegisterType.AnalogInputs:
          m = rc.analogInputs
          break
        case ModbusRegisterType.Coils:
          m = rc.coils
          break
        case ModbusRegisterType.DiscreteInputs:
          m = rc.discreteInputs
          break
      }
      if (slaveid == 1)
        switch (a) {
          case 0:
            m.set(addr.address, getReadRegisterResult(1))
            break
          case 1:
            m.set(addr.address, getReadRegisterResult(1))
            break
          case 2:
            m.set(addr.address, getReadRegisterResult(1))
            break
          case 3:
            m.set(addr.address, getReadRegisterResult(1))
            break
          case 4:
            m.set(addr.address, getReadRegisterResult(210))
            break
          default:
            m.set(addr.address, { error: new Error('failed!!!') })
        }
      else
        switch (a) {
          case 3:
            m.set(addr.address, getReadRegisterResult(2))
            break
          case 5:
            m.set(addr.address, getReadRegisterResult((65 << 8) | 66))
            break
          case 6:
            m.set(addr.address, getReadRegisterResult((67 << 8) | 68))
            break
          case 7:
          case 8:
          case 9:
            m.set(addr.address, getReadRegisterResult(0))
            break
          default:
            m.set(addr.address, getReadRegisterResult(3))
        }
    })

    resolve(rc)
  })
}
