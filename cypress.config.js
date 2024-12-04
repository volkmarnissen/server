const { defineConfig } = require('cypress')
const MqttHelper = require('./cypress/functions/mqtt')
module.exports = defineConfig({
  e2e: {
    baseUrl:'http://localhost',
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on('task', {
        mqttConnect(connectionData){

          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.connect(connectionData)
            console.log("test")
            resolve( "connected")        
          })
        },
        mqttSubscribe(topic){
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.subscribe(topic)
          return null
        },
        mqttPublish(topic, payload){
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.publish(topic, payload)
          return null
        },
        mqttGetTopicAndPayloads(){
          return new Promise((resolve) => {
            let mqttHelper = MqttHelper.getInstance()
            resolve( mqttHelper.getTopicAndPayloads())
          })
        },
        mqttResetTopicAndPayloads(){
          let mqttHelper = MqttHelper.getInstance()
          mqttHelper.resetTopicAndPayloads()
          return null
        }
      })
    },
    env: {
      "mqttconnect": {
        "mqttserverurl": "mqtt://localhost:3001",
        "username" : "homeassistant",
        "password" : "homeassistant"
      }
    },
  },
  
});
