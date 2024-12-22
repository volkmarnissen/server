import { Config, ConfigListenerEvent } from './config'
import { ConfigSpecification, ConverterMap, IfileSpecification } from '@modbus2mqtt/specification'
import { format } from 'util'
import {
  Inumber,
  Iselect,
  getSpecificationI18nEntityOptionName,
  editableConverters,
  getSpecificationI18nName,
  IselectOption,
  ImodbusSpecification,
  EnumStateClasses,
  Itext,
  Ispecification,
} from '@modbus2mqtt/specification.shared'
import { Ientity, ImodbusEntity, VariableTargetParameters, getSpecificationI18nEntityName } from '@modbus2mqtt/specification.shared'
import { ClientSubscribeCallback, IClientOptions, IClientPublishOptions, MqttClient, connect } from 'mqtt'
import { Modbus } from './modbus'
import { Bus } from './bus'
import { ConfigBus } from './configbus'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { ImqttClient, Islave, PollModes, Slave } from '@modbus2mqtt/server.shared'
import { Mutex } from 'async-mutex'
import { QoS } from 'mqtt-packet'

import { rejects } from 'assert'
import { Observable } from 'rxjs'
import { get } from 'http'
const debug = Debug('mqttdiscover')
const debugAction = Debug('actions')
const debugMqttClient = Debug('mqttclient')
const log = new Logger('mqttdiscover')
const defaultPollCount = 50 // 5 seconds
export interface ItopicAndPayloads {
  topic: string,
  payload: string| Buffer,
  entityid:number
}
const retain: IClientPublishOptions = { retain: true, qos: 1 }
const modbusValues = 'modbusValues'

export interface ImqttDevice extends Islave {
  busid: number
}

class BusSlave {
  constructor(
    private busid: number,
    private slaveid: number
  ) {}
  get key(): string {
    return `${this.busid}${Config.getFileNameFromSlaveId(this.slaveid)}`
  }
}

interface IDiscoveryIds {
  busSlave: string
  entityid: number
}

export class MqttDiscover {
  private client?: MqttClient
  private subscribedSlaves: Slave[] = []
  private isSubscribed: boolean
  private static lastMessage: string = ''
  private interval: NodeJS.Timeout | undefined
  private isPolling: boolean = false
  private pollMutex = new Mutex()
  validate(_discover: any) {
    // currently no meaningful checks
  }
  private pollCounts: Map<string, number> = new Map<string, number>()
  private triggers: { slave: Slave; force: boolean }[] = []
  private onDestroy(this: MqttDiscover) {
    if (this.client) this.client.end()
  }
  private static instance: MqttDiscover

