
import { Bus } from '../src/bus';
import { Config } from '../src/config';
import {  Itext, IdentifiedStates, ImodbusEntity, ModbusFunctionCodes, FCOffset, Inumber, Converters, Ientity, Ispecification } from "specification.shared";
import { Modbus, ModbusForTest } from '../src/modbus';
import { IslaveId, ModbusCache } from '../src/modbuscache';
import { getReadRegisterResult, submitGetHoldingRegisterRequest } from '../src/submitRequestMock';
import { yamlDir } from './../testHelpers/configsbase';
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
import { Islave } from 'server.shared';
import { ConfigSpecification } from 'specification';

Config['yamlDir'] = yamlDir;
Config.sslDir = yamlDir;
ConfigSpecification.yamlDir = yamlDir;

beforeAll(() => {
    jest.mock('../src/modbus');
    ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
});
beforeEach(() => {

    spec = {
        "entities": [
            {
                "id": 1, mqttname: "mqtt",
                "converter": { name: "sensor" as Converters, functionCodes: [] }, "modbusAddress": 4, functionCode: ModbusFunctionCodes.readHoldingRegisters, "icon": "", "converterParameters": { "multiplier": 0.1, "offset": 0, "uom": "cm", "identification": { "min": 0, "max": 200 } }
            },
            { id: 2, mqttname: "mqtt2", "converter": { name: "select_sensor" as Converters, functionCodes: [] }, "modbusAddress": 2, functionCode: ModbusFunctionCodes.readHoldingRegisters, "icon": "", "converterParameters": { "optionModbusValues": [1, 2, 3] } },
            { id: 3, mqttname: "mqtt3", "converter": { name: "select" as Converters, functionCodes: [] }, "modbusAddress": 3, functionCode: ModbusFunctionCodes.readWriteHoldingRegisters, "icon": "", "converterParameters": { "optionModbusValues": [0, 1, 2, 3] } }],
        "status": 2, "manufacturer": "unknown", "model": "QDY30A",
        "filename": "waterleveltransmitter",
        i18n: [
            {
                lang: "en", texts: [
                    { textId: "e1o.1", text: "ON" },
                    { textId: "e1o.0", text: "OFF" },
                    { textId: "e1o.2", text: "test" }
                ]
            }
        ],
        files: []
    }
})

let spec: Ispecification
var mr = new Modbus;
var dev: Islave | undefined = undefined;
var ent: ImodbusEntity = {
    id: 1, mqttname: "mqtt",
    modbusAddress: 3,
    functionCode: ModbusFunctionCodes.readHoldingRegisters,
    modbusValue: [1], mqttValue: "", identified: IdentifiedStates.unknown,
    converterParameters: { multiplier: 0.01 },
    converter: { name: "sensor", functionCodes: [] }
};
var ents: Ientity[] = [ent]
var entText: ImodbusEntity = {
    id: 2, mqttname: "mqtt",
    modbusAddress: 5,
    functionCode: ModbusFunctionCodes.readHoldingRegisters,
    modbusValue: [65 << 8 | 66, 67 << 8 | 68], mqttValue: "", identified: IdentifiedStates.unknown,
    converterParameters: { stringlength: 10 },
    converter: { name: "text", functionCodes: [] }
};
var readConfig = new Config();
var prepared: boolean = false;
function prepareIdentification() {
    if (!prepared) {
        prepared = true;
        readConfig = new Config();
        readConfig.readYaml();
        new ConfigSpecification().readYaml();
        dev = Config.getSlave(0, 1)!

    }
}

