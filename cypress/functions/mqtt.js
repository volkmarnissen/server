'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const mqtt = require('mqtt')
let instance = undefined
exports.MqttHelper = void 0
function getInstance() {
  if (instance == undefined) {
    console.log('call new')
    instance = new MqttHelper()
    if (instance.tAndP == undefined) console.log('After new tAndP is undefined')
  }
  return instance
}
class MqttHelper {
  client
  tAndP
  constructor() {
    this.tAndP = []
  }

  onMessage(topic, payload, packet) {
    if (this.tAndP && !this.tAndP.find((tp) => tp.messageId == packet.messageId)) {
      console.log('onMessage id:' + packet.messageId + ' topic:' + topic + ' payload: ' + payload.toString())
      this.tAndP.push({ topic: topic, payload: payload.toString(), messageId: packet.messageId })
    }
  }

  connect(connectionData) {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(connectionData.mqttserverurl, connectionData)
      this.client.on('error', reject)
      this.client.on('message', this.onMessage.bind(this))
      this.client.on('connect', () => {
        resolve()
      })
    })
  }
  publish(topic, payload) {
    this.client.publish(topic, payload, { qos: 1 })
  }
  subscribe(topic) {
    this.client.subscribe(topic, { qos: 1 })
  }
  getTopicAndPayloads() {
    return new Promise((resolve) => {
      resolve(this.tAndP)
    })
  }
  resetTopicAndPayloads() {
    if (this.tAndP == undefined) console.log('resetTopicAndPayloads this.tAndP is undefined')
    this.tAndP = []
  }
}
exports.getInstance = getInstance
exports.MqttHelper = MqttHelper
