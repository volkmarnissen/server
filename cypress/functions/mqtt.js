"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = require('mqtt')
let instance = undefined;
exports.MqttHelper = void 0;
function getInstance(){

    if(instance == undefined)
        instance = new MqttHelper()
    return instance;
}
class MqttHelper{
    client;
    tAndP=[];

    static getInstance(){

        if(MqttHelper.instance == undefined)
            MqttHelper.instance = new MqttHelper()
        return MqttHelper.instance;
    }
    onMessage(topic, payload){
        this.tAndP.push({topic: topic, payload: payload})
    }

    connect(connectionData){
        return new Promise((resolve,reject)=>{
            this.client = mqtt.connect(connectionData.mqttserverurl, connectionData )
            this.client.on('error', reject)
            this.client.on('message', this.onMessage)
            this.client.on('connect', () => {
              resolve()
            })
        })
    }
    publish( topic, payload ){
        this.client.publish(topic, payload, {qos: 1 })
    }
    subscribe( topic){
        this.client.subscribe(topic, {qos: 1 })
    }
    getTopicAndPayloads(){
        return new Promise((resolve)=>{
            resolve( this.tAndP )
        })
    }
    resetTopicAndPayloads(){
        this.tAndP = []
    }
}
exports.getInstance = getInstance
exports.MqttHelper = MqttHelper;
