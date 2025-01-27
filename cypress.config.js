const { defineConfig } = require('cypress')
const EventEmitter = require('node:events');

const MqttHelper = require('./cypress/functions/mqtt')
const waitOn = require('wait-on')
const spawn = require('child_process').spawn
const execFileSync = require('child_process').execFileSync
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process')

const stopServiceTimeout = 20000
var initControllers = []
var resetControllers = []

function pidIsRunning(pid) {
  try {
    process.kill(pid, 'SIGINT');
    return true;
  } catch(e) {
    let rc = (e.code != 'ESRCH')
    return rc
   }
}

function stopChildProcess(c){
  console.log("stopChildProcess " + c.command + " " + c.child_process.pid)
  if( c.killpid >0){
    console.log(execFileSync("kill" ,["-SIGINT", c.killpid.toString() ]))
  }
  else
  c.child_process.kill('SIGINT', (err) => {
    console.log("Aborted: " + JSON.stringify(err))
  });
  
}
let stoppedTimer = {}
let tmpdirs=[]
let onAllProcessesStopped = new EventEmitter()
function startProcesses(command, args,ports,controllerArray){
   return new Promise((resolve, reject)=>{
  if(  controllerArray.length == 0){
    let pathes = process.env.PATH.split(path.delimiter);
    pathes.unshift('');
    let execFile = pathes.find(dir=>fs.existsSync(path.join(dir, command ) ))
    if( execFile ){
      args.forEach(arg=>{
        let cmd = command +' ' + arg
        console.log("starting " + cmd )
              let child_process = spawn(path.join(execFile, command ),arg.split(' '))
              const cmdObj = {
                command:cmd,
                prefix: arg,
                child_process: child_process,
                onData: function(data){
                  console.log(this.prefix + ":" + data)
                  let tmp = data.toString()
                  if( tmp.startsWith("TMPDIR=")){
                    let t = tmpdirs.find(tc=>tc.command== this.command)
                    tmp = tmp.substring("TMPDIR=".length).trim()
                    if( t )
                      t.tmpdir = tmp
                    else
                      tmpdirs.push({ command:this.command, tmpdir: tmp } )
                  }
                  if( data.toString().startsWith("KILLPID=")){
                    this.killpid = Number.parseInt(data.toString().substring("KILLPID=".length ))
                  }
                },
                onClose:  function (controllerArray,code){
                  console.log(`${cmd} exited with code ${code}`);
                  const findCommand = (c)=>c.command == cmd 
                  let l = controllerArray.length
                  if( controllerArray && controllerArray.length){
                    let idx = controllerArray.findIndex(findCommand)
                    if( idx >=0 ){
                      controllerArray.splice(idx,1)
                      if(controllerArray.length == 0 ){
                        console.log("All Processes stopped " +  stoppedTimer.timer)
                        if( stoppedTimer.timer != undefined )
                          clearTimeout(stoppedTimer.timer)
                        stoppedTimer.timer = undefined
                        onAllProcessesStopped.emit('stopped')
                      }
                      else{
                        controllerArray.forEach( c=>console.log("Living " +  c.command))
                        console.log("Living processes " +  controllerArray.length)
                      }
                    }
                    else
                     console.log( "Command not found " + cmd)
                  }
                }
              }      
              controllerArray.push(cmdObj)
              child_process.stdout.on('data', cmdObj.onData.bind(cmdObj));
              child_process.stderr.on('data', cmdObj.onData.bind(cmdObj));
              child_process.on('close', cmdObj.onClose.bind(cmdObj, controllerArray));
      })
      if( args.length == controllerArray.length){
        waitForPorts(args, controllerArray, ports).then(()=>{
            console.log("Processes started")
            resolve("OK")
          }).catch(reject)
      }
    } 
  }else{
    reject(new Error("There are running processes"))
  }
})
}
function waitForPorts(args, controllerArray, ports){
  return new Promise((resolve, reject)=>{
    if( !args || !controllerArray || args.length != controllerArray.length){
      console.log("Not all Processes started")
      reject("Processes not started correctly")
      return
    } 
    console.log( "opts")
    
    let opts={
      resources: [],
      timeout:20000  
    }
    if( ports && ports.length){
       ports.forEach(port=>{ opts.resources.push("tcp:localhost:" + port)} )
    }
      
     waitOn(opts).then(
       ()=>{
        console.log( "WaitThen")
          let rc = []
          console.log("waitSuccess " + args[0])
          resolve("Process started")
  
       }) .catch(reject)  
  })
}
function stopServices( controllerArray) {
  return new Promise((resolve, reject)=>{
    if( controllerArray.length == 0)
      resolve("OK")
    else
    {
      let interv = setInterval(()=>{
        controllerArray.forEach((c,idx )=>{
          // Sometimes the processes are dead, 
          // but there is no close event in this case
          // delete the controllerArray entry
          let killpid = c.killpid
          if( !c.killpid)
            killpid = c.child_process.pid
          console.log("pid " + killpid)
          if( killpid && !pidIsRunning(killpid)){
            controllerArray.splice(idx,1)
          }
        },500)
        if( controllerArray.length == 0){
          clearInterval(interv)
          interv = 0
          onAllProcessesStopped.emit('stopped')
        } 
      }, 1000)
      stoppedTimer.timer = setTimeout(()=>{
        console.log("Stopping Services timeout" )
        reject("Stopping processes timed out" )
        if(interv)clearInterval(interv)
      },stopServiceTimeout)
      onAllProcessesStopped.on('stopped', ()=>{
        if( interv )clearInterval(interv)
        resolve("OK")})
      controllerArray.forEach(stopChildProcess)
    }
  })
}

