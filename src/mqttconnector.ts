import { Slave, ImqttClient } from '@modbus2mqtt/server.shared'
import { IClientOptions, IClientPublishOptions, MqttClient, connect } from 'mqtt'
import { format } from 'util'
import { Config } from './config'
import { Logger, LogLevelEnum } from '@modbus2mqtt/specification'
import Debug from 'debug'
import { Ispecification } from '@modbus2mqtt/specification.shared'
import { QoS } from 'mqtt-packet'

const log = new Logger('mqttconnector')
const debugMqttClient = Debug('mqttclient')
const debug = Debug('mqttconnector')

export class MqttConnector {
  private client?: MqttClient
  private subscribedSlaves: Slave[] = []
  private isSubscribed: boolean
  private onMqttMessageListeners: ((topic: string, payload: Buffer) => Promise<void>)[] = []
  private onConnectListener: ((mqttClient: MqttClient) => void)[] = []
  onConnectCallbacks: ((connection: MqttClient) => void)[]
  private static instance: MqttConnector | undefined = undefined
  static getInstance(): MqttConnector {
    if (MqttConnector.instance) return MqttConnector.instance

    MqttConnector.instance = new MqttConnector()

    return MqttConnector.instance
  }

  constructor() {
    this.onConnectCallbacks = []
  }
  addOnMqttMessageListener(onMqttMessage: (topic: string, payload: Buffer) => Promise<void>) {
    this.onMqttMessageListeners.push(onMqttMessage)
  }

  addOnConnectListener(listener: (mqttClient: MqttClient) => void) {
    this.onConnectListener.push(listener)
  }
  private executeActions(mqttClient: MqttClient) {
    let callback = this.onConnectCallbacks.shift()
    while (mqttClient && mqttClient.connected && callback) {
      callback(mqttClient!)
      callback = this.onConnectCallbacks.shift()
    }
  }
  private handleErrors(e: Error) {
    log.log(LogLevelEnum.error, 'MQTT error: ' + e.message)
  }
  private onConnect(mqttClient: MqttClient) {
    debug('reconnecting MQTT')
    this.onConnectListener.forEach((listener) => {
      listener.bind(this)(mqttClient)
    })
    this.executeActions(this.client!)
  }

  validateConnection(connectionData: ImqttClient | undefined, callback: (valid: boolean, message: string) => void) {
    if (connectionData && connectionData.mqttserverurl != undefined) {
      let client = connect(connectionData.mqttserverurl, connectionData as IClientOptions)
      client.on('error', (e) => {
        client!.end(() => {})
        callback(false, e.toString())
      })
      client.on('connect', () => {
        callback(true, 'OK')
        if (client) client.end(() => {})
      })
    } else callback(false, 'no mqttserverlurl passes')
  }

  getMqttClient(onConnectCallback: (connection: MqttClient) => void): void {
    this.onConnectCallbacks.push(onConnectCallback)
    this.connectMqtt(undefined)
  }
  private equalConnectionData(client: MqttClient, clientConfiguration: ImqttClient): boolean {
    return (
      client.options.protocol + '://' + client.options.host + ':' + client.options.port == clientConfiguration.mqttserverurl &&
      client.options.username == clientConfiguration.username &&
      client.options.password == clientConfiguration.password
    )
  }

  private connectMqtt(connectionData: ImqttClient | undefined): void {
    let mqttConnect = Config.getConfiguration().mqttconnect
    if (Config.getConfiguration().mqttusehassio && Config.mqttHassioLoginData) mqttConnect = Config.mqttHassioLoginData
    let conn = () => {
      if (!connectionData) connectionData = mqttConnect
      if (!connectionData) {
        this.handleErrors(new Error('No mqtt connection configured.'))
        return
      }
      if (connectionData.mqttserverurl) {
        let opts = connectionData
        // connect need IClientOptions which has some additional properties in the type
        let iopts = connectionData as IClientOptions
        iopts.log = (...args) => {
          let message = args.shift()
          debugMqttClient(format(message, args))
        }
        iopts.clean = false
        iopts.reconnectPeriod = 1000
        iopts.keepalive = 50000
        iopts.clientId = Config.getConfiguration().mqttbasetopic
        if (iopts.ca == undefined) delete iopts.ca
        if (iopts.key == undefined) delete iopts.key
        if (iopts.cert == undefined) delete iopts.cert

        if (this.client) this.client.reconnect(opts as IClientOptions)
        else this.client = connect(connectionData.mqttserverurl, opts as IClientOptions)
        this.client.removeAllListeners('error')
        this.client.removeAllListeners('message')
        this.client.removeAllListeners('connect')
        this.client.removeAllListeners('connect')
        this.client.on('error', this.handleErrors.bind(this))
        this.onMqttMessageListeners.forEach((listener) => {
          this.client!.on('message', listener)
        })
        this.client.on('connect', this.onConnect.bind(this, this.client))
        this.client.on('reconnect', this.onConnect.bind(this, this.client))
      } else {
        this.handleErrors(new Error('mqtt server url is not defined'))
      }
    }

    if (this.client != undefined) {
      if (this.equalConnectionData(this.client, mqttConnect)) {
        if (!this.client.connected) conn()
        else this.executeActions(this.client)
      } else {
        // reconnect with new connection date
        this.client.end(() => {
          this.client = undefined
          conn()
        })
      }
    } else conn()
  }
}
