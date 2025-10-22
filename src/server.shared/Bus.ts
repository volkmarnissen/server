import { IBus, IRTUConnection, ITCPConnection } from './types'

export function getBusName(bus: IBus): string {
  let serialport = (bus.connectionData as IRTUConnection).serialport
  if (serialport) return serialport
  let tcpname = (bus.connectionData as ITCPConnection).host + ':' + (bus.connectionData as ITCPConnection).port
  return tcpname
}
