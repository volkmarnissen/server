import { Config, ConfigListenerEvent } from './config'
import { ConverterMap } from '../specification'
import {
  Inumber,
  Iselect,
  getSpecificationI18nEntityOptionName,
  getSpecificationI18nName,
  IselectOption,
  ImodbusSpecification,
  EnumStateClasses,
  Itext,
  Ispecification,
} from '../specification.shared'
import { Ientity, ImodbusEntity, VariableTargetParameters, getSpecificationI18nEntityName } from '../specification.shared'
import { IClientPublishOptions, MqttClient } from 'mqtt'
import { ConfigBus } from './configbus'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '../specification'
import { Islave, Slave } from '../server.shared'
import { QoS } from 'mqtt-packet'

import { MqttConnector } from './mqttconnector'
import { MqttSubscriptions } from './mqttsubscriptions'
const debug = Debug('mqttdiscover')
const log = new Logger('mqttdiscover')
export interface ItopicAndPayloads {
  topic: string
  payload: string | Buffer
  entityid: number
}
const retain: IClientPublishOptions = { retain: true, qos: 1 }

export interface ImqttDevice extends Islave {
  busid: number
}

export class MqttDiscover {
  private client?: MqttClient
  private isSubscribed: boolean
  validate() {
    // currently no meaningful checks
  }
  private onDestroy(this: MqttDiscover) {
    if (this.client) this.client.end()
  }
  private static instance: MqttDiscover | undefined = undefined