  static getInstance(): MqttDiscover {
    if (MqttDiscover.instance) return MqttDiscover.instance
    if (Config.getConfiguration().mqttusehassio && Config.mqttHassioLoginData)
      MqttDiscover.instance = new MqttDiscover(Config.mqttHassioLoginData, Config.getConfiguration().mqttdiscoverylanguage)
    else
      MqttDiscover.instance = new MqttDiscover(
        Config.getConfiguration().mqttconnect,
        Config.getConfiguration().mqttdiscoverylanguage
      )

    return MqttDiscover.instance
  }
  static addSpecificationToSlave(slave: Slave): Slave {
    let rc = slave.clone()
    let specificationId = rc.getSpecificationId()
    if (specificationId) {
      let spec = ConfigSpecification.getSpecificationByFilename(specificationId)
      rc.setSpecification(spec)
    }
    return rc
  }
  constructor(
    private mqttConnectionData: ImqttClient,
    private language?: string
  ) {
    const reg = new FinalizationRegistry(this.onDestroy.bind(this))
    this.isSubscribed = false
    reg.register(this, 0)
    ConfigBus.addListener(ConfigListenerEvent.addSlave, this.onAddSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteSlave, this.onDeleteSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.updateSlave, this.onUpdateSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteBus, this.onDeleteBus.bind(this))
  }
  // bus/slave name:entity id:payload
  getSlaveBaseTopics(): string[] {
    return this.subscribedSlaves.map<string>((value) => value.getBaseTopic())
  }
  getSlave(topic: string): Slave | undefined {
    return this.subscribedSlaves.find((value) => topic.startsWith(value.getBaseTopic()))
  }
  private generateEntityConfigurationTopic(slave: Slave, ent: Ientity): string {
    let haType = 'sensor'
    if (ent.readonly)
      switch (ent.converter.name) {
        case 'binary':
          haType = 'binary_sensor'
          break
      }
    else
      switch (ent.converter.name) {
        case 'binary':
          haType = 'switch'
          break
        default:
          haType = ent.converter.name
      }

    return (
      Config.getConfiguration().mqttdiscoveryprefix +
      '/' +
      haType +
      '/' +
      slave.getBusId() +
      's' +
      slave.getSlaveId() +
      '/e' +
      ent.id +
      '/config'
    )
  }
  private generateDiscoveryPayloads(slave: Slave, spec: ImodbusSpecification): ItopicAndPayloads[] {
    let payloads: ItopicAndPayloads[] = []
    // instantiate the converters
    try {
      if (this.language)
        for (let e of spec.entities) {
          debug('Update state topic ' + e.mqttname)
          // !slave.suppressedEntities.includes(e.id)
          if (e.id >= 0 && !e.variableConfiguration) {
            let converter = ConverterMap.getConverter(e)
            let ent: ImodbusEntity = e as ImodbusEntity

            if (converter) {
              debug('Converter ' + e.mqttname)

              var obj: any = new Object()
              obj.device = new Object()
              let slaveName = slave.getName()
              if (!obj.device.name)
                if (slaveName) obj.device.name = slaveName
                else {
                  let name = getSpecificationI18nName(spec, this.language, false)
                  if (name) obj.device.name = name
                }

              if (!obj.device.manufacturer && spec.manufacturer) obj.device.manufacturer = spec.manufacturer
              if (!obj.device.model && spec.model) obj.device.model = spec.model
              obj.device.identifiers = [obj.device.name]
              debug('Entities ' + e.mqttname)
              spec.entities.forEach((ent1) => {
                if (ent1.variableConfiguration) {
                  switch (ent1.variableConfiguration.targetParameter) {
                    case VariableTargetParameters.deviceSerialNumber:
                      let sn = (ent1 as ImodbusEntity).mqttValue
                      if (sn) obj.device.serial_number = sn
                      break
                    case VariableTargetParameters.deviceSWversion:
                      let sv = (ent1 as ImodbusEntity).mqttValue
                      if (sv) obj.device.sw_version = sv
                      break
                    case VariableTargetParameters.deviceIdentifiers:
                      let o = (ent1 as ImodbusEntity).mqttValue
                      if (o) obj.device.identifiers.push(o)
                      break
                    case VariableTargetParameters.entityUom:
                      if (e.id == ent1.variableConfiguration.entityId && converter!.getParameterType(e) === 'Inumber') {
                        obj.unit_of_measurement = (ent1 as ImodbusEntity).mqttValue
                      }
                      break

                    // Add additionial device attributes here
                    // obj.device.<???> = (ent1 as ImodbusEntity).mqttValue;
                  }
                }
              })
              if (e.forceUpdate) obj.force_update = true
              if (e.entityCategory && e.entityCategory.length) obj.entity_category = e.entityCategory

              if (e.icon) obj.icon = e.icon
              if (!e.variableConfiguration) {
                let name = getSpecificationI18nEntityName(spec, this.language, e.id)
                let filename = Config.getFileNameFromSlaveId(slave.getSlaveId())
                if (!obj.name && name) obj.name = name
                if (!obj.object_id && e.mqttname) obj.object_id = e.mqttname
                if (!obj.unique_id) obj.unique_id = 'M2M' + slave.getBusId() + filename + e.mqttname

                if (!obj.value_template)
                  obj.value_template = e.value_template ? e.value_template : '{{ value_json.' + obj.object_id + ' }}'
                if (!obj.state_topic) obj.state_topic = slave.getStateTopic()
                if (!obj.availability && !obj.availability_topic) obj.availability_topic = slave.getAvailabilityTopic()
                let cmdTopic = slave.getEntityCommandTopic(ent)
                if (!obj.command_topic && !e.readonly) obj.command_topic = cmdTopic ? cmdTopic.commandTopic : undefined
                debug('Entity ' + e.mqttname)
                switch (converter.getParameterType(e)) {
                  case 'Iselect':
                    debug('Select ' + e.mqttname)
                    if (!e.readonly) {
                      let ns = e.converterParameters as Iselect
                      if (e.converter.name === 'select' && ns && ns.optionModbusValues && ns.optionModbusValues.length) {
                        obj.options = []
                        for (let modbusValue of ns.optionModbusValues)
                          obj.options.push(getSpecificationI18nEntityOptionName(spec, this.language, e.id, modbusValue))

                        if (obj.options == undefined || obj.options.length == 0)
                          log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: No options specified for ' + obj.name)
                        else
                          obj.options.forEach((o: IselectOption) => {
                            if (!o) log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: option with no text for ' + e.id)
                          })
                      }
                      obj.device_class = 'enum'
                      if (e.converter.name === 'binary' && ns.device_class) obj.device_class = ns.device_class
                    }
                    break
                  case 'Inumber':
                    debug('Number ' + e.mqttname)
                    let nn = e.converterParameters as Inumber
                    if (!obj.unit_of_measurement && nn && nn.uom) obj.unit_of_measurement = nn.uom
                    if (nn && nn.device_class && nn.device_class.toLowerCase() != 'none') obj.device_class = nn.device_class
                    if (nn && nn.state_class && nn.state_class) obj.state_class = MqttDiscover.getStateClass(nn.state_class)
                    if (e.converter.name === 'number' && !e.readonly) {
                      if (nn.step) obj.step = nn.step
                      if (nn.identification) {
                        if (nn.identification.min != undefined) obj.min = nn.identification.min
                        if (nn.identification.max != undefined) obj.max = nn.identification.max
                      }
                      if(nn.decimals != undefined )
                        obj.suggested_display_precision  = nn.decimals
                    }
                    break
                  case 'Itext':
                    debug('Text ' + e.mqttname)
                    if (!e.readonly) {
                      let nt = e.converterParameters as Itext
                      if (nt.stringlength > 0) obj.max = nt.stringlength
                      if (nt.identification && nt.identification.length) obj.pattern = nt.identification
                    }
                    break
                }
                debug('push ' + e.mqttname)

                payloads.push({
                  topic: this.generateEntityConfigurationTopic(slave, e),
                  payload: JSON.stringify(obj),
                  entityid: e.id
                })
              }
            }
          }
        }
      else {
        log.log(LogLevelEnum.error, 'generateDiscoveryPayloads: specification or language is undefined')
      }
    } catch (e: any) {
      debug('Exception ' + e.message)
      log.log(LogLevelEnum.error, e.message)
    }
    return payloads
  }
  static getStateClass(state_class: EnumStateClasses): string {
    switch (state_class) {
      case EnumStateClasses.measurement:
        return 'measurement'
      case EnumStateClasses.total:
        return 'total'
      case EnumStateClasses.total_increasing:
        return 'total_increasing'
      default:
        return ''
    }
  }

