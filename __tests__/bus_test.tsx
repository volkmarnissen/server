import Debug from "debug"
import { expect } from '@jest/globals';
import { Config } from '../src/config';
import { Bus } from '../src/bus';
import { yamlDir } from "./../testHelpers/configsbase";
import { ModbusServer, XYslaveid } from './../src/modbusTCPserver';
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";
import { IdentifiedStates } from "specification.shared";
import { ConfigSpecification } from "specification";

const debug = Debug("bustest");
Debug.enable('bustest modbusserver')
const testPort = 8888
Config['yamlDir'] = yamlDir;
ConfigSpecification.yamlDir= yamlDir;
Config.sslDir = yamlDir;

beforeAll(() => {
   Config['yamlDir'] = yamlDir;
   new Config().readYaml();
   new ConfigSpecification().readYaml();
});

it('read slaves/delete slave/addSlave/read slave', () => {
   let bus = Bus.getBus(0)
   expect(bus).toBeDefined();
   if (bus) {
      bus.deleteSlave(10)
      let slaves = bus.getSlaves()
      let oldLength = slaves.length;
      expect(bus.getSlaves().find(s => s.slaveid == 10)).not.toBeDefined()
      bus.writeSlave(10, undefined, undefined, undefined)
      slaves = bus.getSlaves()
      expect(slaves.length).toBeGreaterThan(oldLength)
      let b2 = Bus.getBus(0)
      if (b2)
         debug(b2?.properties.slaves.length.toString())
      bus.deleteSlave(10)
      b2 = Bus.getBus(0)
      if (b2)
         debug(b2?.properties.slaves.length)
      expect(slaves.length).toEqual(oldLength)
   }


});
// it('getAvailableModusData with empty busses array', (done) => {
//    Config['yamlDir'] = "emptyYaml";

//    new Config().readYaml();

//    Bus.getAllAvailableModusData().subscribe(() => {

//       done();
//    })
// })

function testRead(address: number, address2: number, value1: number, value2: number, fc: (slaveid: number, address: number, length: any) => Promise<ReadRegisterResult>): Promise<void> {
   return new Promise<void>((resolve) => {
      let tcpServer = new ModbusServer()
      let bus = Bus.getBus(1)
      if (bus) {
         tcpServer.startServer((bus.properties.connectionData as any)['port']).then(() => {
            debug("Connected to TCP server")
            bus!.connectRTU("test").then(() => {
               fc.bind(bus)(XYslaveid, address, 2).then((value) => {
                  expect(value.data[0]).toBe(value1)
                  expect(value.data[1]).toBe(value2)
                  fc.bind(bus)(XYslaveid, address2, 2).then((_value) => {
                     fail("Exception expected")
                  }).catch((e) => {
                     expect(e.modbusCode).toBe(2)
                     bus!.closeRTU("test", () => { tcpServer.stopServer(resolve) })
                  })
               }).catch((e) => {
                  console.error(e)
                  bus!.closeRTU("test", () => { tcpServer.stopServer(resolve) })
               })
            })
         })
      }
   })
}
function testWrite(address: number, address2: number, value: number, fc: (slaveid: number, address: number, length: any) => Promise<void>): Promise<void> {
   return new Promise<void>((resolve) => {
      let tcpServer = new ModbusServer()
      let bus = Bus.getBus(1)
      if (bus) {
         tcpServer.startServer((bus.properties.connectionData as any)['port']).then(() => {
            let bus = Bus.getBus(1)
            if (bus)
               bus.connectRTU("test").then(() => {

                  fc.bind(bus)(XYslaveid, address, { data: [value], buffer: [0] }).then(() => {
                     fc.bind(bus)(XYslaveid, address2, { data: [value], buffer: [0] }).then(() => {
                        fail("Exception expected")
                     }).catch((e) => {
                        expect(e.modbusCode).toBe(2)
                        bus!.closeRTU("test", () => { tcpServer.stopServer(resolve) })
                     })
                  }).catch((e) => {
                     console.error(e)
                     bus!.closeRTU("test", () => { tcpServer.stopServer(resolve) })
                  })
               })
         })
      }
   })
}
it("Bus getSpecsForDevice", (done) => {
   prepareIdentification();
   Config['config'].fakeModbus = true;
   if (Config.getConfiguration().fakeModbus)
      console.log("Fakemodbus")
   Bus.getBus(0)!.getAvailableSpecs(1).then((ispec) => {
      let wlt = false;
      let other = false;
      expect(ispec).toBeDefined();

      ispec.forEach((spec) => {
         if (spec!.filename === "waterleveltransmitter") {
            wlt = true
            expect(spec!.identified == IdentifiedStates.identified)
         }
         else {
            other = true
            expect(spec!.identified == IdentifiedStates.notIdentified)
         }

      })
      expect(other).toBeTruthy();
      expect(wlt).toBeTruthy();
      done();
   });
})
var readConfig = new Config();
var prepared: boolean = false;
function prepareIdentification() {
   if (!prepared) {
      prepared = true;
      new ConfigSpecification().readYaml();
      readConfig = new Config();
      readConfig.readYaml();
   }
}
it("Modbus getSpecsForDevice with specific slaveId no results 0-3", (done) => {
   prepareIdentification();
   Config['config'].fakeModbus = true;
   if (Config.getConfiguration().fakeModbus)
      console.log("Fakemodbus")
   Bus.getBus(0)!.getAvailableSpecs(1).then((ispec) => {
      expect(ispec).toBeDefined();
      expect(ispec.length).toBeGreaterThan(0);
      done();
      Config['config'].fakeModbus = true;
   })
})
describe("ServerTCP based", () => {
   it("read Discrete Inputs success, Illegal Address", (done) => {
      testRead(1, 4, 1, 1, Bus.prototype.readDiscreteInputs).then(done)


   })
   it("read HoldingRegisters success, Illegal Address", (done) => {
      testRead(0x0101, 0x0109, 1, 1, Bus.prototype.readHoldingRegisters).then(() => {
         debug("done")
         done()
      })
   })
   it("read readInputRegisters success, Illegal Address", (done) => {
      testRead(1, 2, 195, 500, Bus.prototype.readInputRegisters).then(done)
   })
   it("writeHoldingRegisters success, Illegal Address", (done) => {
      testWrite(1, 2, 10, Bus.prototype.writeHoldingRegisters).then(done)
   })
   it("writeCoils success, Illegal Address", (done) => {
      testWrite(1, 4, 0, Bus.prototype.writeCoils).then(done)
   })

})