  static getInstance(): MqttDiscover {
    if (MqttDiscover.instance) return MqttDiscover.instance

    MqttDiscover.instance = new MqttDiscover(MqttConnector.getInstance(), MqttSubscriptions.getInstance())

    return MqttDiscover.instance
  }
  constructor(
    private connector: MqttConnector,
    private subscriptions: MqttSubscriptions
  ) {
    const reg = new FinalizationRegistry(this.onDestroy.bind(this))
    this.isSubscribed = false
    reg.register(this, 0)
    ConfigBus.addListener(ConfigListenerEvent.addSlave, this.onUpdateSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteSlave, this.onDeleteSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.updateSlave, this.onUpdateSlave.bind(this))
    ConfigBus.addListener(ConfigListenerEvent.deleteBus, this.onDeleteBus.bind(this))
  }
  private generateEntityConfigurationTopic(slave: Slave, ent: Ientity): string {
    let haType = 'sensor'
    if (ent.readonly)
      switch (ent.converter) {
        case 'binary':
          haType = 'binary_sensor'
          break
      }
    else
      switch (ent.converter) {
        case 'binary':
          haType = 'switch'
          break
        default:
          haType = ent.converter
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
    const payloads: ItopicAndPayloads[] = []
    // instantiate the converters
    try {
      const language = Config.getConfiguration().mqttdiscoverylanguage
      if (language)
        for (const e of spec.entities) {
          // !slave.suppressedEntities.includes(e.id)
          if (e.id >= 0 && !e.variableConfiguration) {
            const converter = ConverterMap.getConverter(e)
            const ent: ImodbusEntity = e as ImodbusEntity

            if (converter) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const obj: any = new Object()
              obj.device = new Object()
              const slaveName = slave.getName()
              if (!obj.device.name)
                if (slaveName) obj.device.name = slaveName
                else {
                  const name = getSpecificationI18nName(spec, language, false)
                  if (name) obj.device.name = name
                }

              if (!obj.device.manufacturer && spec.manufacturer) obj.device.manufacturer = spec.manufacturer
              if (!obj.device.model && spec.model) obj.device.model = spec.model
              obj.device.identifiers = ['m2m' + slave.getBusId() + 's' + slave.getSlaveId()]
              spec.entities.forEach((ent1) => {
                if (ent1.variableConfiguration) {
                  switch (ent1.variableConfiguration.targetParameter) {
                    case VariableTargetParameters.deviceSerialNumber:
                      {
                        const sn = (ent1 as ImodbusEntity).mqttValue
                        if (sn) obj.device.serial_number = sn
                      }
                      break
                    case VariableTargetParameters.deviceSWversion:
                      {
                        const sv = (ent1 as ImodbusEntity).mqttValue
                        if (sv) obj.device.sw_version = sv
                      }
                      break
                    // case VariableTargetParameters.deviceIdentifiers:
                    //   let o = (ent1 as ImodbusEntity).mqttValue
                    //   if (o) obj.device.identifiers.push(o)
                    //   break
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
                const name = getSpecificationI18nEntityName(spec, language, e.id)
                const filename = Config.getFileNameFromSlaveId(slave.getSlaveId())
                if (!obj.name && name) obj.name = name
                if (!obj.object_id && e.mqttname) obj.object_id = e.mqttname
                if (!obj.unique_id) obj.unique_id = 'M2M' + slave.getBusId() + filename + e.mqttname

                if (!obj.value_template)
                  obj.value_template = e.value_template ? e.value_template : '{{ value_json.' + obj.object_id + ' }}'
                if (!obj.state_topic) obj.state_topic = slave.getStateTopic()
                if (!obj.availability && !obj.availability_topic) obj.availability_topic = slave.getAvailabilityTopic()
                const cmdTopic = slave.getEntityCommandTopic(ent)
                if (!obj.command_topic && !e.readonly) obj.command_topic = cmdTopic ? cmdTopic.commandTopic : undefined
                switch (converter.getParameterType(e)) {
                  case 'Iselect':
                    if (!e.readonly) {
                      const ns = e.converterParameters as Iselect
                      if (e.converter === 'select' && ns && ns.optionModbusValues && ns.optionModbusValues.length) {
                        obj.options = []
                        for (const modbusValue of ns.optionModbusValues)
                          obj.options.push(getSpecificationI18nEntityOptionName(spec, language, e.id, modbusValue))

                        if (obj.options == undefined || obj.options.length == 0)
                          log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: No options specified for ' + obj.name)
                        else
                          obj.options.forEach((o: IselectOption) => {
                            if (!o) log.log(LogLevelEnum.warn, 'generateDiscoveryPayloads: option with no text for ' + e.id)
                          })
                      }
                      obj.device_class = 'enum'
                      if (e.converter === 'binary' && ns.device_class) obj.device_class = ns.device_class
                    }
                    break
                  case 'Inumber':
                    {
                      const nn = e.converterParameters as Inumber
                      if (!obj.unit_of_measurement && nn && nn.uom) obj.unit_of_measurement = nn.uom
                      if (nn && nn.device_class && nn.device_class.toLowerCase() != 'none') obj.device_class = nn.device_class
                      if (nn && nn.state_class && nn.state_class) obj.state_class = MqttDiscover.getStateClass(nn.state_class)
                      if (e.converter === 'number' && !e.readonly) {
                        if (nn.step) obj.step = nn.step
                        if (nn.identification) {
                          if (nn.identification.min != undefined) obj.min = nn.identification.min
                          if (nn.identification.max != undefined) obj.max = nn.identification.max
                        }
                      }
                      if (nn.decimals != undefined) obj.suggested_display_precision = nn.decimals
                    }

                    break
                  case 'Itext':
                    if (!e.readonly) {
                      const nt = e.converterParameters as Itext
                      if (nt.stringlength > 0) obj.max = nt.stringlength
                      if (nt.identification && nt.identification.length) obj.pattern = nt.identification
                    }
                    break
                }
                payloads.push({
                  topic: this.generateEntityConfigurationTopic(slave, e),
                  payload: JSON.stringify(obj),
                  entityid: e.id,
                })
              }
            }
          }
        }
      else {
        log.log(LogLevelEnum.error, 'generateDiscoveryPayloads: specification or language is undefined')
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        debug('Exception ' + e.message)
        log.log(LogLevelEnum.error, e.message)
      } else {
        debug('Exception ' + String(e))
        log.log(LogLevelEnum.error, String(e))
      }
    }
    return payloads
  }
  private static getStateClass(state_class: EnumStateClasses): string {
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

  private generateDiscoveryEntities(slave: Slave, deleteAllEntities: boolean = false): ItopicAndPayloads[] {
    const tAndPs: ItopicAndPayloads[] = []
    const subscribedSlave = this.subscriptions.getSubscribedSlave(slave)
    const newSpec = slave.getSpecification()
    const oldSpec = subscribedSlave ? subscribedSlave.getSpecification() : undefined
    if (oldSpec && oldSpec.entities) {
      oldSpec.entities.forEach((oldEnt) => {
        const newEnt = newSpec?.entities.find((newE) => newE.id == oldEnt.id)
        const newTopic = newEnt ? this.generateEntityConfigurationTopic(slave, newEnt) : undefined
        const oldTopic = oldEnt ? this.generateEntityConfigurationTopic(slave, oldEnt) : undefined
        if (oldTopic)
          if (
            !newSpec ||
            deleteAllEntities ||
            slave.getNoDiscovery() ||
            slave.getNoDiscoverEntities().includes(oldEnt.id) ||
            !newEnt ||
            newTopic != oldTopic
          ) {
            if (oldEnt) debug('delete entity ' + slave.getBusId() + 's' + slave.getSlaveId() + '/e' + oldEnt.id)
            else debug('delete Bus/slave ')
            tAndPs.push({ topic: oldTopic, payload: Buffer.alloc(0), entityid: 0 }) // delete entity
          }
      })
    }
    if (!deleteAllEntities && newSpec && newSpec.entities) {
      this.generateDiscoveryPayloads(slave, newSpec as ImodbusSpecification).forEach((tp) => {
        if (!slave.getNoDiscoverEntities().includes(tp.entityid) && !slave.getNoDiscovery()) {
          tAndPs.push({ topic: tp.topic, payload: tp.payload, entityid: 0 }) // write entity
        }
      })
    }
    return tAndPs
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
      let newSlave: boolean = false
      const oldSlave = this.subscriptions.getSubscribedSlave(slave)
      if (oldSlave == undefined) newSlave = this.subscriptions.addSubscribedSlave(slave)

      const tAndPs = this.generateDiscoveryEntities(slave)
      if (tAndPs.length == 0) {
        const message = 'No entities found for discovery slave: ' + slave.getSlaveId()
        log.log(LogLevelEnum.error, message)
        reject(new Error(message))
        return
      }
      if (oldSlave)
        // delete after generateDiscoveryEntities, because entity deletions need to be recognized
        this.subscriptions.updateSubscribedSlave(oldSlave, slave)

      this.connector.getMqttClient((mqttClient) => {
        log.log(LogLevelEnum.info, 'Publish Discovery: length:' + tAndPs.length)
        tAndPs.forEach((tAndP) => {
          mqttClient.publish(tAndP.topic, tAndP.payload, retain)
          if (newSlave) this.subscriptions.resubscribe(mqttClient)
        })
      })

      // Wait for discovery
      setTimeout(() => {
        this.subscriptions
          .publishState(slave)
          .then(() => {
            resolve()
          })
          .catch(reject)
      }, 500)
    })
  }

  private onDeleteBus(busid: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const tAndPs: ItopicAndPayloads[] = []
      const subSlaves: Slave[] = this.subscriptions.getSubscribedSlavesForBus(busid)
      subSlaves.forEach((ss) => {
        const sbusId = ss.getBusId()
        if (sbusId == busid) {
          tAndPs.concat(this.generateDiscoveryEntities(ss, true))
        }
      })
      this.connector.getMqttClient((mqttClient) => {
        tAndPs.forEach((tAndP) => {
          mqttClient.publish(tAndP.topic, tAndP.payload, retain)
        })
        subSlaves.forEach((ss) => {
          this.subscriptions.deleteSubscribedSlave(ss, mqttClient)
        })
        resolve()
      })
    })
  }

  static generateQos(slave: Slave, spec?: Ispecification): QoS {
    const qos = slave.getQos()
    if ((qos == undefined || qos == -1) && spec != undefined)
      if (spec.entities.find((e) => e.readonly == false) != undefined) return 1
      else return 0

    return qos ? (qos as QoS) : 1
  }

  private onDeleteSlave(slave: Slave): Promise<void> {
    return new Promise<void>((resolve) => {
      this.connector.getMqttClient((mqttClient) => {
        const tAndPs = this.generateDiscoveryEntities(slave, true)
        this.subscriptions.deleteSubscribedSlave(slave, mqttClient)
        tAndPs.forEach((tAndP) => {
          mqttClient.publish(tAndP.topic, tAndP.payload, retain)
        })
        mqttClient.unsubscribe(slave.getTriggerPollTopic())
        const cmdTopic = slave.getCommandTopic()
        if (cmdTopic) {
          mqttClient.unsubscribe(cmdTopic)
          mqttClient.unsubscribe(slave.getEntityCommandTopicFilter())
        }
        resolve()
      })
    })
  }
}
