import { Mutex } from 'async-mutex'
import Debug from 'debug'
import { Config } from '../../src/server/config'
import { ImqttClient } from '../../src/server.shared'
import { ConfigBus } from '../../src/server/configbus'
import { Bus } from '../../src/server/bus'
import { MqttSubscriptions } from '../../src/server/mqttsubscriptions'
import { ConfigSpecification } from '../../src/specification'

export const yamlDir = '__tests__/server/yaml-dir'
export const backendTCPDir = '__tests__/server/backendTCP'
export let singleMutex = new Mutex()
export enum FakeModes {
  Poll,
  Poll2,
  Discovery,
}
let debug = Debug('configsbase')

export class FakeMqtt {
  disconnected = false
  connected = true
  isAsExpected = false
  options: ImqttClient = {
    username: 'modbus2mqtt',
    password: 'modbus2mqtt',
  }
  constructor(
    protected md: MqttSubscriptions,
    public fakeMode: FakeModes
  ) {}
  public subscribe(topic: string | string[]): void {
    debug('subscribe: ' + topic)
  }
  public unsubscribe(topic: string | string[]): void {
    debug('unsubscribe: ' + topic)
  }
  public publish(topic: string, message: Buffer): void {
    if (topic.startsWith(Config.getConfiguration().mqttdiscoveryprefix)) {
      debug('publish Discovery ' + topic + '\n' + message.toString())
      this.md['onMqttMessage'](topic, message)
    } else {
      if (topic.endsWith('availabitlity')) {
        debug('publish ' + topic + '\n' + message.toString())
      } else
        switch (this.fakeMode) {
          case FakeModes.Poll:
            this.isAsExpected = true
            break
          case FakeModes.Poll2:
            this.isAsExpected = false
            break
        }
      debug('publish: ' + topic + '\n' + message)
    }
  }
  public end(endFunc: () => void) {
    endFunc()
    debug('end')
  }
  public on(event: 'message', cb: () => {}) {}
}

export function initBussesForTest() {
  new ConfigSpecification().readYaml()
  ConfigBus.readBusses()
  let ibs = ConfigBus.getBussesProperties()
  if (!Bus['busses']) Bus['busses'] = []
  ibs.forEach((ib) => {
    let bus = Bus['busses']!.find((bus) => bus.getId() == ib.busId)
    if (bus !== undefined) bus.properties = ib
    else {
      let b = new Bus(ib)
      b.getSlaves().forEach((s) => {
        s.evalTimeout = true
      })
      Bus['busses']!.push(b)
    }
  })
}
