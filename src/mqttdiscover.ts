import { Config } from './config'
import { ConfigSpecification, ConverterMap, IfileSpecification } from '@modbus2mqtt/specification'
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
} from '@modbus2mqtt/specification.shared'
import { Ientity, ImodbusEntity, VariableTargetParameters, getSpecificationI18nEntityName } from '@modbus2mqtt/specification.shared'
import { ClientSubscribeCallback, IClientOptions, IClientPublishOptions, MqttClient, connect } from 'mqtt'
import { Modbus } from './modbus'
import { Bus } from './bus'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { ImqttClient, Islave, PollModes, Slave } from '@modbus2mqtt/server.shared'
import { Mutex } from 'async-mutex'

const debug = Debug('mqttdiscover')
const debugAction = Debug('actions')
const log = new Logger('mqttdiscover')
const defaultPollCount = 50 // 5 seconds
Debug.debug('mqttdiscover')
export interface ItopicAndPayloads {
  topic: string
  payload: string
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

interface IsubscribedSlave{
  slave: Slave,
  discoveryTopicAndPayload: Map<number, ItopicAndPayloads>
}

export class MqttDiscover {
  private client?: MqttClient
  private subscribedSlaves:IsubscribedSlave[] = []
  private isSubscribed: boolean
  private static lastMessage: string = ''
  private interval: NodeJS.Timeout | undefined
  private isPolling: boolean = false
  private pollMutex = new Mutex()
  validate(_discover: any) {
    // currently no meaningful checks
  }
  private pollCounts: Map<string, number> = new Map<string, number>()
  private triggers: {slave: Slave, force:boolean}[] = []
  private onDestroy(this: MqttDiscover) {
    if (this.client) this.client.end()
  }
  constructor(
    private mqttConnectionData: ImqttClient,
    private language?: string
  ) {
    const reg = new FinalizationRegistry(this.onDestroy.bind(this))
    this.isSubscribed = false
    reg.register(this, 0)
  }
  // bus/slave name:entity id:payload