  private getSubscribedSlaveFromDiscoveryTopic(topic: string): { slave?: Slave; entityId?: number } {
    let pathes = topic.split('/')

    if (pathes[2].match(/^[0-9]*s[0-9]*$/g) == null || pathes[3].match(/^e[0-9]*$/g) == null) return {}
    let busSlave = pathes[2].split('s')
    let busId = parseInt(busSlave[0])
    let slaveId = parseInt(busSlave[1])
    let entityId = parseInt(pathes[3].substring(1))
    return {
      slave: this.subscribedSlaves.find((s) => s.getBusId() == busId && s.getSlaveId() == slaveId),
      entityId: entityId,
    }
  }
  private static getBusAndSlaveFromTopic(topic: string): { bus: Bus; slave: Islave } {
    let parts = topic.split('/')
    let msg = ''

    if (parts.length > 2) {
      let busid = Number.parseInt(parts[2].substring(0, 1))
      let slaveid = Number.parseInt(parts[2].substring(2))
      let bus = Bus.getBus(busid)
      if (!bus) {
        log.log(LogLevelEnum.error, 'getBusAndSlaveFromTopic: invalid busid ' + busid)
        throw new Error('getBusAndSlaveFromTopic' + busid)
      }

      const device = bus!.getSlaveBySlaveId(slaveid)
      if (device)
        return {
          bus: bus,
          slave: device,
        }
      else throw new Error('device ' + slaveid + 'not found for Bus' + busid)
    }
    throw new Error('Invalid topic. No bus and slave information: ' + topic)
  }
  private onMqttCommandMessage(topic: string, payload: Buffer): string {
    try {
      let busAndSlave = MqttDiscover.getBusAndSlaveFromTopic(topic)
      if (undefined == busAndSlave.slave.specificationid) throw new Error('No specification Id for slave available')
      const spec = ConfigSpecification.getSpecificationByFilename(busAndSlave.slave.specificationid)
      let parts = topic.split('/')
      if (spec && parts.length >= 4) {
        const entity = spec.entities.find((ent) => {
          return 'e' + ent.id == parts[3]
        })
        if (entity) {
          const cnv = ConverterMap.getConverter(entity)
          if (cnv) {
            let promise: Promise<void>
            let modbus = parts.length == 5 && parts[4] == modbusValues
            if (!Config.getConfiguration().fakeModbus) {
              if (modbus)
                promise = Modbus.writeEntityModbus(busAndSlave.bus, busAndSlave.slave.slaveid, entity, {
                  data: JSON.parse(payload.toString()),
                  buffer: Buffer.allocUnsafe(0),
                })
              else promise = Modbus.writeEntityMqtt(busAndSlave.bus, busAndSlave.slave.slaveid, spec, entity.id, payload.toString())
            } // for Testing
            else return (modbus ? 'Modbus ' : 'MQTT ') + payload.toString()
          }
        } else throw new Error('Entity not found topic ' + topic)
      } else throw new Error('No entity passed to command topic ' + topic)
    } catch (e: any) {
      return e.message as string
    }
    return 'unknown issue'
  }
  private sendCommandModbus(slave: Slave, entity: Ientity, modbus: boolean, payload: string): Promise<void> {
    const cnv = ConverterMap.getConverter(entity)
    if (cnv) {
      if (modbus)
        return Modbus.writeEntityModbus(Bus.getBus(slave.getBusId())!, slave.getSlaveId(), entity, {
          data: JSON.parse(payload.toString()),
          buffer: Buffer.allocUnsafe(0),
        })
      else {
        let spec = slave.getSpecification()
        if (spec)
          return Modbus.writeEntityMqtt(Bus.getBus(slave.getBusId())!, slave.getSlaveId(), spec, entity.id, payload.toString())
      }
    }
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No Converter or spec found for spec/entity ' + slave.getSpecificationId() + '/' + entity.mqttname))
    })
  }
  // returns a promise for testing
  private onMqttMessage(topic: string, payload: Buffer): Promise<void> {
    if (topic) {
      let s = this.subscribedSlaves.find((s) => topic.startsWith(s.getBaseTopic()!))
      if (s) {
        if (s.getTriggerPollTopic() == topic) return this.readModbusAndPublishState(s) as any as Promise<void>
        else {
          if (topic == s.getCommandTopic()) return this.sendCommand(s, payload.toString('utf-8')) as any as Promise<void>
          else if (topic.startsWith(s.getBaseTopic()) && topic.indexOf('/set/') != -1) {
            return this.sendEntityCommandWithPublish(s, topic, payload.toString('utf-8')) as any as Promise<void>
          }
        }
      }
    }
    return new Promise<void>((resolve) => {
      resolve()
    })
  }
  sendEntityCommandWithPublish(slave: Slave, topic: string, payload: string): Promise<ImodbusSpecification> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly)
      return new Promise<ImodbusSpecification>((resolve, reject) => {
        this.sendEntityCommand(slave, topic, payload.toString())
          .then(() => {
            this.readModbusAndPublishState(slave).then(resolve).catch(reject)
          })
          .catch(reject)
      })
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<ImodbusSpecification>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }
  private sendEntityCommand(slave: Slave, topic: string, payload: string): Promise<void> {
    let entity = slave.getEntityFromCommandTopic(topic)
    if (entity && !entity.readonly) return this.sendCommandModbus(slave, entity, topic.endsWith('/set/modbus/'), payload.toString())
    log.log(LogLevelEnum.error, 'No writable entity found for topic ' + topic)
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('No writable entity found for topic ' + topic))
    })
  }

  sendCommand(slave: Slave, payload: string): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      let p = JSON.parse(payload)
      let promisses: Promise<void>[] = []
      Object.getOwnPropertyNames(p).forEach((propName) => {
        let entity = slave.getSpecification()?.entities.find((e) => e.mqttname == propName)
        if (entity && !entity.readonly) promisses.push(this.sendCommandModbus(slave, entity, false, p.toString()))
      })
      if (promisses.length > 0)
        Promise.all<void>(promisses).then(() => {
          this.readModbusAndPublishState(slave).then(resolve).catch(reject)
        })
      else reject(new Error('No writable entity found in payload ' + payload))
    })
  }
  private containsTopic(tp: ItopicAndPayloads, tps: ItopicAndPayloads[]) {
    let t = tps.findIndex((t) => tp.topic === t.topic)
    return -1 != t
  }

  private generateDiscoveryEntities(slave: Slave, deleteAllEntities: boolean = false): ItopicAndPayloads[]
  {
       let tAndPs:ItopicAndPayloads[] =[]
            let subscribedSlave = this.subscribedSlaves.find((s) => 0 == Slave.compareSlaves(s, slave))
            let newSpec = slave.getSpecification()
            let oldSpec = subscribedSlave ? subscribedSlave?.getSpecification() : undefined
            let waitForDeletions = false
            if (oldSpec && oldSpec.entities && this.client) {
              oldSpec.entities.forEach((oldEnt) => {
                let newEnt = newSpec?.entities.find((newE) => newE.id == oldEnt.id)
                let newTopic = newEnt ? this.generateEntityConfigurationTopic(slave, newEnt) : undefined
                let oldTopic = oldEnt ? this.generateEntityConfigurationTopic(slave, oldEnt) : undefined
                if (oldTopic)
                  if (!newSpec || deleteAllEntities|| slave.getNoDiscovery()|| slave.getNoDiscoverEntities().includes(oldEnt.id) || !newEnt || newTopic != oldTopic) {
                    if (oldEnt) debug('delete entity ' + slave.getBusId() + 's' + slave.getSlaveId() + '/e' + oldEnt.id)
                    else debug('delete Bus/slave ')
                    tAndPs.push({topic: oldTopic, payload: Buffer.alloc(0), entityid:0} ) // delete entity
                    waitForDeletions = true
                  }
              })
            }
            if (!deleteAllEntities && newSpec && newSpec.entities && this.client) {
              this.generateDiscoveryPayloads(slave, newSpec as ImodbusSpecification).forEach((tp) => {
                if( !slave.getNoDiscoverEntities().includes(tp.entityid ) && !slave.getNoDiscovery() )
                  {
                    tAndPs.push({topic: tp.topic, payload:tp.payload, entityid:0 }) // write entity
                    debug('====================== publish done ' + tp.topic)
                  }
              })
            }
          return tAndPs
    }

  private error(msg: any): void {
    let message = "MQTT: Can't connect to " + Config.getConfiguration().mqttconnect.mqttserverurl + ' ' + msg.toString()
    if (message !== MqttDiscover.lastMessage) log.log(LogLevelEnum.error, message)
    MqttDiscover.lastMessage = message
  }

  private connectMqtt(connectionData: ImqttClient | undefined, onConnected: () => void, error: (e: any) => void) {
    if (!connectionData) connectionData = this.mqttConnectionData
    if (!connectionData) {
      error('No mqtt connection configured.')
      return
    }
    if (!this.client) debug('Internal error: mqtt client is not defined')
    if (connectionData.mqttserverurl) {
      let opts = connectionData
      opts.log = (...args) => {
        let message = args.shift()
        debugMqttClient(format(message, args))
      }
      opts.clean = false
      opts.reconnectPeriod = 5000
      opts.clientId = Config.getConfiguration().mqttbasetopic
      if (opts.ca == undefined) delete opts.ca
      if (opts.key == undefined) delete opts.key
      if (opts.cert == undefined) delete opts.cert
      // Close client when connection ends
      if (this.client)
        this.client.reconnect(opts as IClientOptions)
      else{
        debug(connectionData.mqttserverurl)
        this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)      
        this.client.on('error', error)
        this.client.on('message', this.onMqttMessage.bind(this))
        this.client.on('connect', () => {
          onConnected()
        })
  
      }
    } else {
      error(new Error('mqtt server url is not defined'))
    }
  }

  validateConnection(connectionData: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
      if(connectionData && connectionData.mqttserverurl != undefined){
        let client = connect(connectionData.mqttserverurl,connectionData)      
        client.on('error', (e) => {
          client!.end(() => {})
          callback(false, e.toString())
        })
        client.on('connect', () => {
          callback(true, 'OK')
          if (client)
            client.end(() => {              
            })
        })
      }
      else
        callback(false, 'no mqttserverlurl passes')
  }
  
  private equalConnectionData(client: MqttClient, clientConfiguration: ImqttClient): boolean {
    return (
      client.options.protocol + '://' + client.options.host + ':' + client.options.port == clientConfiguration.mqttserverurl &&
      client.options.username == clientConfiguration.username &&
      client.options.password == clientConfiguration.password
    )
  }
  mqttClientMutex:Mutex = new Mutex()
  private getMqttClient(): Promise<MqttClient> {
    return new Promise<MqttClient>((resolve, reject) => {
      let conn = () => {
        this.mqttClientMutex.acquire().then(()=>{
          this.connectMqtt(
            undefined,
            () => {
              // debug(LogLevelEnum.notice, 'poll: MQTT client reconnected')
              resolve(this.client!)
              this.mqttClientMutex.release();
            },
            (e)=>{ 
              this.mqttClientMutex.release();
              reject(e)
            }
          )
  
        }).catch(reject)
      }

      if (this.client != undefined) {
        if (this.equalConnectionData(this.client, this.mqttConnectionData)) {
          if( this.client.connected)
          {
            resolve(this.client)
            return
          }   
          // else connect again     
        } else {
          // reconnect with new connection date
          this.client.end(conn)
          return
        }
      }
      // first time connection
      conn()
    })
  }
  // Discovery update when
  // Bus changed
  // Bus deleted
  // Slave changed: subscribeSlave
  // Slave deleted: unsubscribeSlave
  // Specification changed
  // Specification deleted
  // Bus changed: Iterate all slaves of bus PublishDiscovery and State
  // Bus deleted: nothing to do, but delete discovery
  // Slave changed:  PublishDiscovery and State of changed Slave, delete outdated discoveries
  // Slave deleted: nothing to do, but delete outdated discoveries
  // Specification changed: Iterate all Busses/Slaves update Discovery and State delete outdated discoveries
  // Specification deleted: Find previously assigned slaves and publish Discovery and State delete outdated discoveries

  private onUpdateSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let busId = slave.getBusId()
      let bus: Bus | undefined = busId != undefined ? Bus.getBus(busId) : undefined
      if (bus){
        let tAndPs = this.generateDiscoveryEntities(slave)
        this.getMqttClient().then((mqttClient)=>{
          tAndPs.forEach(tAndP=>{mqttClient.publish(tAndP.topic, tAndP.payload,{ qos: 1 })})
        })
        let idx = this.subscribedSlaves.findIndex((s) => 0 == Slave.compareSlaves(s, slave))
        if (idx >= 0) this.subscribedSlaves[idx] = slave
            // give homeassistant some time to update the entity
        setTimeout(() => {
              this.readModbusAndPublishState(slave)
                .then(() => {
                  resolve()
                })
                .catch(reject)
            }, 500)
          }
      })

    }

  onDeleteBus(busid: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let slaves = new Set<number>()
      let deletions: number[] = []
      let tAndPs:ItopicAndPayloads[]=[]
      this.subscribedSlaves.forEach((ss, idx, object) => {
        let sbusId = ss.getBusId()
        if (sbusId == busid) {
          tAndPs.concat(this.generateDiscoveryEntities(ss, true))
          object.splice(idx, 1)
        }
      })
      this.getMqttClient().then(mqttClient=>{
        tAndPs.forEach( tAndP=>{
          mqttClient.publish(tAndP.topic,tAndP.payload, { qos: 1 })
        })
        resolve()
      }).catch(reject)
    })
  }

  private readModbusAndPublishState(slave: Slave): Promise<ImodbusSpecification> {
    return new Promise<ImodbusSpecification>((resolve, reject) => {
      let obs = MqttDiscover.readModbus(slave)
      if (obs)
        obs.subscribe((spec) => {
          this.publishState(slave, spec)
            .then(() => {
              resolve(spec)
            })
            .catch(reject)
        })
    })
  }
  static readModbus(slave: Slave): Observable<ImodbusSpecification> | undefined {
    let bus = Bus.getBus(slave.getBusId())
    if (bus)
      return Modbus.getModbusSpecification('poll', bus, slave.getSlaveId(), slave.getSpecificationId(), (e) => {
        log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
        //Ignore this error continue with next
      })
    return undefined
  }
  private generateQos(slave: Slave, spec?: Ispecification): QoS {
    let qos = slave.getQos()
    if ((qos == undefined || qos == -1) && spec != undefined)
      if (spec.entities.find((e) => e.readonly == false) != undefined) return 1
      else return 0

    return qos ? (qos as QoS) : 1
  }
  private publishState(slave: Slave, spec: ImodbusSpecification): Promise<void> {
    return new Promise<void>((resolve) => {
      debug("publish State aquire mqttClient")
      this.getMqttClient().then(mqttClient=>{
        debug("publish State executing")
        let topic = slave.getStateTopic()
        let bus = Bus.getBus(slave.getBusId())
        if (this.client && bus && spec) {
          try {
            debug("PublishState")
            mqttClient.publish(topic, slave.getStatePayload(spec.entities), { qos: this.generateQos(slave, spec) })
            mqttClient.publish(slave.getAvailabilityTopic(), 'online', { qos: this.generateQos(slave, spec) })
            resolve()
          } catch (e:any) {
            try {
              mqttClient.publish(slave.getAvailabilityTopic(), 'offline', { qos: this.generateQos(slave, spec) })
            } catch (e:any) {
              // ignore the error
              debug('Error ' + e.message)
            }
          }
        } else {
          if (!this.client) log.log(LogLevelEnum.error, 'No MQTT Client available')
          if (!bus) log.log(LogLevelEnum.error, 'No Bus available')
          if (!spec) log.log(LogLevelEnum.error, 'No Spec available')
        }  
      })
    })
  }

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(): Promise<void> {
    return new Promise<void>((resolve, error) => {
      if (this.isPolling) {
        resolve()
      }
      this.isPolling = true
      let needPolls: {
        slave: Slave
        pollMode: PollModes
      }[] = []

      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          if (slave.pollMode != PollModes.noPoll) {
            let sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            let pc: number | undefined = this.pollCounts.get(sl.getKey())
            let trigger = this.triggers.find((k) => 0 == Slave.compareSlaves(k.slave, sl))

            if (pc == undefined || pc > (slave.pollInterval != undefined ? slave.pollInterval / 100 : defaultPollCount)) pc = 0
            if (pc == 0 || trigger != undefined) {
              let s = MqttDiscover.addSpecificationToSlave(new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic))
              if (slave.specification) {
                needPolls.push({ slave: s, pollMode: trigger == undefined ? PollModes.intervall : PollModes.trigger })
              } else {
                if (slave.specificationid)
                  log.log(
                    LogLevelEnum.error,
                    'No specification found for slave ' + s.getSlaveId() + ' specid: ' + s.getSpecificationId()
                  )
              }
            }
            this.pollCounts.set(sl.getKey(), ++pc)
          }
        })
      })
      if (needPolls.length > 0){
        let tAndP:ItopicAndPayloads[]= []
        needPolls.forEach((bs) => {
          // Trigger state only if it's configured to do so
          let spMode = bs.slave.getPollMode()
          let idx = this.triggers.findIndex((k) => 0 == Slave.compareSlaves(k.slave, bs.slave))
          if (
            spMode == undefined ||
            [PollModes.intervall, PollModes.intervallAndTrigger].includes(spMode) ||
            bs.pollMode == PollModes.trigger ||
            (idx >= 0 && this.triggers[idx].force)
          ) {
            let bus = Bus.getBus(bs.slave.getBusId())
            if (bus)
              Modbus.getModbusSpecification('poll', bus, bs.slave.getSlaveId(), bs.slave.getSpecificationId(), (e) => {
                log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
              }).subscribe((spec) => {
                tAndP.push({ topic:  bs.slave.getStateTopic(), payload: bs.slave.getStatePayload(spec.entities), entityid:0 })
                tAndP.push({ topic: bs.slave.getAvailabilityTopic(), payload: 'online' , entityid:0 })
              })
          }
          // Remove trigger
          if (idx >= 0) this.triggers.splice(idx, 1)
        })
        this.getMqttClient().then(mqttClient=>{
          tAndP.forEach( tAndP=>{
            mqttClient.publish(tAndP.topic,tAndP.payload)
          })
          resolve()
        }).catch(error)
      }
    })
  }

  onAddSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.subscribedSlaves.find((s) => 0 == Slave.compareSlaves(s, slave))) {
        this.subscribedSlaves.push(slave)
        this.getMqttClient()
          .then((mqttClient) => {
            this.onUpdateSlave(slave)
              .then(() => {
                let options = { qos: this.generateQos(slave, slave.getSpecification()) }
                let error = (err: any) => {
                  if (err) log.log(LogLevelEnum.error, 'subscribeSlave: MQTT subscribe error: ', err.message)
                }
                mqttClient.subscribe(slave.getTriggerPollTopic(), options, error)
                let cmdTopic = slave.getCommandTopic()
                if (cmdTopic) {
                  mqttClient.subscribe(cmdTopic, options, error)
                  mqttClient.subscribe(slave.getEntityCommandTopicFilter(), options, error)
                }
                resolve()
              })
              .catch(reject)
          })
          .catch(reject)
      }
    })
  }

  onDeleteSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let idx = this.subscribedSlaves.findIndex((s) => s.getBaseTopic() == slave.getBaseTopic())
      if (idx >= 0) 
        this.getMqttClient()
        .then((mqttClient) => {
            let tAndPs = this.generateDiscoveryEntities(slave, true)
            this.subscribedSlaves.splice(idx, 1)
            tAndPs.forEach(tAndP=>{mqttClient.publish(tAndP.topic, tAndP.payload, { qos: this.generateQos(slave, slave.getSpecification()) })})
            mqttClient.unsubscribe(slave.getTriggerPollTopic())
            let cmdTopic = slave.getCommandTopic()
            if (cmdTopic) {
                  mqttClient.unsubscribe(cmdTopic)
                  mqttClient.unsubscribe(slave.getEntityCommandTopicFilter())
                }
            resolve()
            })
              .catch((e) => {
                log.log(LogLevelEnum.error, e.message)
              })
      })
  }

  startPolling() {
    if (this.interval == undefined) {
      this.interval = setInterval(() => {
        this.poll()
          .then(() => {})
          .catch(this.error)
      }, 100)
    }
  }
}
