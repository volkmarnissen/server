import { Converter } from './converter'
import { NumberConverter } from './numberConverter'
import { TextConverter } from './textConverter'
import { SelectConverter } from './selectConverter'
import { ValueConverter } from './valueconverter'
import { Ientity, Converters } from '../specification.shared'
import { BinaryConverter } from './binaryConverter'
import { ConfigSpecification } from './configspec'

export class ConverterMap extends Map<Converters, Converter> {
  private static converterMap = new ConverterMap()
  private static getConverterMap(): ConverterMap {
    return ConverterMap.converterMap
  }

  static getConverters(): Converters[] {
    let rc: Converters[] = []
    ConverterMap.getConverterMap().forEach((con, name) => {
      rc.push(name)
    })
    return rc
  }

  static getConverter(entity: Ientity): Converter | undefined {
    let cv: Converter | undefined = undefined
    if (entity.converter) cv = ConverterMap.getConverterMap().get(entity.converter)
    return cv
  }
  //@ts-ignore
  private static _initialize = (() => {
    if (ConverterMap.converterMap.size == 0) {
      // read/write not a sensor
      ConverterMap.converterMap.set('number', new NumberConverter())
      ConverterMap.converterMap.set('select', new SelectConverter())
      ConverterMap.converterMap.set('text', new TextConverter())
      ConverterMap.converterMap.set('binary', new BinaryConverter())
      ConverterMap.converterMap.set('value', new ValueConverter())
    }
  })()
}
