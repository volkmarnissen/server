import {
  ImodbusEntity,
  ImodbusSpecification,
  Iselect,
  getSpecificationI18nEntityName,
  getSpecificationI18nEntityOptionName,
  getSpecificationI18nName,
  setSpecificationI18nEntityName,
  setSpecificationI18nEntityOptionName,
} from '../../../specification.shared'

interface AssociativeArray {
  [key: string]: string
}

const languages: AssociativeArray = {
  aa: 'Qafár af',
  ab: 'aab',
  af: 'Afrikaans',
  am: 'አማርኛ',
  ar: 'العربية',
  as: 'অসমীয়া',
  ay: 'Aymar aru',
  az: 'azərbaycanca',
  ba: 'башҡортса',
  be: 'беларуская',
  bg: 'български',
  bh: 'भोजपुरी',
  bi: 'Bislama',
  bn: 'বাংলা',
  bo: 'བོད་ཡིག',
  br: 'brezhoneg',
  ca: 'català',
  co: 'corsu',
  cs: 'čeština',
  cy: 'Cymraeg',
  da: 'dansk',
  de: 'Deutsch',
  dz: 'ཇོང་ཁ',
  el: 'Ελληνικά',
  en: 'English',
  eo: 'Esperanto',
  es: 'español',
  et: 'eesti',
  eu: 'euskara',
  fa: 'فارسی',
  fi: 'suomi',
  fj: 'Fiji',
  fo: 'føroyskt',
  fr: 'français',
  fy: 'Frysk',
  ga: 'Gaeilge',
  gd: 'Gàidhlig',
  gl: 'galego',
  gn: "Avañe'ẽ",
  gu: 'ગુજરાતી',
  ha: 'Hausa',
  he: 'עברית',
  hi: 'हिन्दी',
  hr: 'hrvatski',
  hu: 'magyar',
  hy: 'Հայերեն',
  ia: 'interlingua',
  id: 'Bahasa Indonesia',
  ie: 'Interlingue',
  ik: 'Iñupiak',
  is: 'íslenska',
  it: 'italiano',
  iu: 'ᐃᓄᒃᑎᑐᑦ/inuktitut',
  iw: 'iw',
  ja: '日本語',
  ji: 'ji',
  jv: 'Basa Jawa',
  ka: 'ქართული',
  kk: 'қазақша',
  kl: 'kalaallisut',
  km: 'ភាសាខ្មែរ',
  kn: 'ಕನ್ನಡ',
  ko: '한국어',
  ks: 'कॉशुर / کٲشُر',
  ku: 'Kurdî',
  ky: 'Кыргызча',
  la: 'Latina',
  ln: 'lingála',
  lo: 'ລາວ',
  lt: 'lietuvių',
  lv: 'latviešu',
  mg: 'Malagasy',
  mi: 'Māori',
  mk: 'македонски',
  ml: 'മലയാളം',
  mn: 'монгол',
  mo: 'молдовеняскэ',
  mr: 'मराठी',
  ms: 'Bahasa Melayu',
  mt: 'Malti',
  my: 'မြန်မာဘာသာ',
  na: 'Dorerin Naoero',
  ne: 'नेपाली',
  nl: 'Nederlands',
  no: 'norsk bokmål',
  oc: 'occitan',
  om: 'Oromoo',
  or: 'ଓଡ଼ିଆ',
  pa: 'ਪੰਜਾਬੀ',
  pl: 'polski',
  ps: 'پښتو',
  pt: 'português',
  qu: 'Runa Simi',
  rm: 'rumantsch',
  rn: 'Kirundi',
  ro: 'română',
  ru: 'русский',
  rw: 'Kinyarwanda',
  sa: 'संस्कृतम्',
  sd: 'سنڌي',
  sg: 'Sängö',
  sh: 'srpskohrvatski / српскохрватски',
  si: 'සිංහල',
  sk: 'slovenčina',
  sl: 'slovenščina',
  sm: 'Gagana Samoa',
  sn: 'chiShona',
  so: 'Soomaaliga',
  sq: 'shqip',
  sr: 'српски / srpski',
  ss: 'SiSwati',
  st: 'Sesotho',
  su: 'Basa Sunda',
  sv: 'svenska',
  sw: 'Kiswahili',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  tg: 'тоҷикӣ',
  th: 'ไทย',
  ti: 'ትግርኛ',
  tk: 'Türkmençe',
  tl: 'Tagalog',
  tn: 'Setswana',
  to: 'lea faka-Tonga',
  tr: 'Türkçe',
  ts: 'Xitsonga',
  tt: 'татарча/tatarça',
  tw: 'Twi',
  ug: 'ئۇيغۇرچە / Uyghurche',
  uk: 'українська',
  ur: 'اردو',
  uz: 'oʻzbekcha/ўзбекча',
  vi: 'Tiếng Việt',
  vo: 'Volapük',
  wo: 'Wolof',
  xh: 'isiXhosa',
  yi: 'ייִדיש',
  yo: 'Yorùbá',
  za: 'Vahcuengh',
  zh: '中文',
  zu: 'isiZulu',
}

