import { Converter, ReadRegisterResult } from './converter'
import { Converters, Ispecification, Ivalue, ModbusRegisterType } from '../specification.shared'

export class ValueConverter extends Converter {
  override mqtt2modbus(spec: Ispecification, entityid: number, _value: string | number): number[] {
    throw new Error('fixed value has no modbus value.')
  }
  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.AnalogInputs, ModbusRegisterType.HoldingRegister]
  }
  constructor(component?: Converters) {
    if (!component) component = 'value'
    super(component)
  }
  modbus2mqtt(spec: Ispecification, entityid: number): string | number {
    let entity = spec.entities.find((e) => e.id == entityid)
    if (entity && (entity.converterParameters as Ivalue).value) return (entity.converterParameters as Ivalue).value
    else return ''
  }
}
