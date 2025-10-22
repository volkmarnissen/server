export enum HttpErrorsEnum {
  OK = 200,
  OkCreated = 201,
  OkAccepted = 202,
  OkNonAuthoritativeInformation = 203,
  OkNoContent = 204,
  ErrBadRequest = 400,
  ErrUnauthorized = 401,
  ErrForbidden = 403,
  ErrNotFound = 404,
  ErrNotAcceptable = 406,
  ErrRequestTimeout = 408,
  ErrInvalidParameter = 422,
  SrvErrInternalServerError = 500,
}
export const BUS_TIMEOUT_DEFAULT = 500
export enum ModbusRegisterType {
  IllegalFunctionCode = 0,
  Coils = 1,
  DiscreteInputs = 2,
  HoldingRegister = 3,
  AnalogInputs = 4,
}
export enum EnumNumberFormat {
  default = 0,
  float32 = 1,
  signedInt16 = 2,
  signedInt32 = 3,
  unsignedInt32 = 4,
}
export enum EnumStateClasses {
  none = 0,
  measurement = 1,
  total = 2,
  total_increasing = 3,
}
export interface IimportMessages {
  warnings: string
  errors: string
}
export interface IselectOption extends Iname {
  key: number
}

export interface Iselect extends Islave_class {
  optionModbusValues?: number[]
  options?: IselectOption[]
  identification?: RegExp
}

export interface Islave_class {
  device_class?: string
}
export interface Inumber extends Islave_class {
  multiplier?: number
  offset?: number
  numberFormat?: EnumNumberFormat
  decimals?: number
  state_class?: EnumStateClasses
  uom?: string
  step?: number
  swapWords?: boolean
  swapBytes?: boolean
  identification?: IminMax
}
export interface Itext {
  stringlength: number
  swapBytes?: boolean
  identification?: string
}
export interface Ivalue {
  value: string
}
export interface IFunctionCode {
  registerType: ModbusRegisterType
  name: string
}
export interface Icvtparameter {
  reqPara: string[]
  optPara: string[]
  needsOptions: boolean
}

export function jsonConverter<K, V>(body: Object, cnv: (a: string) => K): Map<K, V> {
  let m = new Map<K, V>()
  for (var prop in body) {
    if (Object.prototype.hasOwnProperty.call(body, prop)) {
      m.set(cnv(prop), (body as any)[prop])
    }
  }
  return m
}

export enum IdentifiedStates {
  notIdentified = 0,
  identified = 1,
  unknown = -1,
}

export enum SpecialEntityIds {
  deviceIdentities = -1000,
}
export enum VariableTargetParameters {
  deviceIdentifiers = 1,
  deviceSerialNumber = 5,
  deviceSWversion = 6,
  entityUom = 2,
  entityMultiplier = 3,
  entityOffset = 4,
  noParam = 0,
}

export type Converters = 'number' | 'select' | 'text' | 'binary' | 'value'
export type ConverterParameter = Inumber | Iselect | Itext | Ivalue

export interface Iname {
  name: string
}
export interface Iid {
  id: number
}

export interface IminMax {
  min: number
  max: number
}
export interface IidentEntity extends Iid{
  name?:string,
  readonly:boolean,
  mqttname?:string
}
export interface Ientity extends IidentEntity {
  converter: Converters
  variableConfiguration?: {
    targetParameter: VariableTargetParameters
    entityId?: number
  }
  value_template?: string
  registerType: ModbusRegisterType
  modbusAddress: number
  icon?: string
  forceUpdate?: boolean
  entityCategory?: string
  converterParameters?: ConverterParameter
}
export function getParameterType(converter: Converters | null | undefined): string | undefined {
  if (converter)
    switch (converter  ) {
      case 'text':
        return 'Itext'
      case 'number':
        return 'Inumber'
      case 'select':
        return 'Iselect'
      case 'value':
        return 'Ivalue'
      case 'binary':
        return ''
      default:
    }
  return undefined
}
export function cleanConverterParameters(entity: Ientity) {
  let o: any = entity.converterParameters
  var validKeys: string[] | undefined = undefined
  switch (getParameterType(entity.converter)) {
    case 'Inumber':
      validKeys = ['multiplier', 'offset', 'uom', 'device_class', 'identification']
      break
    case 'Itext':
      validKeys = ['stringlength', 'identification']
      break
    case 'Ivalue':
      validKeys = ['value']
      break
    case 'Iselect':
      validKeys = ['options']
      break
  }
  if (!validKeys) return
  let availableKeys = Object(o)
  for (let k in availableKeys) {
    if (
      validKeys.findIndex((vk) => {
        return k === vk
      }) < 0
    )
      delete o[k]
  }
}
export function removeModbusData(entity: Ientity) {
  let o: any = entity
  delete o.modbusValue
  delete o.mqttValue
  delete o.identified
}
export interface ImodbusEntityAndMessages {
  ent: ImodbusEntity | undefined
  messages: string[]
}
export interface ImodbusData {
  id: number
  modbusValue: number[]
  mqttValue: string | number
  identified: IdentifiedStates
}
export interface ImodbusEntity extends ImodbusData, Ientity {}