export class I18nService {
  constructor() {}
  static getLanguageName(code: string): string {
    return languages[code]
  }
  static specificationTextsToTranslation(spec: ImodbusSpecification, language: string, entity?: ImodbusEntity) {
    spec.entities.forEach((e) => {
      if ((e as any).name) setSpecificationI18nEntityName(spec, language, e.id, (e as any).name)
      let opt = (e.converterParameters as Iselect).options
      if (opt && opt.length > 0 && (!entity || e.id == entity.id)) {
        ;(e.converterParameters as Iselect).optionModbusValues = []
        ;(e.converterParameters as Iselect).options!.forEach((option) => {
          ;(e.converterParameters as Iselect).optionModbusValues!.push(option.key)
          setSpecificationI18nEntityOptionName(spec, language, e.id, option.key, option.name)
        })
        delete (e.converterParameters as Iselect).options
      }
    })
  }
  static specificationTextsFromTranslation(spec: ImodbusSpecification, language: string, entity?: ImodbusEntity) {
    spec.entities.forEach((e) => {
      let name = getSpecificationI18nEntityName(spec, language, e.id, true)
      if (name) (e as any).name = name
      if ((e.converterParameters as Iselect).optionModbusValues && (!entity || e.id == entity.id)) {
        ;(e.converterParameters as Iselect).options = []
        ;(e.converterParameters as Iselect).optionModbusValues!.forEach((option) => {
          let name = getSpecificationI18nEntityOptionName(spec, language, e.id, option!, true)
          if (name)
            (e.converterParameters as Iselect).options!.push({
              key: option,
              name: name,
            })
        })
      }
    })
  }
  static updateSpecificationI18n(key: string, spec: ImodbusSpecification, language: string, entity?: ImodbusEntity) {
    if (key.startsWith('e')) {
      let entityId = parseInt(key.substring(1))
      let ent = spec.entities.find((e) => e.id == entityId)
      if (ent == null) return
      let oIdx = key.indexOf('o.')
      if (oIdx > 0) {
        let optionId = parseInt(key.substring(oIdx + 2))
        let option = getSpecificationI18nEntityOptionName(spec, language, ent.id, optionId, true)
        if ((ent.converterParameters as Iselect).options == undefined) {
          ;(ent.converterParameters as Iselect).options = []
        }
        if (option && null == (ent.converterParameters as Iselect).options?.find((o) => o.key == optionId))
          (ent.converterParameters as Iselect).options!.push({
            key: optionId,
            name: option,
          })
      } else {
        let name = getSpecificationI18nEntityName(spec, language, entityId, true)

        if (name) {
          ;(ent as any).name = name
          // trigger update of entites
          let ents = structuredClone(spec.entities)
          spec.entities = ents
        }
      }
    } else if (key == 'name') {
      let name = getSpecificationI18nName(spec, language)
      if (name) (spec as any).name = name
    }
  }
}
