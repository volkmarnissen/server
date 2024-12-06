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
    console.log('constructore')
  }

  onMessage(topic, payload) {
    console.log('onMessage')
    if (this.tAndP) this.tAndP.push({ topic: topic, payload: payload.toString() })
    else console.log('tAndP is undefined')
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
    console.log('subscribe')
    this.client.subscribe(topic, { qos: 1 })
  }
  getTopicAndPayloads() {
    console.log('getTopicsAndPayload: ' + this.tAndP.length)
    return new Promise((resolve) => {
      resolve(this.tAndP)
    })
  }
  resetTopicAndPayloads() {
    console.log('reset')
    if (this.tAndP == undefined) console.log('resetTopicAndPayloads this.tAndP is undefined')
    this.tAndP = []
  }
}
exports.getInstance = getInstance
exports.MqttHelper = MqttHelper
