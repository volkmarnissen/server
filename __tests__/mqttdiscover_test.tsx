import { Config } from '../src/config'
import {
  ImodbusEntity,
  ImodbusSpecification,
  ModbusRegisterType,
  VariableTargetParameters,
} from '@modbus2mqtt/specification.shared'
import { ModbusCache } from '../src/modbuscache'
import { ItopicAndPayloads, MqttDiscover } from '../src/mqttdiscover'
import {
  Client,
  ClientSubscribeCallback,
  IClientSubscribeOptions,
  IClientSubscribeProperties,
  ISubscriptionMap,
  MqttClient,
} from 'mqtt'
import { submitGetHoldingRegisterRequest } from '../src/submitRequestMock'
import { yamlDir } from './configsbase'
import { Bus } from '../src/bus'
import Debug from 'debug'
import { ConfigSpecification, Logger } from '@modbus2mqtt/specification'
import { expect, test, afterAll, beforeAll, jest, xtest } from '@jest/globals'
const debug = Debug('mqttdiscover_test')
enum FakeModes {
  Poll,
  Poll2,
  Discovery,
}
const topic4Deletion = {
  topic: 'homeassistant/sensor/1s0/e1/topic4Deletion',
  payload: '',
}
class FakeMqtt {
  disconnected = false
  connected = true
  isAsExcpected = false
  constructor(
    private md: MqttDiscover,
    public fakeMode: FakeModes
  ) {}
  public subscribe(topic: string | string[]): void {
    debug('subscribe: ' + topic)
  }
  public publish(topic: string, message: string): void {
    if (topic.startsWith(Config.getConfiguration().mqttdiscoveryprefix)) {
      debug('publish Discovery ' + topic + '\n' + message)
      this.md['onMqttMessage'](topic, Buffer.from(message, 'utf8'))
    } else {
      if (topic.endsWith('availabitlity')) {
        debug('publish ' + topic + '\n' + message)
      } else
        switch (this.fakeMode) {
          case FakeModes.Poll:
            expect(topic).toContain('modbus2mqtt/')
            expect(message).not.toBe('{}')
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

Config['yamlDir'] = yamlDir
ConfigSpecification.yamlDir = yamlDir
Config.sslDir = yamlDir

let readConfig: Config = new Config()
readConfig.readYaml()
new ConfigSpecification().readYaml()
let oldLog: any
beforeAll(() => {
  ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
  oldLog = Logger.prototype.log
  Logger.prototype.log = jest.fn()
})
afterAll(() => {
  Logger.prototype.log = oldLog
})
const selectTestId = 3
const numberTestId = 4
var md: MqttDiscover | undefined
let slave = Bus.getBus(0)!.getSlaveBySlaveId(2)!
let spec = slave.specification as ImodbusSpecification
let numberTest: ImodbusEntity = {
  id: numberTestId,
  mqttname: 'mqtt',
  modbusAddress: 2,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  converter: { name: 'number', registerTypes: [] },
  modbusValue: [],
  mqttValue: '300',
  identified: 1,
  converterParameters: { multiplier: 1, offset: 0, uom: 'kW' },
}

if (slave !== undefined && slave!.specificationid) {
  spec.entities.splice(0, 4)
  let serialNumber: ImodbusEntity = {
    id: 0,
    mqttname: 'serialnumber',
    variableConfiguration: {
      targetParameter: VariableTargetParameters.deviceIdentifiers,
    },
    converter: { name: 'text', registerTypes: [] },
    modbusValue: [],
    mqttValue: '123456',
    identified: 1,
    converterParameters: { stringlength: 12 },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: false,
    modbusAddress: 2,
  }
  let currentSolarPower: ImodbusEntity = {
    id: 1,
    mqttname: 'currentpower',
    converter: { name: 'number', registerTypes: [] },
    modbusValue: [],
    mqttValue: '300',
    identified: 1,
    converterParameters: { uom: 'kW' },
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    modbusAddress: 2,
  }
  let selectTest: ImodbusEntity = {
    id: selectTestId,
    mqttname: 'selecttest',
    modbusAddress: 1,
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    converter: { name: 'select', registerTypes: [] },
    modbusValue: [],
    mqttValue: '300',
    identified: 1,
    converterParameters: { optionModbusValues: [1, 2, 3] },
  }
  spec.manufacturer = 'Deye'
  spec.model = 'SUN-10K-SG04LP3-EU'
  spec.i18n[0].texts = [
    { textId: 'name', text: 'Deye Inverter' },
    { textId: 'e1', text: 'Current Power' },
    { textId: 'e3', text: 'Select Test' },
    { textId: 'e3o.1', text: 'Option 1' },
    { textId: 'e3o.2', text: 'Option 2' },
    { textId: 'e3o.3', text: 'Option 3' },
  ]
  spec.entities.push(serialNumber)
  spec.entities.push(currentSolarPower)
  spec.entities.push(selectTest)
}

var tps: ItopicAndPayloads[] = []
function spyMqttOnMessage(ev: string, _cb: Function): MqttClient {
  if (ev === 'message') {
    for (let tp of tps) {
      md!['onMqttMessage'](tp.topic, Buffer.from(tp.payload, 'utf8'))
    }
  }
  return md!['client'] as MqttClient
}

test('Discover', (done) => {
  Config['config'].mqttusehassio = false
  new Config().getMqttConnectOptions().then((options) => {
    let md = new MqttDiscover(options, 'en')
    let payloads: { topic: string; payload: string }[] = md['generateDiscoveryPayloads'](0, slave, spec)
    expect(payloads.length).toBe(2)
    let payloadCurrentPower = JSON.parse(payloads[0].payload)
    let payloadSelectTestPower = JSON.parse(payloads[1].payload)
    expect(payloadCurrentPower.name).toBe('Current Power')
    expect(payloadCurrentPower.unit_of_measurement).toBe('kW')
    expect(payloadSelectTestPower.device.name).toBe('Deye Inverter')
    expect(payloadSelectTestPower.name).toBe('Select Test')
    expect(payloadSelectTestPower.options[0]).toBe('Option 1')

    let pl = JSON.parse(payloads[0].payload)
    //expect(pl.unit_of_measurement).toBe("kW");
    expect(pl.device.manufacturer).toBe(spec.manufacturer)
    expect(pl.device.model).toBe(spec.model)
    pl = JSON.parse(payloads[1].payload)
    expect(pl.options.length).toBe(3)
    done()
  })
})
// test("pollIntervallToMilliSeconds", (done) => {
//     new Config().getMqttConnectOptions().then((options) => {
//         let md = new MqttDiscover(options,"en");
//         expect(md['pollIntervallToMilliSeconds']("5 min") as any).toBe(5 * 60 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("5 sec") as any).toBe(5 * 1000);
//         expect(md['pollIntervallToMilliSeconds']("15 sec") as any).toBe(15 * 1000);
//         done();
//     });

// });
xtest('validateConnection success', (done) => {
  let options = Config.getConfiguration().mqttconnect

  let md = new MqttDiscover(options, 'en')
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeTruthy()
    done()
  })
})

test('validateConnection invalid port', (done) => {
  let options = Config.getConfiguration().mqttconnect
  options.mqttserverurl = 'mqtt://localhost:999'
  options.connectTimeout = 200
  let md = new MqttDiscover(options, 'en')
  md.validateConnection(undefined, (valid, message) => {
    expect(valid).toBeFalsy()
    done()
  })
})
test('onMqttConnect', (done) => {
  Config.setFakeModbus(true)
  Config['config'].mqttusehassio = false
  new Config().getMqttConnectOptions().then((options) => {
    md = new MqttDiscover(options, 'en')
    jest.mock('mqtt')
    let c: MqttClient = Object.create(Client.prototype)
    c.connected = true
    md['client'] = c
    // subscribe to discovery for one device
    const mockPublish = jest.fn((_topic: string, _payload: string | Buffer) => c)
    const mockMqttUnsubscribe = jest.fn((_topic: string | string[]) => c)
    const mockSubscribe = jest.fn(
      (
        _topic: string | string[] | ISubscriptionMap,
        opts?: IClientSubscribeOptions | IClientSubscribeProperties | undefined,
        _callback?: ClientSubscribeCallback | undefined
      ) => c
    )
    tps = md['generateDiscoveryPayloads'](0, slave, spec)
    jest.spyOn(c, 'subscribe').mockImplementation(mockSubscribe)
    jest.spyOn(c, 'publish').mockImplementation(mockPublish)
    jest.spyOn(c, 'on').mockImplementation(spyMqttOnMessage)
    jest.spyOn(c, 'unsubscribe').mockImplementation(mockMqttUnsubscribe)

    md['publishDiscoveryForSlave'](Bus.getBus(0)!, slave, spec).then(() => {
      expect(c.publish).toHaveBeenCalledTimes(2)
      spec.entities.push(numberTest)
      md!['publishDiscoveryForSlave'](Bus.getBus(0)!, slave, spec).then(() => {
        expect(c.publish).toHaveBeenCalledTimes(5)
        tps = md!['generateDiscoveryPayloads'](0, slave, spec)
        spec.entities.splice(-1)
        md!['publishDiscoveryForSlave'](Bus.getBus(0)!, slave, spec).then(() => {
          expect(c.publish).toHaveBeenCalledTimes(7)
          tps = md!['generateDiscoveryPayloads'](0, slave, spec)
          md!['publishDiscoveryForSlave'](Bus.getBus(0)!, slave, spec).then(() => {
            expect(c.publish).toHaveBeenCalledTimes(9)
            done()
          })
        })
      })
    })
  })
})
test('poll', (done) => {
  md = new MqttDiscover({}, 'en')
  let fake = new FakeMqtt(md, FakeModes.Poll)
  md['client'] = fake as any as MqttClient
  md['connectMqtt'] = function (undefined, onConnected: () => void, error: (e: any) => void) {
    onConnected()
  }
  md['poll']().then(() => {
    expect(fake.isAsExcpected).toBeTruthy()
    expect(md!['pollCounts'].size).toBeGreaterThan(0)
    let c = md!['pollCounts'].values().next()
    expect(c.value).toBeGreaterThan(0)
    fake = new FakeMqtt(md!, FakeModes.Poll2)
    // second call should do nothing, because interval is too short
    md!['client'] = fake as any as MqttClient
    fake.isAsExcpected = true
    let m = new Map<number, ItopicAndPayloads[]>()
    m.set(1, [topic4Deletion])

    md!['mqttDiscoveryTopics'].set('1s0', m)
    md!['poll']().then(() => {
      expect(fake.isAsExcpected).toBeTruthy()
      let c = md!['pollCounts'].values().next()
      md!['pollCounts'].set('0s1', 10000)
      expect(c.value).toBeGreaterThan(1)
      //call discovery explictely
      // Expectation: It should not publish anything, because this has happened already
      let bus = Bus.getBus(0)
      fake.isAsExcpected = false
      fake.fakeMode = FakeModes.Discovery
      let slave = bus?.getSlaveBySlaveId(1)
      md!['poll']().then(() => {
        expect(md!['mqttDiscoveryTopics'].get('1s0') == undefined).toBeTruthy()
        done()
      })
    })
  })
})
git c