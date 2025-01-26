const { defineConfig } = require('cypress')
const MqttHelper = require('./cypress/functions/mqtt')
const waitOn = require('wait-on')
const spawn = require('child_process').spawn
const path = require('path');
const fs = require('fs');
var initControllers = []
var resetControllers = []
function stopChildProcess(c){
  console.log("stopChildProcess " + c.command)
  c.child_process.kill('SIGTERM', (err) => {
    console.log("Aborted: " + JSON.stringify(err))
  });

}
function restartServers(command, args, ports, controllerArray) {
  return new Promise((resolve, reject)=>{
    let pathes = process.env.PATH.split(path.delimiter);
    pathes.unshift('');
    let execFile = pathes.find(dir=>fs.existsSync(path.join(dir, command ) ))
    if( execFile ){
      controllerArray.forEach(stopChildProcess)
       setTimeout(()=>{
        args.forEach(arg=>{
          let cmd = command +' ' + arg
          console.log("starting " + cmd)
                let child_process = spawn(path.join(execFile, command ),arg.split(' '))
                const cmdObj = {
                  command:cmd,
                  prefix: arg,
                  child_process: child_process,
                  onData: function(data){
                    console.log(this.prefix + ":" + data)
                  },
                  onClose:  (controllerArray,code) => {
                    console.log(`${this.command} exited with code ${code}`);
                    const findCommand = (c)=>c.command == cmd 
                    let idx = controllerArray.findIndex(findCommand)
                    if( idx >=0 )
                      controllerArray.splice(idx,1)
                  }
                }      
                controllerArray.push(cmdObj)
                child_process.stdout.on('data', cmdObj.onData.bind(cmdObj));
                child_process.stderr.on('data', cmdObj.onData.bind(cmdObj));
                child_process.on('close', cmdObj.onClose.bind(cmdObj, controllerArray));
        })
        let opts={
          resources: [],
          timeout:3000  
        }
        if( ports){
          ports.forEach(port=>{ opts.resources.push("tcp:localhost:" + port)} )
        }
        waitOn(opts).then(resolve("running")) .catch(reject)     
      }, 100)
    
    }
    else
      reject( "exec file for " + command + " not found" )
  })
}

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on('task', {
        mqttConnect(connectionData) {
          return new Promise((resolve, reject) => {
            // mqtt connect with onConnected = resolve
            let mqttHelper = MqttHelper.getInstance()
            mqttHelper.connect(connectionData)
            console.log('mqttConnection: ' + JSON.stringify(connectionData))
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
        e2eInit() { return restartServers("sh", 
          ["cypress/servers/nginx","cypress/servers/modbustcp"], 
          [config.env.nginxAddonHttpPort, config.modbusTcpHttpPort], 
          initControllers)},
        e2eReset() { return restartServers("sh", 
          [
            "cypress/servers/mosquitto",
            "cypress/servers/modbus2mqtt " + config.env.modbus2mqttE2eHttpPort,
            "cypress/servers/modbus2mqtt " + config.env.modbus2mqttAddonHttpPort + " localhost"
          ],[
            config.env.mosquittoAuthMqttPort, 
            config.env.mosquittoNoAuthMqttPort,
            config.env.modbus2mqttAddonHttpPort, 
            config.env.modbus2mqttE2eHttpPort
          ], 
          resetControllers) 
        },
        e2eStop() { 
          
          return new Promise((resolve)=>{
            initControllers.forEach(stopChildProcess)
            resetControllers.forEach(stopChildProcess)
            resolve('Stopped')
          })
         }
    })
  },
    env: {
      nginxAddonHttpPort: 3006, //nginx
      modbus2mqttAddonHttpPort: 3004, //ingress port
      modbusTcpHttpPort: 3002, 
      modbus2mqttE2eHttpPort: 3005,
      mosquittoAuthMqttPort: 3001,
      mosquittoNoAuthMqttPort: 3003,
      mqttconnect: {
        mqttserverurl: 'mqtt://localhost:3001',
        username: 'homeassistant',
        password: 'homeassistant',
      },
    },
  },
})