function restartServers(command, args, ports, controllerArray) {
  return new Promise((resolve, reject)=>{
    console.log( "RestartServers")
    let pathes = process.env.PATH.split(path.delimiter);
    pathes.unshift('');
    let execFile = pathes.find(dir=>fs.existsSync(path.join(dir, command ) ))
    if( execFile ){
      if( controllerArray.length){
        stoppedTimer.timer = setTimeout(()=>{
          console.log("Stopping timeout " + args[0] + " " + stoppedTimer.timer)
          reject("Stopping processes timed out " )
        },stopServiceTimeout)
        controllerArray.forEach(stopChildProcess)
      }
      console.log("Restart:StartProcess " + stoppedTimer.timer)
      startProcesses(execFile,command, args,controllerArray,stoppedTimer,ports, 
        ()=>{console.log("RestartServer resolvedXX"); resolve("OK") }).then(()=>{
              console.log( "RestartServers resolved")
              resolve("OK")}).catch(reject)
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
        e2eInitServicesStart() { 
          console.log("e2eInit")
          return startProcesses("sh", 
          ["cypress/servers/nginx","cypress/servers/modbustcp"], 
          [config.env.nginxAddonHttpPort, config.env.modbusTcpHttpPort], 
          initControllers)
        },
        e2eInitServicesStop() { 
            console.log("e2eStop")
            return stopServices( initControllers) 
        },
        e2eServicesStart() { 
            console.log("e2eServicesStart")
            return startProcesses("sh", 
            [
              "cypress/servers/mosquitto",
              "cypress/servers/modbus2mqtt " + config.env.modbus2mqttE2eHttpPort,
              "cypress/servers/modbus2mqtt " + config.env.modbus2mqttAddonHttpPort + " localhost:" +
                config.env.nginxAddonHttpPort
            ],[
              config.env.mosquittoAuthMqttPort, 
              config.env.mosquittoNoAuthMqttPort,
              config.env.modbus2mqttAddonHttpPort, 
              config.env.modbus2mqttE2eHttpPort
            ], 
            resetControllers) 
        },
        e2eServicesStop() { 
          console.log("e2eStop")
          return stopServices( resetControllers) 
        },
        e2eServicesStart() { 
          console.log("e2eServicesStart")
          return startProcesses("sh", 
          [
            "cypress/servers/mosquitto",
            "cypress/servers/modbus2mqtt " + config.env.modbus2mqttE2eHttpPort,
            "cypress/servers/modbus2mqtt " + config.env.modbus2mqttAddonHttpPort + " localhost:" +
              config.env.nginxAddonHttpPort
          ],[
            config.env.mosquittoAuthMqttPort, 
            config.env.mosquittoNoAuthMqttPort,
            config.env.modbus2mqttAddonHttpPort, 
            config.env.modbus2mqttE2eHttpPort
          ], 
          resetControllers) 
        },
        testWait() { 
          return new Promise((resolve)=>{
            setTimeout( ()=>{resolve("OK")},30000)
          })
        },
        getTempDir(command) {
          return new Promise((resolve, reject)=>{
            let parts = command.split(":")

              let tmp = tmpdirs.find(t=>t.command.indexOf(command ) >=0 )
              console.log("GetTempDir: " + tmp.command + " " + JSON.stringify(tmpdirs,null, " "))
              if( !tmp  ) 
                reject(new Error("getTempDir: command not found  " + command + " " + tmpdirs.length)) 
              else
                if( tmp.tmpdir )
                  resolve(  tmp.tmpdir )
                else
                  reject( new Error("getTempDir: tmpdir not defined  " + command))
            })
        },
        e2eStop() { 
          
          return new Promise((resolve)=>{
            console.log("e2eStop")
           // initControllers.forEach(stopChildProcess)
            resetControllers.forEach(stopChildProcess)
            resolve('Stopped')
          })
         },
         log( msg){
          console.log(msg)
          return "OK"
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
