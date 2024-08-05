import ModbusRTU from "modbus-serial";
import Debug from "debug";
let baudrate: number = 4800;
const debug = Debug("modbusanalysis");
process.env["DEBUG"] = "modbusanalysis";
Debug.enable("modbusanalysis");
let slave = 1;
let client = new ModbusRTU();
connect();

// open connection to a serial port
function destroy() {
  debug("close");
  client.close(connect);
}
function connect() {
  debug("connect " + baudrate);
  client = new ModbusRTU();
  client
    .connectRTUBuffered("/dev/ttyUSB0", { baudRate: baudrate })
    .then(read)
    .catch((e) => {
      debug("connect " + JSON.stringify(e));
      console.log(e);
      process.exit(0);
    });
}

function read() {
  debug("read: " + Math.floor(slave / 2));
  client.setID(Math.floor(slave++ / 2));
  client.setTimeout(500);
  client
    .readHoldingRegisters(1, 1)
    .then(() => {
      debug("SUCCESS==================");
      destroy();
    })
    .catch((e) => {
      if (e.errno && e.errno == "ETIMEDOUT") {
        debug("timeout");
        if (slave < 512) read();
      } else {
        debug("read failure: " + JSON.stringify(e));
        destroy();
      }
    });
}
