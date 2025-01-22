const { defineConfig } = require('cypress')
const MqttHelper = require('./cypress/functions/mqtt')
const readyator = require('readyator')
const spawn = require('child_process').spawn
const path = require('path');
const fs = require('fs');

function startServer(command, args, ports) {
    console.log("starting " + command)
    let execFile = process.env.PATH.split(path.delimiter).find(dir=>fs.existsSync(path.join(dir, command ) ))
    if( execFile )
      spawn(path.join(execFile, command ),args)
      if( ports){
        return readyator.default(ports)
      }
    return new Promise((resolve)=>{resolve()})
}

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost',
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on('task', {
        mqttConnect(connectionData) {
          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.connect(connectionData)
            console.log('test')
            resolve('connected')
          })
        },
        mqttSubscribe(topic) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.subscribe(topic)
          return null
        },
        mqttPublish(topic, payload) {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.publish(topic, payload)
          return null
        },
        mqttGetTopicAndPayloads() {
          return new Promise((resolve) => {
            let mqttHelper = MqttHelper.getInstance()
            resolve(mqttHelper.getTopicAndPayloads())
          })
        },
        mqttResetTopicAndPayloads() {
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.resetTopicAndPayloads()
          return null
        },
        e2eInit() { return startServer("npm", ["run", "e2e:init"], [3002, 3006])},
        e2eReset() { return startServer("npm", ["run", "e2e:reset"],[3001, 3003,3004, 3005]) },
        e2eStop() { return startServer("npm", ["run", "e2e:stop"] ,[]) }
    })
  },
    env: {
      mqttconnect: {
        mqttserverurl: 'mqtt://localhost:3001',
        username: 'homeassistant',
        password: 'homeassistant',
      },
    },
  },
})
