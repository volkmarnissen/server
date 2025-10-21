import { ConverterMap } from '../../src/server/convertermap'
import { Converters, EnumNumberFormat, Ientity, Ispecification, ModbusRegisterType } from '../../src/specification.shared'
import { ConfigSpecification } from '../../src/server/configspec'
import { it, expect, beforeAll } from '@jest/globals'

ConfigSpecification.setMqttdiscoverylanguage('en', undefined)
let spec: Ispecification = {
  entities: [
    {
      id: 1,
      mqttname: 'mqtt',
      converter: 'number' as Converters,
      modbusAddress: 4,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { multiplier: 0.1, offset: 0, uom: 'cm', identification: { min: 0, max: 200 } },
    },
    {
      id: 2,
      mqttname: 'mqtt2',
      converter: 'select_sensor' as Converters,
      modbusAddress: 2,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [1, 2, 3] },
    },
    {
      id: 3,
      mqttname: 'mqtt3',
      converter: 'select_sensor' as Converters,
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [0, 1, 2, 3] },
    },
  ],
  status: 2,
  manufacturer: 'unknown',
  model: 'QDY30A',
  filename: 'waterleveltransmitter',
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'e1o.1', text: 'ON' },
        { textId: 'e1o.0', text: 'OFF' },
        { textId: 'e1o.2', text: 'test' },
      ],
    },
  ],
  files: [],
}

it('test sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 0 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = parseFloat(sensorConverter?.modbus2mqtt(spec, entity.id, [5]) as string)
  expect(mqttValue).toBe(0.05)
})
it('test sensor converter with stringlength', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let r = [5, 6, 7]
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r)
  expect(parseFloat(mqttValue as string)).toBe(5)
})
it('test binary_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [0])
  expect(mqttValue).toBe('OFF')
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [1])
  expect(mqttValue).toBe('ON')
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    converterParameters: { optionModbusValues: [0, 1] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [2])
  expect(mqttValue).toBe('ON')
})
it('test select_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [1])
  expect(mqttValue).toBe('ON')
  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [2])
  expect(mqttValue).toBe('test')
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [0, 1] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  sensorConverter = ConverterMap.getConverter(entity)
})
let r68 = [(65 << 8) | 66, (67 << 8) | 68]
let r69 = [(65 << 8) | 66, (67 << 8) | 68, 69 << 8]

it('test text_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'text',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)

  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r68)
  expect(mqttValue).toBe('ABCD')

  mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, r69)
  expect(mqttValue).toBe('ABCDE')
})

it('test value_sensor converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'value',
    converterParameters: { value: 'testValue' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let sensorConverter = ConverterMap.getConverter(entity)
  let mqttValue = sensorConverter?.modbus2mqtt(spec, entity.id, [])
  expect(mqttValue).toBe('testValue')
})

it('test text converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'text',
    converterParameters: { stringlength: 10 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(entity)
  let mqttValue = converter?.modbus2mqtt(spec, entity.id, r68)
  expect(mqttValue).toBe('ABCD')
  let modbusValue: any = converter!.mqtt2modbus(spec, entity.id, 'ABCD')
  expect(modbusValue).toEqual([(65 << 8) | 66, (67 << 8) | 68])
  modbusValue = converter!.mqtt2modbus(spec, entity.id, 'ABCDE')
  expect(modbusValue).toEqual([(65 << 8) | 66, (67 << 8) | 68, 69 << 8])
})

it('test number converter ignore decimal places when returning float', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 0, decimals: 1 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let mqttValue = parseFloat(converter?.modbus2mqtt(spec, entity.id, [6]) as string)
  expect(mqttValue).toBe(0.06)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 0.07)
  // rounding is not relevant
  expect(Math.abs(modbusValue![0] - 7)).toBeLessThan(0.00001)

  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 0.01, offset: 20 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 20.07)
  expect(Math.abs(modbusValue![0] - 7)).toBeLessThan(0.00001)
})
it('test number float', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.float32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 17.3)
  expect(modbusValue![0]).toBe(16778)
  expect(modbusValue![1]).toBe(26214)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(Math.abs(mqtt! - 17.3)).toBeLessThan(0.00001)
})

it('test number signed int16', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt16 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, -3)
  expect(modbusValue![0]).toBeGreaterThan(0)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(-3)
})

it('test number signed int32 - positive', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 20)

  expect(modbusValue![1]).toBeGreaterThan(0)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(20)
})

it('test number signed int32 - positive max', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 2147483647)

  expect(modbusValue![0]).toBeGreaterThan(0)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(2147483647)
})

it('test number signed int32 - negative', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.signedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, -1147483647)

  expect(modbusValue![0]).toBeGreaterThan(0)
  expect(modbusValue![1]).toBeGreaterThan(0)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(-1147483647)
})

it('test number unsigned int32 - max', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'number',
    converterParameters: { multiplier: 1, offset: 0, numberFormat: EnumNumberFormat.unsignedInt32 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]

  let converter = ConverterMap.getConverter(spec.entities[0])
  let modbusValue: number[] | undefined = converter?.mqtt2modbus(spec, entity.id, 4294967295)

  expect(modbusValue![0]).toBeGreaterThan(0)
  let mqtt: number = converter?.modbus2mqtt(spec, entity.id, modbusValue!) as number
  expect(mqtt).toBe(4294967295)
})

it('test select converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(entity)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 'test')
  expect(modbusValue![0]).toBe(2)
  entity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'select',
    converterParameters: { optionModbusValues: [1, 2] },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  converter = ConverterMap.getConverter(entity)
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 'ON')
})
it('test button converter', () => {
  let entity: Ientity = {
    id: 1,
    mqttname: 'mqtt',
    converter: 'binary',
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  spec.entities = [entity]
  let converter = ConverterMap.getConverter(entity)
  let modbusValue = converter?.mqtt2modbus(spec, entity.id, 'ON')
  expect(modbusValue![0]).toBe(1)
  modbusValue = converter?.mqtt2modbus(spec, entity.id, 'OFF')
  expect(modbusValue![0]).toBe(0)
})
