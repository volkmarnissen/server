import { Slave, PollModes, ModbusTasks, Islave } from '@modbus2mqtt/server.shared'
import Debug from 'debug'
import { LogLevelEnum, Logger } from '@modbus2mqtt/specification'
import { Bus } from './bus'
import { Config } from './config'
import { Modbus } from './modbus'
import { ItopicAndPayloads, MqttDiscover } from './mqttdiscover'
import { MqttConnector } from './mqttconnector'

const debug = Debug('mqttpoller')
const defaultPollCount = 50 // 5 seconds
const log = new Logger('mqttpoller')

export class MqttPoller {
  interval: NodeJS.Timeout | undefined
  private lastMessage: string = ''
  private isPolling: boolean = false
  private pollCounts: Map<string, number> = new Map<string, number>()

  constructor(private connector: MqttConnector) {}

  // poll gets triggered every 0.1 second
  // Depending on the pollinterval of the slaves it triggers publication of the current state of the slave
  private poll(bus: Bus): Promise<void> {
    return new Promise<void>((resolve, error) => {
      if (this.isPolling) {
        resolve()
      }
      this.isPolling = true
      let needPolls: {
        slave: Slave
        pollMode: PollModes
      }[] = []

      bus.getSlaves().forEach((slave) => {
        if (slave.pollMode != PollModes.noPoll) {
          let sl = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
          let pc: number | undefined = this.pollCounts.get(sl.getKey())

          if (pc == undefined || pc > (slave.pollInterval != undefined ? slave.pollInterval / 100 : defaultPollCount)) pc = 0
          if (pc == 0) {
            let s = new Slave(bus.getId(), slave, Config.getConfiguration().mqttbasetopic)
            if (slave.specification) {
              needPolls.push({ slave: s, pollMode: PollModes.intervall })
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
      if (needPolls.length > 0) {
        let tAndP: ItopicAndPayloads[] = []
        let pollDeviceCount = 0
        needPolls.forEach((bs) => {
          // Trigger state only if it's configured to do so
          let spMode = bs.slave.getPollMode()
          if (spMode == undefined || [PollModes.intervall, PollModes.intervallAndTrigger].includes(spMode)) {
            let bus = Bus.getBus(bs.slave.getBusId())
            if (bus)
              Modbus.getModbusSpecification(ModbusTasks.poll, bus, bs.slave.getSlaveId(), bs.slave.getSpecificationId(), (e) => {
                log.log(LogLevelEnum.error, 'reading spec failed' + e.message)
              }).subscribe((spec) => {
                tAndP.push({ topic: bs.slave.getStateTopic(), payload: bs.slave.getStatePayload(spec.entities), entityid: 0 })
                tAndP.push({ topic: bs.slave.getAvailabilityTopic(), payload: 'online', entityid: 0 })
                pollDeviceCount++
                if (pollDeviceCount == needPolls.length)
                  this.connector.getMqttClient((mqttClient) => {
                    debug('poll: publishing')
                    tAndP.forEach((tAndP) => {
                      mqttClient.publish(tAndP.topic, tAndP.payload)
                    })
                    resolve()
                  })
              })
          }
        })
      }
    })
  }

  startPolling(bus: Bus) {
    if (this.interval == undefined) {
      this.interval = setInterval(() => {
        this.poll(bus)
          .then(() => {})
          .catch(this.error)
      }, 100)
    }
  }
  private error(msg: any): void {
    let message = "MQTT: Can't connect to " + Config.getConfiguration().mqttconnect.mqttserverurl + ' ' + msg.toString()
    if (message !== this.lastMessage) log.log(LogLevelEnum.error, message)
    this.lastMessage = message
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
}