export function instanceOfIentity(object: any): object is Ientity {
  return 'name' in object && 'converter' in object && 'converterParameters' in object && 'converterOptions' in object
}
export function instanceOfIModbusEntity(object: any): object is ImodbusEntity {
  return instanceOfIentity(object) && 'modbusValue' in object && 'mqttValue' in object
}

declare global {
  interface Array<T> {
    errormessage: string
  }
}

export const SPECIFICATION_VERSION = '0.4'
export const SPECIFICATION_FILES_VERSION = '0.1'

export const enum SpecificationStatus {
  published = 0,
  cloned = 1,
  added = 2,
  new = 3,
  contributed = 4,
}
export const enum SpecificationFileUsage {
  img = 'img',
  documentation = 'doc',
  icon = 'icon',
  unknown = '',
}

export interface Iidentification {
  entity: string
  min?: number
  max?: number
  regex?: string
  isValid?: boolean
}

export enum FileLocation {
  Local = 0,
  Global = 1,
}

export interface IimageAndDocumentUrl {
  url: string
  fileLocation: FileLocation
  usage: SpecificationFileUsage
}
export interface ISpecificationText {
  textId: string
  text: string
}
export interface ISpecificationTexts {
  lang: string
  texts: ISpecificationText[]
}
;[]
export interface IUpdatei18nText {
  key: string
  i18n: ISpecificationTexts[]
}

export interface IbaseSpecification {
  filename: string
  model?: string // required
  manufacturer?: string
  files: IimageAndDocumentUrl[]
  status: SpecificationStatus
  identification?: Iidentification[]
  i18n: ISpecificationTexts[]
  nextEntityId?: number // required for cloned specs.The entityId should never be reused for a specification regardles of the specification status (public or cloned). Then entity comparision is possible
}

export interface ImodbusSpecification extends IbaseSpecification {
  identified: IdentifiedStates
  entities: ImodbusEntity[]
  pullUrl?: string
}
export interface Ispecification extends IbaseSpecification {
  entities: Ientity[]
}

export interface ImodbusSpecificationAndMessages {
  spec: ImodbusSpecification | undefined
  messages: string[]
}
export function getSpecificationI18nText(
  spec: IbaseSpecification,
  language: string,
  textId: string,
  noFallbackLanguage: boolean = false
): string | null {
  if (!spec || !spec.i18n) return null
  let texts = spec.i18n.find((i18) => i18.lang === language)
  let enTexts = spec.i18n.find((i18) => i18.lang === 'en')
  if (texts) {
    let text = texts.texts.find((tx) => tx.textId === textId)
    if (text) return text.text
  }
  if (enTexts && !noFallbackLanguage) {
    let text = enTexts.texts.find((tx) => tx.textId === textId)
    if (text) return text.text
  }

  return null
}
export function setSpecificationI18nText(
  spec: IbaseSpecification,
  language: string,
  textId: string,
  text: string | null | undefined
): void {
  if (!spec || !spec.i18n) return
  let texts = spec.i18n.find((i18) => i18.lang === language)
  if (!texts) {
    if (text) spec.i18n.push({ lang: language, texts: [] })
    else return
    texts = spec.i18n[spec.i18n.length - 1]
  }
  let textIndex = texts.texts.findIndex((tx) => tx.textId === textId)

  if (textIndex >= 0) {
    if (text) texts.texts[textIndex].text = text
    else texts.texts.splice(textIndex, 1)
  } else if (text) texts.texts.push({ textId: textId, text: text })
}
export function deleteSpecificationI18nText(spec: IbaseSpecification, textId: string): void {
  if (!spec || !spec.i18n) return
  spec.i18n.forEach((texts) => {
    if (texts) {
      let textIndex = texts.texts.findIndex((tx) => tx.textId === textId)
      if (textIndex >= 0) texts.texts.splice(textIndex, 1)
    }
  })
}

