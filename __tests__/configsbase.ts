import { Mutex } from 'async-mutex'
import { MqttDiscover } from '../src/mqttdiscover'
import Debug from 'debug'
import exp from 'constants'
import { Config } from '../src/config'

export const yamlDir = '__tests__/yaml-dir'
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
  isAsExcpected = false
  constructor(
    protected md: MqttDiscover,
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
            this.isAsExcpected = true
            break
          case FakeModes.Poll2:
            this.isAsExcpected = false
            break
        }
      debug('publish: ' + topic + '\n' + message)
    }
  }
  public end() {
    debug('end')
  }
  public on(event: 'message', cb: () => {}) {}
}