  private generateEntityConfigurationTopic(slave:Slave, ent: Ientity): string {
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
      slave.getBusId() + 's' + slave.getSlaveId() +
      '/e' +
      ent.id +
      '/config'
    )
  }
  private getSlavesConfigurationTopic(): string {
    return Config.getConfiguration().mqttdiscoveryprefix + '/+/+/+/config'
  }
  private generateDiscoveryPayloads( slave: Slave, spec: ImodbusSpecification): ItopicAndPayloads[] {
    let payloads: { topic: string; payload: string }[] = []
    // instantiate the converters
    if ( this.language)
      for (let e of spec.entities) {
        // !slave.suppressedEntities.includes(e.id)
        if (e.id >= 0 && !e.variableConfiguration) {
          let converter = ConverterMap.getConverter(e)
          let ent: ImodbusEntity = e as ImodbusEntity

          if (converter) {
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

              if (!obj.value_template) obj.value_template = '{{ value_json.' + obj.object_id + ' }}'
              if (!obj.state_topic) obj.state_topic = slave.getStateTopic()
              if (!obj.availability && !obj.availability_topic)
                obj.availability_topic = slave.getAvailabilityTopic()
              if (!obj.command_topic && !e.readonly) obj.command_topic = slave.getEntityCommandTopic( ent)
              switch (converter.getParameterType(e)) {
                case 'Iselect':
                  if( !e.readonly){
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
                  }
                  break
                case "Itext":
                    if(!e.readonly){
                      let nt = e.converterParameters as Itext
                      if(nt.stringlength > 0)
                        obj.max=nt.stringlength
                      if( nt.identification && nt.identification.length)
                        obj.pattern = nt.identification  
                    }
                  break;
              }
              
              payloads.push({
                topic: this.generateEntityConfigurationTopic(slave, e),
                payload: JSON.stringify(obj),
              })
            }
          }
        }
      }
    else {
      log.log(LogLevelEnum.error, 'generateDiscoveryPayloads: specification or language is undefined')
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

  private getSubscribedSlaveFromDiscoveryTopic(topic: string): {slave?: IsubscribedSlave , entityId?:number} {
    let pathes = topic.split('/')

    if (pathes[2].match(/^[0-9]*s[0-9]*$/g) == null || pathes[3].match(/^e[0-9]*$/g) == null) return {}
    let busSlave = pathes[2].split("s")
    let busId = parseInt(busSlave[0])
    let slaveId = parseInt(busSlave[1])
    let entityId = parseInt(pathes[3].substring(1))
    return {
      slave: this.subscribedSlaves.find(s=>s.slave.getBusId() == busId && s.slave.getSlaveId()== slaveId ),
      entityId: entityId
    }
  }

  private onMqttDiscoverMessage(topic: string, payload: Buffer) {
    let ids = this.getSubscribedSlaveFromDiscoveryTopic(topic)
    // If there is no slave for the topic, it's not a modbus2mqtt topic. We can ignore it.
    if (ids.slave && ids.entityId) {
      let tp: Map<number, ItopicAndPayloads> | undefined = ids.slave.discoveryTopicAndPayload
      if (payload.length == 0 ) {
        // delete payload
          let tpx = tp.get(ids.entityId)
          if (tpx && tpx.topic == topic) {
              tp.delete(ids.entityId)
          }
      } else {
        // add payload
        let tpy = tp.get(ids.entityId)
        if( !tpy)
          tp.set(ids.entityId,{ topic: topic, payload: payload.toString() })
        else{
            if (  topic != tpy.topic ) {
              tp.set(ids.entityId,{ topic: topic, payload: payload.toString() })
            }  
        }
      }
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
            const mr = new Modbus()
            let promise: Promise<void>
            let modbus = parts.length == 5 && parts[4] == modbusValues
            if (!Config.getConfiguration().fakeModbus) {
              if (modbus)
                promise = mr.writeEntityModbus(busAndSlave.bus, busAndSlave.slave.slaveid, entity, {
                  data: JSON.parse(payload.toString()),
                  buffer: Buffer.allocUnsafe(0),
                })
              else promise = mr.writeEntityMqtt(busAndSlave.bus, busAndSlave.slave.slaveid, spec, entity.id, payload.toString())
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
  private sendCommandModbus(slave:Slave, entity:Ientity, modbus:boolean, payload:string):Promise<void> | undefined{
    if (entity && slave) {
      const cnv = ConverterMap.getConverter(entity)
      if (cnv) {
        const mr = new Modbus()
        let promise: Promise<void>
          if (modbus)
            return mr.writeEntityModbus(Bus.getBus(slave.getBusId())!, slave.getSlaveId(), entity, {
              data: JSON.parse(payload.toString()),
              buffer: Buffer.allocUnsafe(0),
            })
          else {
            let spec = slave.getSpecification()
            if( spec)
              return mr.writeEntityMqtt(Bus.getBus(slave.getBusId())!, slave.getSlaveId(),spec , entity.id, payload.toString())
          }
        } // for Testing
      }
      return undefined
  }
  private onMqttMessage(topic: string, payload: Buffer) {
    if (topic.startsWith(Config.getConfiguration().mqttdiscoveryprefix)) this.onMqttDiscoverMessage(topic, payload)
    else {
      let s = this.subscribedSlaves.find( s=>topic.startsWith(s.slave.getBaseTopic()!))
      if(s){
        if( s.slave.getTriggerPollTopic() == topic )
          this.triggerPoll(s.slave,false)
        if( s.slave  ){
          let entity = s.slave.getEntityFromCommandTopic(topic) 
          if( entity){
            let promise = this.sendCommandModbus(s.slave, entity, topic.endsWith("/setModbus/"), payload.toString())
            if( promise )
              promise.then(()=>{
                debug("Command sent to Modbus")
              }).catch(e=>{
                log.log(LogLevelEnum.error, e.message)
              })
          }
        }            
      }
   }      
  }
  private containsTopic(tp: ItopicAndPayloads, tps: ItopicAndPayloads[]) {
    let t = tps.findIndex((t) => tp.topic === t.topic)
    return -1 != t
  }

  private publishEntityDeletions( slave: Slave) {
    let baseTopic = slave.getBaseTopic()
    if(baseTopic){
      let subscribedSlave = this.subscribedSlaves.find( s=>Slave.compareSlaves(s.slave,slave))
      if( subscribedSlave)
      {
        subscribedSlave.discoveryTopicAndPayload.forEach((tp,entity)=>{
          let ent: Ientity | undefined = undefined
          let spec = slave.getSpecification()
          if (slave && spec)
            ent = (spec as unknown as IfileSpecification).entities.find((e) => entity == e.id)
  
          // If the slave has no specification, it has been removed. Remove all topics related to it
          // Or there is an entity which has another converter than configured in current specification
          if (
            !spec ||
            (ent && tp.topic != this.generateEntityConfigurationTopic(slave, ent))
          ) {
            if (ent)
              debug('delete ' + ent.id + ' topic ' + tp.topic + ' Spec converter:' + ent.converter.name + ' readonly: ' + ent.readonly)
            else debug('delete Bus/slave ' + baseTopic)
            this.client!.publish(tp.topic, Buffer.alloc(0), retain) // delete entity
          }
      })
    }
  }
}

  private async publishDiscoveryForSlave(slave:Slave, spec: ImodbusSpecification) {
    this.getMqttClient().then((mqttClient) => {
      if ( spec) {
        this.publishEntityDeletions(slave)
        let discoveryPayloads = this.generateDiscoveryPayloads(slave, spec);
        let subscribed = this.subscribedSlaves.find(s=>Slave.compareSlaves(slave,s.slave) ==0)
        for (let tp of discoveryPayloads) {
          let tpFound:boolean = false
          if(subscribed )
            subscribed.discoveryTopicAndPayload.forEach((tpx, entityId)=>{
              if( tpx.topic == tp.topic && tpx.payload == tp.payload )
                tpFound = true
            })          
            if (!tpFound ){
              mqttClient.publish(tp.topic, tp.payload, retain) // async, no callback !!!
              log.log(LogLevelEnum.notice, "published MQTT Discovery for " + tp.topic )
              debug( "Payload:" + tp.payload)
            }
          }
        }
      })
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
      opts.clean = true
      opts.clientId = 'modbus2mqtt'
      if (opts.ca == undefined) delete opts.ca
      if (opts.key == undefined) delete opts.key
      if (opts.cert == undefined) delete opts.cert
      // Close client when connection ends
      opts.will = {
        topic: 'modbus2mqtt/will',
        payload: Buffer.from('Goodbye!'),
        qos: 1,
      }
      this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)
      this.client.on('error', error)
      this.client.on('connect', () => {
        debug('New MQTT Connection ')
        this.client!.subscribe('modbus2mqtt/will', () => {
          debug(LogLevelEnum.notice, 'MQTT Connection will be closed by Last will')
          //this.client!.end()
        })   
        onConnected()
      })
    } else {
      error(new Error('mqtt server url is not defined'))
    }
  }

  validateConnection(client: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
    let conn = () => {
      this.connectMqtt(
        client,
        () => {
          callback(true, 'OK')
          if (this.client) this.client.end()
        },
        (e) => {
          this.error(e)
          this.client!.end()
          callback(false, e.toString())
        }
      )
    }
    if (this.client?.connected) this.client.end(conn)
    else conn()
  }

  private getMqttClient(): Promise<MqttClient> {
    return new Promise<MqttClient>((resolve, reject) => {
      if (this.client && this.client.connected) {
        resolve(this.client)
      } else {
        this.connectMqtt(
          undefined,
          () => {
            debug(LogLevelEnum.notice, 'poll: MQTT client reconnected')
            resolve(this.client!)
          },
          reject
        )
      }
    })
  }
  private publishStateAndSendDiscovery(slave: Slave, pollMode: PollModes): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let busId = slave.getBusId()
      let bus:Bus| undefined = busId != undefined? Bus.getBus(busId):undefined
      let specification = slave.getSpecification()
      if( bus && specification)
      Modbus.getModbusSpecification('poll', bus, slave.getSlaveId(), specification.filename, (e) => {
        log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
        reject(e)
      }).subscribe((spec) => {
        let idx = this.triggers.findIndex((k) => Slave.compareSlaves(k.slave, slave));
        this.publishDiscoveryForSlave(slave, spec) // no wait
        // Trigger state only if it's configured to do so
        let spMode = slave.getPollMode()
        if (
          spMode == undefined ||
          [PollModes.intervall, PollModes.intervallAndTrigger].includes(spMode) ||
          pollMode == PollModes.trigger || 
          (idx >=0 && this.triggers[idx].force)
        )
          this.publishState(slave, spec)
        // Remove trigger
        if (idx >= 0) this.triggers.splice(idx, 1)
        resolve()
      })
    })
  }

  private publishState(slave: Slave, spec:ImodbusSpecification) {    

    let topic = slave.getStateTopic()
    this.getMqttClient().then((mqttClient) => {
      try {
        mqttClient.publish( topic, slave.getStatePayload(spec.entities),{qos: slave.getQos() as any })
        mqttClient.publish(slave.getAvailabilityTopic(), 'online',{qos: slave.getQos() as any })
      } catch (e) {
        try {
          mqttClient.publish(slave.getAvailabilityTopic(), 'offline',{qos: slave.getQos() as any })
        } catch (e) {
          // ignore the error
        }
      }
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
      let allTopics: Promise<void>[] = []
      let needPolls: {
        slave: Slave
        pollMode: PollModes
      }[] = []

      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          let sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
          let pc: number | undefined = this.pollCounts.get(sl.getKey())
          let trigger = this.triggers.find((k) => Slave.compareSlaves(k.slave, sl))

          if (pc == undefined || pc > (slave.polInterval != undefined ? slave.polInterval / 100 : defaultPollCount)) pc = 0
          if (pc == 0 || trigger != undefined) {
            debug('Update Discovery')
            debugAction('poll start (' + bus.getId() + ',' + slave.slaveid + ')interval: ' + slave.polInterval)
            debug('poll: start sending payload busid: ' + bus.getId() + ' slaveid: ' + slave.slaveid)
            debugAction('poll end')
            let s = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            if (slave.specificationid && slave.specificationid.length > 0) {
              needPolls.push({ slave: s, pollMode: trigger == undefined ? PollModes.intervall : PollModes.trigger })
            }
          }
          this.pollCounts.set(sl.getKey(), ++pc)
        })
      })
      if (needPolls.length > 0)
        this.getMqttClient()
          .then((mqttClient) => {
            this.subscribeDiscovery()
            needPolls.forEach((bs) => {
              allTopics.push(this.publishStateAndSendDiscovery(bs.slave, bs.pollMode))
            })
            Promise.allSettled(allTopics)
              .then((values) => {
                values.forEach((v) => {
                  if (v.status == 'rejected') log.log(LogLevelEnum.error, v.reason.message)
                })
                resolve()
              })
              .finally(() => {
                this.isPolling = false
              })
              .catch(error)
          })
          .catch(error)
      else {
        this.isPolling = false
        resolve()
      }
    })
  }

  deleteSlave(slave:Slave) {
    this.publishEntityDeletions(slave)
    this.subscribedSlaves.forEach((ss, idx, object)=>{
      let sbusId =ss.slave.getBusId()
      let sSlaveId =ss.slave.getSlaveId()
      if( sbusId == slave.getBusId() && sSlaveId == slave.getSlaveId()){
        object.splice(idx,1)
      }
    })
  }
  deleteBus(busId: number) {
    let slaves = new Set<number>()
    let deletions:number[] = []
    this.subscribedSlaves.forEach((ss, idx, object)=>{
      let sbusId =ss.slave.getBusId()
      if( sbusId == busId){
        this.publishEntityDeletions(ss.slave)
        object.splice(idx,1)
      }
    })
  }

  triggerPoll(slave: Slave, force:boolean = false) {
    if (slave) {
      this.triggers.push({slave: slave, force: force})
    }
  }
  private subscribeDiscovery() {
    if (this.isSubscribed) return
    this.isSubscribed = true
    if (this.client == undefined) {
      log.log(LogLevelEnum.error, 'subscribeDiscovery: MQTT not connected (internal Error)')
      return
    } else if (this.client.disconnected) {
      log.log(LogLevelEnum.error, 'subscribeDiscovery: MQTT disconnected')
      return
    }
    this.client.subscribe(this.getSlavesConfigurationTopic(), {qos: 1},(err) => {
      if (err) log.log(LogLevelEnum.error, 'updatPublishSlave: MQTT subscribe error: ', err.message)
    })

    this.client.on('message', this.onMqttMessage.bind(this))
  }

  subscribeSlave(busid:number, slave: Islave){
    let ss = new Slave(busid, slave,Config.getConfiguration().mqttbasetopic)
    if( ! this.subscribedSlaves.find( s=> s.slave.getBaseTopic() == ss.getBaseTopic()) ){
      this.subscribedSlaves.push({slave: ss,discoveryTopicAndPayload:new Map<number,ItopicAndPayloads>()})
      this.client!.subscribe( ss.getBaseTopic() + "/#")
    }
  }

  unsubscribeSlave(busid:number, slave: Islave){
    let ss = new Slave(busid, slave,Config.getConfiguration().mqttbasetopic)
    let idx = this.subscribedSlaves.findIndex( s=> s.slave.getBaseTopic() == ss.getBaseTopic()) 
    if( idx >=0 ){
      this.subscribedSlaves.splice(idx,1)      
      this.client!.unsubscribe( ss.getBaseTopic() + "/#")
    }
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