describe("Modbus read", () => {
    it("Modbus read", done => {
        let readConfig: Config = new Config();
        readConfig.readYaml();
        new ConfigSpecification().readYaml();
        let dev = Config.getSlave(0, 1)!
        expect(dev).toBeDefined;
        Modbus.getModbusSpecification("test", Bus.getBus(0)!, 1, dev!.specificationid!, (_e) => {
            fail('Exception!!!');
            done()
        }).subscribe((spec1) => {
            let spec = ConfigSpecification.getSpecificationByFilename(dev!.specificationid!)!
            expect(spec).toBeDefined();
            expect((spec1?.entities[0] as ImodbusEntity).mqttValue).toBe((spec1?.entities[0] as ImodbusEntity).mqttValue)
            expect(((spec1?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001);
            done();
        });
    });

    it("Modbus read Entity identifiation unknown", done => {
        prepareIdentification();
        expect(dev).toBeDefined;
        spec.entities = ents
        mr.readEntityFromModbus(Bus.getBus(0)!, 1, spec, 1, (_e) => { fail('Exception!!!') }).subscribe((arg0: ImodbusEntity) => {
            expect(arg0!.identified).toBe(IdentifiedStates.unknown);
            done();
        }); // unidenfified
    });
    it("Modbus read Entity identifiation identified", done => {
        prepareIdentification();
        expect(dev).toBeDefined;
        if (ent.converterParameters)
            (ent.converterParameters as Inumber).identification = { min: 0.01, max: 0.4 }
        spec.entities = ents
        mr.readEntityFromModbus(Bus.getBus(0)!, 1, spec, 1, (e) => { throw e }).subscribe((arg0: ImodbusEntity) => {
            expect(arg0!.identified).toBe(IdentifiedStates.identified);
            done();
        }); // unidenfified
        done();
    });
    it("Modbus read Entity identifiation Iselect identified", done => {
        prepareIdentification();
        expect(dev).toBeDefined;
        Config['config'].fakeModbus = false;

        if (ent.converterParameters)
            (ent.converterParameters as Inumber).identification = { min: 0.02, max: 0.04 }
        ent.converter = { name: "select_sensor", functionCodes: [] }
        ent.modbusValue = [1]
        ent.converterParameters = {
            optionModbusValues: [0, 1, 2, 3]
        }
        ent.id = 1;
        spec.entities = [ent]
        mr.readEntityFromModbus(Bus.getBus(0)!, 1, spec, 1, (_e) => { fail('Exception!!!') }).subscribe((arg0: ImodbusEntity) => {
            expect(arg0!.identified).toBe(IdentifiedStates.identified);
            Config['config'].fakeModbus = true;

            done();
        }, err => { console.log(JSON.stringify(err)) }); // unidenfified

    });

    it("Modbus read Entity identifiation string not identified", done => {
        //@ts-ignore
        prepareIdentification();
        Config['config'].fakeModbus = false;
        expect(dev).toBeDefined;
        if (entText.converterParameters)
            (entText.converterParameters as Itext).identification = "test"
        spec.entities = [entText]
        mr.readEntityFromModbus(Bus.getBus(0)!, 2, spec, 2, (_e) => {
            fail('Exception!!!')
        }).subscribe((arg0: ImodbusEntity) => {
            expect(arg0!.identified).toBe(IdentifiedStates.notIdentified);
            done();
        }); // unidenfified
    });

    it("Modbus read Entity identifiation string identified", done => {
        prepareIdentification();
        Config['config'].fakeModbus = false;
        //jest.spyOn(Modbus.prototype, 'readHoldingRegister').mockReturnValue([65 << 8 | 66, 67 << 8 | 68])
        expect(dev).toBeDefined;
        if (entText.converterParameters)
            (entText.converterParameters as Itext).identification = "ABCD"
        dev!.slaveid = 2;
        spec.entities = [entText]
        mr.readEntityFromModbus(Bus.getBus(1)!, 2, spec, 2, (_e) => {
            fail('Exception!!!')
        }).subscribe((arg0: ImodbusEntity) => {
            expect(arg0!.identified).toBe(IdentifiedStates.identified);
            done();
        }); // unidenfified
    });
    // it("Modbus getUsbDevices", done => {
    //     mr.getUsbDevices();
    //     done();
    // });
});
xit("Modbus modbusDataToSpec spec.identified = identified", () => {
    let spec = {
        "version": "0.1",
        "entities": [
            {
                "id": 1, mqttname: "mqtt",
                "converter": { name: "sensor" as Converters, functionCodes: [] }, "modbusAddress": 4, functionCode: ModbusFunctionCodes.readHoldingRegisters, "icon": "", "converterParameters": { "multiplier": 0.1, "offset": 0, "uom": "cm", "identification": { "min": 0, "max": 200 } }
            },
            { id: 2, mqttname: "mqtt2", "converter": { name: "select_sensor" as Converters, functionCodes: [] }, "modbusAddress": 2, functionCode: ModbusFunctionCodes.readHoldingRegisters, "icon": "", "converterParameters": { "options": [{ "key": 1, "name": "cm" }, { "key": 2, "name": "mm" }, { "key": 3, "name": "mPa" }] } },
            { id: 3, mqttname: "mqtt3", "converter": { name: "select_sensor" as Converters, functionCodes: [] }, "modbusAddress": 3, functionCode: ModbusFunctionCodes.readHoldingRegisters, "icon": "", "converterParameters": { "options": [{ "key": 0, "name": "1" }, { "key": 1, "name": "0.1" }, { "key": 2, "name": "0.01" }, { "key": 3, "name": "0.001" }] } }],
        "status": 2, "manufacturer": "unknown", "model": "QDY30A", "documenturl": "/documents/waterleveltransmitter.pdf", "imageurl": "https://m.media-amazon.com/images/I/51WMttnsOML._AC_SX569_.jpg",
        "filename": "waterleveltransmitter",
        i18n: [],
        files: [],
        testdata: []
    }
    //"modbusValue": [210], "mqttValue": 21,
    //        "modbusValue": [1], "mqttValue": "cm", "identified": 1,
    //"modbusValue": [1], "mqttValue": "0.1", "identified": 1,
    let results = new Map<number, ReadRegisterResult>();
    (4 + FCOffset * ModbusFunctionCodes.readHoldingRegisters, getReadRegisterResult(210));
    results.set(2 + FCOffset * ModbusFunctionCodes.readHoldingRegisters, getReadRegisterResult(1));
    results.set(3 + FCOffset * ModbusFunctionCodes.readHoldingRegisters, getReadRegisterResult(1));
    Config.getConfiguration();
    Config['config'].fakeModbus = false;
    let m = new ModbusForTest();
    let result = m.modbusDataToSpecForTest(spec)
    console.debug(JSON.stringify(result));
    expect(result).toBeDefined()
    expect(result!.identified).toBe(IdentifiedStates.identified);
    Config['config'].fakeModbus = true;
});


function writeRegisters(_slaveid: IslaveId, _startaddress: number, _data: ReadRegisterResult, _resultFunction: (result: Map<number, ReadRegisterResult>) => void, _failedFunction: (e: any) => void) {

    console.log("write Registers")
    expect(_data.data[0]).toBe(0)
    _resultFunction(new Map<number, ReadRegisterResult>());
}
it("Modbus writeEntityMqtt", (done) => {
    ModbusCache.prototype.writeRegisters = writeRegisters
    let readConfig: Config = new Config();
    readConfig.readYaml();
    new ConfigSpecification().readYaml();
    let dev = Config.getSlave(0, 1)!
    expect(dev).toBeDefined;

    new Modbus().writeEntityMqtt(Bus.getBus(0)!, 1, spec, 3, "test").catch((e) => {
        expect(`[FAIL] ${e}`.trim()).toBeFalsy();
    }).then(() => {
        done()
    })

})
