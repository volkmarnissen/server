import ModbusRTU from 'modbus-serial'
import Debug from 'debug'
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import { Command } from 'commander'

const debug = Debug('modbusreopen')
let baudrate = 9600
let cli = new Command()
cli.usage('[--baudrate <baudrate>]')
cli.option('-b, --baudrate <baudrate>', 'set baud rate^')
cli.parse(process.argv)
let options = cli.opts()
if (options['baudrate']) baudrate = parseInt(options['baudrate'])
Debug.enable('modbusreopen')
const client = new ModbusRTU()
console.log('exit')
let b = Buffer.allocUnsafe(4)
b.writeFloatLE(227.8)
debug('writeFloatLE ' + JSON.stringify(b))
b.writeFloatBE(227.8)
debug('writeFloatBE ' + JSON.stringify(b))
b.writeUInt8(67, 0)
b.writeUInt8(201, 1)
b.writeUInt8(67, 2)
b.writeUInt8(101, 3)
debug('Register from Device ' + JSON.stringify(b) + ' readFloatBE ' + b.readFloatBE() + ' readFloatLE ' + b.readFloatLE())
b.writeUInt8(67, 0)
b.writeUInt8(201, 3)
b.writeUInt8(67, 1)
b.writeUInt8(101, 2)
debug('Register from Device ' + JSON.stringify(b) + ' readFloatBE ' + b.readFloatBE() + ' readFloatLE ' + b.readFloatLE())
let count = 0
let slaveid = 0
connect()
function open() {
  debug('closed ' + (client.isOpen ? 'is open' : 'is closed'))
  if (count++ < 4) {
    debug('open ' + count + ' baudrate ' + baudrate)

    client
      .connectRTUBuffered('/dev/ttyUSB0', { baudRate: baudrate })
      .then(read)
      .catch((e) => {
        debug('Error connected' + e)
      })
  } else {
    debug('exit()')
    process.exit()
  }
}
function read() {
  debug('reading ' + (client.isOpen ? 'is open' : 'is closed'))
  client.setTimeout(100)
  if (slaveid++ < 18) {
    client.setID(slaveid)
    client
      .readDiscreteInputs(1, 2)
      .then((_data) => {
        debug('success slave ' + slaveid)
        return read()
      })
      .catch((e) => {
        debug('read failed slave ' + slaveid + ' ' + JSON.stringify(e))
        read()
      })
  } else {
    client.setID(2)
    client
      .readHoldingRegisters(1, 1)
      .then(close)
      .catch((e) => {
        debug('read failed slave 2: ' + JSON.stringify(e))
      })
  }
}

// open connection to a serial port
function close(result?: ReadRegisterResult) {
  if (result) debug(JSON.stringify(result))
  debug('will close ' + (client.isOpen ? 'is open' : 'is closed'))

  if (client.isOpen) {
    debug('call close')
    client.close(open)
  } else {
    debug('read again')
    open()
    //setTimeout(open, 10)
  }
}
function connect() {
  client
    .connectRTUBuffered('/dev/ttyUSB0', { baudRate: baudrate })
    .then(read)
    .catch((e) => {
      debug('Error connected')
      console.log(e)
    })
}
