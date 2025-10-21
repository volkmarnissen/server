import { Ispecification } from '../specification.shared'
import { IModbusResultOrError } from './m2mspecification'
export interface Idata {
  address: number
  value?: number
  error?: string
}
export interface IModbusData {
  coils?: Idata[]
  holdingRegisters?: Idata[]
  analogInputs?: Idata[]
  discreteInputs?: Idata[]
}
export interface IfileSpecification extends Ispecification {
  version: string
  publicSpecification?: IfileSpecification // used to compare cloned or contributed with public specs on the angular client.
  pullNumber?: number
  pullUrl?: string
  testdata: IModbusData
}
