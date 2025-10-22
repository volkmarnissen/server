import { Converter } from './converter'
import { Converters, Ientity, Ispecification, ModbusRegisterType } from '../specification.shared'
import { ReadRegisterResult } from './converter'

export class BinaryConverter extends Converter {
  constructor(component?: Converters) {
    if (!component) component = 'number'
    super(component)
  }
  modbus2mqtt(_spec: Ispecification, _entityid: number, value: number[]): number | string {
    return value[0] ? 'ON' : 'OFF'
  }

  override mqtt2modbus(_spec: Ispecification, _entityid: number, value: number | string): number[] {
    return value == 'ON' ? [1] : [0]
  }
  override getParameterType(_entity: Ientity): string | undefined {
    return 'Ibinary'
  }
  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.Coils, ModbusRegisterType.DiscreteInputs, ModbusRegisterType.HoldingRegister]
  }
}
