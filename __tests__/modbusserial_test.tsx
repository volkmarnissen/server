import ModbusRTU from 'modbus-serial'
import { it } from '@jest/globals'

var client = new ModbusRTU()
it.skip('For hardware test only modbus write', () => {
  // open connection to a serial port
  client.connectRTU('/dev/ttyUSB0', { baudRate: 9600 }, read)
  client.setTimeout(4000)
  client.setID(2)

  function write() {
    client.setID(1)
    // write the values 0, 0xffff to registers starting at address 5
    // on device number 1.
    client
      .writeRegister(1, 1)
      .then(read)
      .catch((err: any) => {
        console.log(err)
      })
  }

  function read() {
    // read the 2 registers starting at address 5
    // on device number 1.
    client
      .readHoldingRegisters(123, 1)
      .then((data) => {
        // console.log('read: ' + data.data)
      })
      .catch((err: any) => {
        console.log(err)
      })
  }
})
