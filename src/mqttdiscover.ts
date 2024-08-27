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
} from '@modbus2mqtt/specification.shared'
import { Ientity, ImodbusEntity, VariableTargetParameters, getSpecificationI18nEntityName } from '@modbus2mqtt/specification.shared'
import { IClientOptions, IClientPublishOptions, MqttClient, connect } from 'mqtt'
import { Modbus } from './modbus'
import { Bus } from './bus'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { ImqttClient, Islave } from '@modbus2mqtt/server.shared'
import { Mutex } from 'async-mutex'

const debug = Debug('mqttdiscover')
const debugAction = Debug('actions')
const log = new Logger('mqttdiscover')
const defaultPollCount = 50 // 5 seconds
export interface ItopicAndPayloads {
  topic: string
  payload: string
}
const retain: IClientPublishOptions = { retain: true }

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
  private isSubscribed: boolean
  private static lastMessage: string = ''
  private interval: NodeJS.Timeout | undefined
  private pollMutex = new Mutex()
  validate(_discover: any) {
    // currently no meaningful checks
  }

  private pollCounts: Map<string, number> = new Map<string, number>()
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
  private mqttDiscoveryTopics: Map<string, Map<number, ItopicAndPayloads[]>> = new Map<string, Map<number, ItopicAndPayloads[]>>()

  private generateStateTopic(busid: number, slave: Islave): string {
    return Config.getConfiguration().mqttbasetopic + '/' + busid + Config.getFileNameFromSlaveId(slave.slaveid) + '/state'
  }
  private generateEntityConfigurationTopic(busid: number, slaveId: number, ent: Ientity): string {
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
      busid +
      Config.getFileNameFromSlaveId(slaveId) +
      '/e' +
      ent.id +
      '/config'
    )
  }
  private generateEntityCommandTopic(busid: number, slave: Islave, ent: Ientity): string {
    return Config.getConfiguration().mqttbasetopic + '/set/' + busid + Config.getFileNameFromSlaveId(slave.slaveid) + '/e' + ent.id
  }
  private getDevicesCommandTopic(): string {
    return Config.getConfiguration().mqttbasetopic + '/set/+/+'
  }

  private getSlavesConfigurationTopic(): string {
    return Config.getConfiguration().mqttdiscoveryprefix + '/+/+/+/config'
  }
  private generateAvailatibilityTopic(busid: number, slave: Islave): string {
    return Config.getConfiguration().mqttbasetopic + '/' + busid + Config.getFileNameFromSlaveId(slave.slaveid) + '/availability'
  }
  private generateDiscoveryPayloads(busid: number, slave: Islave, spec: ImodbusSpecification): ItopicAndPayloads[] {
    let payloads: { topic: string; payload: string }[] = []
    // instantiate the converters
    if (slave.specification && this.language)
      for (let e of spec.entities) {
        // !slave.suppressedEntities.includes(e.id)
        if (e.id >= 0 && !e.variableConfiguration) {
          let converter = ConverterMap.getConverter(e)
          let ent: ImodbusEntity = e as ImodbusEntity

          if (converter) {
            var obj: any = new Object()
            obj.device = new Object()
            if (!obj.device.name)
              if (slave.name) obj.device.name = slave.name
              else {
                let name = getSpecificationI18nName(slave.specification, this.language, false)
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
              let filename = Config.getFileNameFromSlaveId(slave.slaveid)
              if (!obj.name && name) obj.name = name
              if (!obj.object_id && e.mqttname) obj.object_id = e.mqttname
              if (!obj.unique_id) obj.unique_id = 'M2M' + busid + filename + e.mqttname

              if (!obj.value_template) obj.value_template = '{{ value_json.' + obj.object_id + ' }}'
              if (!obj.state_topic) obj.state_topic = this.generateStateTopic(busid, slave)
              if (!obj.availability && !obj.availability_topic)
                obj.availability_topic = this.generateAvailatibilityTopic(busid, slave)
              if (!obj.command_topic && !e.readonly) obj.command_topic = this.generateEntityCommandTopic(busid, slave, ent)
              switch (converter.getParameterType(e)) {
                case 'Iselect':
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
                  if (e.converter.name === 'binary' && ns.device_class) obj.device_class = ns.device_class
                  break
                case 'Inumber':
                  let nn = e.converterParameters as Inumber
                  if (!obj.unit_of_measurement && nn && nn.uom) obj.unit_of_measurement = nn.uom
                  if (nn && nn.device_class && nn.device_class.toLowerCase() != 'none') obj.device_class = nn.device_class
                  if (e.converter.name === 'number' && nn.identification) {
                    if (nn.identification.min != undefined) obj.min = nn.identification.min
                    if (nn.identification.max != undefined) obj.max = nn.identification.max
                  }
                  break
              }
              payloads.push({
                topic: this.generateEntityConfigurationTopic(busid, slave.slaveid, e),
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

  private getIdsFromDiscoveryTopic(topic: string): IDiscoveryIds {
    let pathes = topic.split('/')
    return {
      busSlave: pathes[2],
      entityid: parseInt(pathes[3].substring(1)),
    }
  }
  private onMqttDiscoverMessage(topic: string, payload: Buffer) {
    let ids: IDiscoveryIds = this.getIdsFromDiscoveryTopic(topic)
    let tp: Map<number, ItopicAndPayloads[]> | undefined = this.mqttDiscoveryTopics.get(ids.busSlave)
    if (tp == undefined) {
      tp = new Map<number, ItopicAndPayloads[]>()
      this.mqttDiscoveryTopics.set(ids.busSlave, tp)
    }
    if (payload.length == 0) {
      // delete payload
      if (tp != undefined) {
        let tpx = tp.get(ids.entityid)
        if (tpx) {
          let idx = tpx.findIndex((i) => i.topic == topic)
          if (idx >= 0) {
            tpx.splice(idx, 1)
            debug('deleteMessage ' + topic)
          }

          if (tpx.length == 0) tp.delete(ids.entityid)
        }
        if (tp.size == 0) this.mqttDiscoveryTopics.delete(ids.busSlave)
      }
    } else {
      // add payload
      if (tp == undefined) {
        let tpn = new Map<number, ItopicAndPayloads[]>()
        tpn.set(ids.entityid, [{ topic: topic, payload: payload.toString() }])
        this.mqttDiscoveryTopics.set(ids.busSlave, tpn)
        tp = tpn
      }
      let tpy = this.mqttDiscoveryTopics.get(ids.busSlave)!.get(ids.entityid)!
      if (!tpy) tp.set(ids.entityid, [])
      tpy = this.mqttDiscoveryTopics.get(ids.busSlave)!.get(ids.entityid)!
      if (!this.containsTopic({ topic: topic, payload: payload.toString() }, tpy)) {
        tpy.push({ topic: topic, payload: payload.toString() })
        debug('addMessage:' + topic)
      } else this.updatePayload(topic, payload.toString(), tpy)
    }
  }
  private onMqttCommandMessage(topic: string, payload: Buffer) {
    let parts = topic.split('/')
    let busid = Number.parseInt(parts[2].substring(0, 1))
    let slaveid = Number.parseInt(parts[2].substring(2))
    let bus = Bus.getBus(busid)
    if (!bus) {
      log.log(LogLevelEnum.error, 'onMqttCommandMessage: invalid busid ' + busid)
      return
    }

    const device = bus!.getSlaveBySlaveId(slaveid)
    if (device && device.specificationid) {
      const spec = ConfigSpecification.getSpecificationByFilename(device.specificationid)
      if (spec) {
        const entity = spec.entities.find((ent) => {
          return 'e' + ent.id == parts[3]
        })
        if (entity) {
          const cnv = ConverterMap.getConverter(entity)
          if (cnv) {
            const mr = new Modbus()
            mr.writeEntityMqtt(bus, slaveid, spec, entity.id, payload.toString())
              .then(() => {
                this.triggerPoll(bus!.getId(), bus!.getSlaveBySlaveId(slaveid)!)
              })
              .catch((e) => {
                log.log(LogLevelEnum.error, 'writeEntityMqtt failed: ' + e.mesgs)
              })
          }
        }
      }
    }
  }

  private onMqttMessage(topic: string, payload: Buffer) {
    if (topic.startsWith(Config.getConfiguration().mqttdiscoveryprefix)) this.onMqttDiscoverMessage(topic, payload)
    else this.onMqttCommandMessage(topic, payload)
  }
  private containsTopic(tp: ItopicAndPayloads, tps: ItopicAndPayloads[]) {
    let t = tps.findIndex((t) => tp.topic === t.topic)
    return -1 != t
  }
  private updatePayload(topic: string, payload: string, tps: ItopicAndPayloads[]) {
    let tp = tps.findIndex((t) => topic === t.topic)
    if (tp != -1) tps[tp].payload = payload
  }
  private publishEntityDeletions(busId: number, slaveId: number) {
    let key = busId + Config.getFileNameFromSlaveId(slaveId)
    this.mqttDiscoveryTopics.get(key)?.forEach((payload, entity) => {
      payload.forEach((p) => {
        let ent: Ientity | undefined = undefined
        let bus = Bus.getBus(busId)
        let slave: Islave | undefined
        if (bus) slave = bus.getSlaveBySlaveId(slaveId)
        if (slave && slave.specification) ent = (slave.specification as IfileSpecification).entities.find((e) => entity == e.id)

        // If the slave has no specification, it has been removed. Remove all topics related to it
        // Or there is an entity which has another converter than configured in current specification
        if (
          !bus ||
          !slave ||
          !slave.specification ||
          (ent && p.topic != this.generateEntityConfigurationTopic(bus.getId(), slave.slaveid, ent))
        ) {
          if (ent)
            debug('delete ' + ent.id + ' topic ' + p.topic + ' Spec converter:' + ent.converter.name + ' readonly: ' + ent.readonly)
          else debug('delete Bus/slave ' + key)
          this.client!.publish(p.topic, Buffer.alloc(0), retain) // delete entity
        }
      })
    })
  }
  private async publishDiscoveryForSlave(bus: Bus, slave: Islave, spec: ImodbusSpecification) {
    debug('MQTT:publishDiscoveryForSlave')
    if (!this.client || this.client.disconnected) {
      log.log(LogLevelEnum.error, 'MQTT-Client not connected')
      return
    }

    if (bus && slave.specification) {
      let discoveryPayloads = this.generateDiscoveryPayloads(bus.getId(), slave, spec)
      for (let tp of discoveryPayloads) {
        let ids = this.getIdsFromDiscoveryTopic(tp.topic)
        let tpFound = this.mqttDiscoveryTopics.get(ids.busSlave)?.get(ids.entityid)
        if (!tpFound || !this.containsTopic(tp, tpFound))
          this.client.publish(tp.topic, tp.payload, retain) // async, no callback !!!
        else {
          debug('topic not changed for ' + tp.topic)
          let tpx = tpFound.find((t) => t.topic == tp.topic)
          if (!tpx || tp.payload != tpx.payload) {
            debug('payload changed for ' + tp.topic)
            this.client.publish(tp.topic, tp.payload, retain) // async, no callback !!!
          }
        }

        // publish topic deletions
        this.publishEntityDeletions(bus.getId(), slave.slaveid)
      }
    } else {
      if (!slave.specification)
        debug(
          'no specification found for bus ' +
            bus.getId() +
            ' slave: ' +
            slave.slaveid +
            ' specficationid: ' +
            (slave.specificationid ? slave.specificationid : 'N/A')
        )
      else log.log(LogLevelEnum.error, 'bus is not defined')
    }
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
      this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)
      this.client.on('error', error)
      this.client.on('connect', onConnected)
    } else {
      error(new Error('mqtt server url is not defined'))
    }
  }

  validateConnection(client: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
    if (!client) client = this.client
    if (!this.client)
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

  private publishDiscoverySlave(bus: Bus, slave: Islave, spec: ImodbusSpecification) {
    if (bus && slave) this.publishDiscoveryForSlave(bus, slave, spec)
  }
  getMqttClient(): MqttClient {
    if (this.client && this.client.connected) {
      return this.client
    } else {
      log.log(LogLevelEnum.error, 'poll: MQTT client is not connected')
      throw new Error('poll: MQTT client is not connected')
    }
  }
  private publishStateAndSendDiscovery(bus: Bus, slave: Islave): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Modbus.getModbusSpecification('poll', bus, slave.slaveid, slave.specificationid!, (e) => {
        log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
        reject(e)
      }).subscribe((spec) => {
        this.publishDiscoverySlave(bus, slave, spec)
        this.publishState(bus, slave, spec)
        resolve()
      })
    })
  }

  private publishState(bus: Bus, slave: Islave, spec: ImodbusSpecification) {
    let o: any = {}
    if (!bus) {
      let msg = 'Bus not defined'
      log.log(LogLevelEnum.error, msg)
      return
    }
    if (!slave.specificationid) {
      let msg = 'Specification not configured for busid: ' + bus.getId() + ' slaveid: ' + slave.slaveid
      debug(msg)
      return
    }

    for (let e of spec.entities) {
      let entity = e as ImodbusEntity
      let cv = ConverterMap.getConverter(entity)
      if (!cv) {
        let msg = 'No converter found for bus: ' + bus.getId() + ' slave: ' + slave.slaveid + ' entity id: ' + entity.id
        log.log(LogLevelEnum.error, msg)
        return
      } else if (e.mqttname && e.mqttValue && !e.variableConfiguration) o[e.mqttname] = e.mqttValue
    }
    let topic = this.generateStateTopic(bus.getId(), slave)
    try {
      this.getMqttClient().publish(topic, JSON.stringify(o))
      this.getMqttClient().publish(this.generateAvailatibilityTopic(bus.getId(), slave), 'online')
    } catch (e) {
      try {
        this.getMqttClient().publish(this.generateAvailatibilityTopic(bus.getId(), slave), 'offline')
      } catch (e) {
        // ignore the error
      }
    }
  }

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(): Promise<void> {
    return new Promise<void>((resolve, error) => {
      let allTopics: Promise<void>[] = []
      let needPolls:{
        bus:Bus,
        slave:Islave
      }[]=[]

      Bus.getBusses().forEach((bus) => {
        bus.getSlaves().forEach((slave) => {
          let key = new BusSlave(bus.getId(), slave.slaveid).key
          let pc: number | undefined = this.pollCounts.get(key)
          if (pc == undefined || pc > (slave.polInterval != undefined ? slave.polInterval / 100 : defaultPollCount)) pc = 0
          if (pc == 0) {
                debug('Update Discovery')
                debugAction('poll start (' + bus.getId() + ',' + slave.slaveid + ')interval: ' + slave.polInterval)
                debug('poll: start sending payload busid: ' + bus.getId() + ' slaveid: ' + slave.slaveid)
                debugAction('poll end')
                if (slave.specificationid && slave.specificationid.length > 0) {
                  needPolls.push({bus:bus, slave:slave})
                }
              }
          this.pollCounts.set(key, ++pc)
      })
      })
      if (needPolls.length > 0) 
        this.connectMqtt(
        undefined,
        () => {
          this.subscribeDiscovery()
          needPolls.forEach( bs=>{
            allTopics.push(this.publishStateAndSendDiscovery(bs.bus, bs.slave))
          })
          Promise.allSettled(allTopics).then((values) => {
            values.forEach((v) => {
              if (v.status == 'rejected') log.log(LogLevelEnum.error, v.reason.message)
            })
            if (allTopics.length > 0) debugAction('publish states finished')
            // Delete Discovery Topics of deleted Objects
                for (let key of this.mqttDiscoveryTopics.keys()) {
                  if (!this.pollCounts.has(key)) {
                    let ents = this.mqttDiscoveryTopics.get(key)
                    if (ents)
                      for (let tpi of ents.values()){
                        tpi.forEach((tpx) => {
                              this.getMqttClient().publish(tpx.topic, '')
                      })
                    
                      }
                  }
                }
                this.client?.end()
                resolve()
          })
        },  error)
        else
          resolve()
    })
  }

  deleteSlave(busId: number, slaveId: number) {
    this.publishEntityDeletions(busId, slaveId)
  }
  deleteBus(busId: number) {
    let slaves = new Set<number>()
    for (let key of this.mqttDiscoveryTopics.keys()) {
      if (key.startsWith('' + busId + 's')) {
        let pos = key.indexOf('s')
        slaves.add(Number.parseInt(key.substring(pos + 1)))
      }
    }
    for (let slaveId of slaves) this.publishEntityDeletions(busId, slaveId)
  }
  triggerPoll(busid: number, slave: Islave) {
    if (slave) {
      let key = '' + busid + Config.getFileNameFromSlaveId(slave.slaveid)
      this.pollCounts.set(key, 0)
    } else this.pollCounts = new Map<string, number>()
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
    this.client.subscribe(this.getSlavesConfigurationTopic(), (err) => {
      if (err) log.log(LogLevelEnum.error, 'updatPublishSlave: MQTT subscribe error: ', err.message)
    })
    this.client.subscribe(this.getDevicesCommandTopic(), (err) => {
      if (err) log.log(LogLevelEnum.notice, 'updatPublishSlave: MQTT subscribe error: ', err.message)
    })
    this.client.on('message', this.onMqttMessage.bind(this))
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