export function getSpecificationI18nName(
  spec: IbaseSpecification,
  language: string,
  noFallbackLanguage: boolean = false
): string | null {
  return getSpecificationI18nText(spec, language, 'name', noFallbackLanguage)
}
export function getSpecificationI18nEntityName(
  spec: IbaseSpecification,
  language: string,
  entityId: number,
  noFallbackLanguage: boolean = false
) {
  return getSpecificationI18nText(spec, language, 'e' + entityId, noFallbackLanguage)
}
export function getSpecificationI18nEntityOptionName(
  spec: IbaseSpecification,
  language: string,
  entityId: number,
  modbusValue: number,
  noFallbackLanguage: boolean = false
): string | null {
  return getSpecificationI18nText(spec, language, 'e' + entityId + 'o.' + modbusValue, noFallbackLanguage)
}
export function setSpecificationI18nName(spec: IbaseSpecification, language: string, text: string | null | undefined): void {
  setSpecificationI18nText(spec, language, 'name', text)
}
export function setSpecificationI18nEntityName(
  spec: IbaseSpecification,
  language: string,
  entityId: number,
  text: string | null | undefined
): void {
  setSpecificationI18nText(spec, language, 'e' + entityId, text)
}
export function setSpecificationI18nEntityOptionName(
  spec: IbaseSpecification,
  language: string,
  entityId: number,
  modbusValue: number,
  text: string | null | undefined
): void {
  setSpecificationI18nText(spec, language, 'e' + entityId + 'o.' + modbusValue, text)
}
export function deleteSpecificationI18nEntityOptionName(spec: IbaseSpecification, entityId: number, modbusValue: number): void {
  deleteSpecificationI18nText(spec, 'e' + entityId + 'o.' + modbusValue)
}

export function deleteSpecificationI18nEntityNameAndOptions(spec: IbaseSpecification, entityId: number) {
  spec.i18n.forEach((i18n) => {
    let textIndex
    while (-1 != (textIndex = i18n.texts.findIndex((tx) => tx.textId.startsWith('e' + entityId))))
      if (textIndex >= 0) i18n.texts.splice(textIndex, 1)
  })
}

export function getSpecificationI18nEntityOptionId(
  spec: IbaseSpecification,
  language: string,
  entityId: number,
  mqttValue: string,
  noFallbackLanguage: boolean = false
): number[] {
  if (!spec || !spec.i18n) return [0]
  let texts = spec.i18n.find((i18) => i18.lang === language)
  let key = 'e' + entityId + 'o.'
  let enTexts = spec.i18n.find((i18) => i18.lang === 'en')
  if (texts) {
    let text: string | undefined = texts.texts.find((tx) => tx.text === mqttValue && tx.textId.startsWith(key))?.textId
    if (text) {
      return [parseInt(text.substring(key.length))]
    }
  }
  if (enTexts && !noFallbackLanguage) {
    let text: string | undefined = enTexts.texts.find((tx) => tx.text === mqttValue && tx.textId.startsWith(key))?.textId
    if (text) return [parseInt(text.substring(key.length))]
  }
  return [0]
}

export function getCurrentLanguage(_ins: string) {
  return navigator.language.replace(/\-.*/g, '')
}
export function getFileNameFromName(name: string): string | undefined {
  const searchRegExp = /[^a-z^A-Z^\.^0-9+-._]*/g
  if (!name) return undefined
  let n = name.toLowerCase()
  return n.replace(searchRegExp, '')
}
export const newSpecfilename: string = '_new'
export const newSpecification: ImodbusSpecification = {
  identified: IdentifiedStates.unknown,
  entities: [],
  i18n: [],
  files: [],
  filename: newSpecfilename,
  status: SpecificationStatus.new,
}
