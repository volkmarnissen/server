import { Converter } from './converter'
import {
  Ientity,
  Ispecification,
  getSpecificationI18nEntityOptionName,
  getSpecificationI18nEntityOptionId,
  IselectOption,
  Iselect,
  ModbusRegisterType,
  Converters,
} from '../specification.shared'
import { LogLevelEnum, Logger } from './log'
import { ReadRegisterResult } from './converter'
import { ConfigSpecification } from './configspec'
const debug = require('debug')('selectConverter')

const log = new Logger('selectconverter')
export class SelectConverter extends Converter {
  length: number = 1

  constructor(component?: Converters) {
    if (!component) component = 'select'
    super(component)
  }
  private getOptions(spec: Ispecification, entityid: number): IselectOption[] {
    let entity = spec.entities.find((e) => e.id == entityid)
    if (entity && entity.converterParameters) {
      if ('options' in entity.converterParameters && entity.converterParameters.options) {
        return entity.converterParameters.options
      } else if ('optionModbusValues' in entity.converterParameters && entity.converterParameters.optionModbusValues) {
        let options: IselectOption[] = []
        entity.converterParameters.optionModbusValues.forEach((option) => {
          let name = getSpecificationI18nEntityOptionName(spec, ConfigSpecification.mqttdiscoverylanguage!, entityid, option)
          options.push({ key: option, name: name ? name : '' })
        })
        return options
      }
    }
    debug('No options available for entity id: ' + entityid)
    return []
  }
  override publishModbusValues(): boolean {
    return true
  }
  override modbus2mqtt(spec: Ispecification, entityid: number, value: number[]): number | string {
    let entity = spec.entities.find((e) => e.id == entityid)
    var msg = ''
    if (entity) {
      let opts: IselectOption[] | undefined = (entity.converterParameters as Iselect).options
      if (opts && opts.length > 0) {
        let opt = (entity.converterParameters as Iselect)!.options!.find((opt) => opt.key == value[0])
        return opt && opt.name ? opt.name : ''
      } else {
        var rc = getSpecificationI18nEntityOptionName(spec, ConfigSpecification.mqttdiscoverylanguage!, entityid, value[0])
        if (rc) return rc
      }
      let options = this.getOptions(spec, entityid)
      var msg =
        'option not found spec: ' +
        spec.filename +
        ' entity id: "' +
        entity.id +
        '" key:' +
        value[0] +
        ' options: ' +
        JSON.stringify(options)
    } else msg = 'entityid not in entities list: "' + entityid + '" key:' + value[0]
    return msg
  }
  override mqtt2modbus(spec: Ispecification, entityid: number, name: string): number[] {
    let entity = spec.entities.find((e) => e.id == entityid)
    if (!entity) throw new Error('entity not found in entities')

    if (this.component === 'binary') return []
    let val = getSpecificationI18nEntityOptionId(spec, ConfigSpecification.mqttdiscoverylanguage!, entityid, name)
    if (val) {
      let buf = Buffer.alloc(2)
      buf.writeInt16BE(val[0])
      return val
    }

    let options = this.getOptions(spec, entityid)
    var msg = 'unknown option  entity id: ' + entity.id + '(assuming: name = 0)' + name + 'options: ' + options
    log.log(LogLevelEnum.error, msg)
    return []
  }
  override getParameterType(_entity: Ientity): string | undefined {
    switch (this.component) {
      case 'binary':
        return 'Ibinary_sensor'
      default:
        return 'Iselect'
    }
  }

  override getModbusRegisterTypes(): ModbusRegisterType[] {
    return [ModbusRegisterType.HoldingRegister, ModbusRegisterType.AnalogInputs, ModbusRegisterType.Coils]
  }
}
