import { expect ,it, xtest,test,jest ,describe, beforeAll} from '@jest/globals';
import { HttpServer as HttpServer } from '../src/httpserver'
import { ImodbusEntity, ModbusRegisterType,  IimageAndDocumentUrl, IdentifiedStates, Iconverter, HttpErrorsEnum,  FileLocation } from '@modbus2mqtt/specification.shared';
import { Config } from '../src/config';
import * as request from "supertest";
import * as fs from 'fs';
import { ImodbusSpecification, SpecificationFileUsage, getSpecificationI18nName } from '@modbus2mqtt/specification.shared';
import { ModbusCache } from '../src/modbuscache';
import { submitGetHoldingRegisterRequest } from '../src/submitRequestMock';
import { Bus } from '../src/bus';
import { VERSION } from 'ts-node';
import * as http from 'http'
import { apiUri, IBus, IRTUConnection, IModbusConnection, IidentificationSpecification } from '@modbus2mqtt/server.shared';
import { IfileSpecification } from '@modbus2mqtt/specification';
import { ConfigSpecification } from '@modbus2mqtt/specification';
import { Mutex } from 'async-mutex';
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
import { join } from 'path';

const yamlDir = "__tests__/yaml-dir";
ConfigSpecification.yamlDir= yamlDir;
new ConfigSpecification().readYaml();
Config.sslDir = yamlDir;
let mWaterlevel = new Mutex()
let spec: ImodbusSpecification = {
    filename: "waterleveltransmitter",
    status: 2,
    entities: [{
        id: 1,
        mqttname: "waterleveltransmitter",
        converter: { name: "number", registerTypes: [] },
        modbusAddress: 3,
        registerType:  ModbusRegisterType.HoldingRegister,
        readonly: true,
        converterParameters: { multiplier: 0.01 },
        mqttValue: "",
        modbusValue: [],
        identified: IdentifiedStates.unknown
    }],
    i18n: [{
        lang: "en", texts: [
            { textId: "name", text: "Water Level Transmitter" },
            { textId: "e1", text: "Water Level Transmitter" },
        ]
    }],
    files: [],
    identified: IdentifiedStates.unknown
};
var httpServer: HttpServer;

let spec2: IfileSpecification = { ...spec, version: VERSION, testdata:{} }
spec2.entities.push({
    id: 2,
    mqttname: "",
    converter: { name: "number", registerTypes: [] },
    modbusAddress: 4,
    registerType: ModbusRegisterType.HoldingRegister,
    readonly: true,
    converterParameters: { multiplier: 0.01 },
    variableConfiguration: {
        targetParameter: 2,
        entityId: 1
    }
})
function mockedAuthorization(_param: any): Promise<any> {

    return new Promise<any>((resolve) => {
        resolve({ justForTesting: true })
    })
}
function mockedHttp(_options: any, cb: (res: any) => any) {
    cb({ statusCode: 200 });
}
const oldAuthenticate: (req: any, res: any, next: () => void) => void = HttpServer.prototype.authenticate
beforeAll(() => {
    Config['yamlDir'] = yamlDir;
    new Config().readYaml();
    (Config as any)['fakeModbusCache'] = true;
    jest.mock('../src/modbus');
    ModbusCache.prototype.submitGetHoldingRegisterRequest = submitGetHoldingRegisterRequest
    HttpServer.prototype.authenticate = (req, res, next) => {
        next()
    };
    httpServer = new HttpServer(join(yamlDir, "angular"));
    httpServer.init();
    httpServer.setModbusCacheAvailable();
});

it("GET /devices", done => {
    request(httpServer.app).
        get('/api/slaves?busid=0').
        expect(200).
        then(response => {
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty("slaveid");
            done();
        });
});
it("GET /specsForSlave", done => {
    request(httpServer.app).
        get(apiUri.specsForSlaveId + '?busid=0&slaveid=1').
        expect(200).
        then(response => {
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body.find((specs: IidentificationSpecification) => specs.filename == "waterleveltransmitter")).not.toBeNull();
            done();
        });
});
it("GET angular files", done => {
    request(httpServer.app).
        get("/en-US/test.css").
        expect(200).
        then(response => {
            expect(response.text).toBe("Just content");
            expect( response.type).toBe("text/css")
            done();
        });
});
it("GET local files", done => {
    request(httpServer.app).
        get("/specifications/files/waterleveltransmitter/files.yaml").
        expect(200).
        then(response => {
            expect(response.text.startsWith("- url:")).toBeTruthy();
            expect( response.type).toBe("application/x-yaml")
            done();
        });
});


it("register,login validate", done => {
    var token = ""
    request(httpServer.app).
        get('/user/reqister?name=test&password=test123').then(_response => {

        }).catch(_err => {
            expect(false).toBeTruthy()
        })
    request(httpServer.app).get('/user/login?name=test&password=test123').
        expect(200).
        then(response => {
            token = response.body.token;
            let hdrs: Headers = new Map<string, string>() as any
            hdrs.set("Authorization", "Bearer " + token)
            expect(response.body.token.length).toBeGreaterThan(0);
            let req: any = {
                url: "/noauthorization needed"
            }
            let res: any = {}
            oldAuthenticate.bind(httpServer)(req, res, () => {
                req.url = "/api/Needs authorization"
                req['header'] = (key: string): string => {
                    expect(key).toBe("Authorization")
                    return "Bearer " + token
                }
                oldAuthenticate.bind(httpServer)(req, undefined, () => {
                    done()
                })
            });
        })
});

it("supervisor login", (done) => {
    // This enables hassio validation
    let res: any = {}
    let req: any = {
        url: "/api/Needs authorization",
        header: () => { return undefined }
    }
    let cfg = new Config()
    cfg.readYaml();
    process.env.HASSIO_TOKEN = "test"
    let originalReadGetResponse = Config.prototype.readGetResponse;
    Config.prototype.readGetResponse = mockedAuthorization

    let originalHttpRequest = http.request
    Object.defineProperty(http, "request", {
        value: mockedHttp,
        configurable: true,
        writable: true
    });
    oldAuthenticate.bind(httpServer)(req, res, () => {
        Config.prototype.readGetResponse = originalReadGetResponse
        Object.defineProperty(http, "request", {
            value: originalHttpRequest,
            configurable: true,
            writable: true
        });
        // We just expect next to be called
        done()
    })
})

it("GET /" + apiUri.specifications, done => {
    request(httpServer.app).
        get(apiUri.specifications).
        expect(200).
        then(response => {
            console.log(JSON.stringify(response.body));
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty("filename");
            done();
        }).catch((e) => {
            throw new Error('Exception caught ' + e)
        })
});

test("GET /converters", done => {
    request(httpServer.app).
        get('/api/converters').
        expect(200).
        then(response => {
            let sensorExist = false;
            response.body.forEach((element: Iconverter) => {
                if (element.name == "number") {
                    expect(element.registerTypes).toBeDefined()
                    expect(element.registerTypes.length).toBe(2)
                    sensorExist = true
                }
            });
            expect(sensorExist).toBeTruthy()
            done();
        }).catch((e) => {
            throw new Error('Exception caught ' + e)
        });
});

test("GET /modbus/specification", done => {
    request(httpServer.app).
        get('/api/modbus/specification?busid=0&slaveid=1&spec=waterleveltransmitter').
        expect(HttpErrorsEnum.OK).
        then(response => {
            let spec: ImodbusSpecification = response.body;
            expect(((spec?.entities[0] as ImodbusEntity).mqttValue as number) - 21).toBeLessThan(0.001);
            done();
        })
});

test("GET /busses", done => {
    request(httpServer.app).
        get('/api/busses').
        expect(200).
        then(response => {
            let busses: IBus[] = response.body;
            expect(busses.length).toBeGreaterThan(0);
            expect((busses[0].connectionData as IRTUConnection).baudrate).toBeGreaterThan(0);
            done();
        }).catch((e) => {
            throw new Error('Exception caught ' + e)
        })
});

xtest("ADD/DELETE /busses", done => {
    let newConn: IModbusConnection = { baudrate: 9600, serialport: "/dev/ttyACM1", timeout: 200 };
    Bus.readBussesFromConfig()
    let oldLength = Bus.getBusses().length;

    request(httpServer.app).
        post('/api/bus').
        accept("application/json").
        send(newConn).
        set('Content-Type', 'application/json').
        expect(201).
        then(response => {
            expect(Bus.getBusses().length).toBe(oldLength + 1);
            let newNumber = response.body;
            request(httpServer.app).
                delete('/api/bus?busid=' + newNumber.busid).
                then(_response => {
                    expect(200);
                    expect(Bus.getBusses().length).toBe(oldLength);
                    done();
                });
        })
});

xtest("POST /mqtt/validate", done => {
    let oldConfig = Config.getConfiguration()
    let config = Config.getConfiguration()
    config.mqttconnect.mqttserverurl = "mqtt://doesnt_exist:1007";
    new Config().writeConfiguration(config);
    request(httpServer.app).
        post('/api/validate/mqtt').
        send(config).
        expect(200).
        then(response => {
            expect(response.body.valid).toBeFalsy();
            expect(response.body.message.toString().length).toBeGreaterThan(0);
            new Config().writeConfiguration(oldConfig);
            done();
        }).catch((e) => {
            done()
            console.error('Exception caught ' + e.toString())

        })

})

describe("http POST", () => {


    test("POST /specification: add new Specification rename device.specification", done => {
        mWaterlevel.runExclusive(()=>{
               jest.mock('../src/mqttdiscover');

        let spec1: ImodbusSpecification = Object.assign(spec);
        let lspec = yamlDir + '/local/specifications/'
        fs.copyFileSync(lspec + 'waterleveltransmitter.yaml', lspec + 'waterleveltransmitter.bck', undefined)
      
        let filename = yamlDir + "/local/specifications/waterleveltransmitter.yaml";
        fs.unlinkSync(new ConfigSpecification().getSpecificationPath(spec1));
        let url =  apiUri.specfication +'?busid=0&slaveid=2&originalFilename=waterleveltransmitter'

        //@ts-ignore
        request(httpServer.app).post(url).
        accept("application/json").
            send(spec1)
            .expect(HttpErrorsEnum.ErrBadRequest)
            .catch(e=>{
                console.log(e)
            })
            .then((response) => {
                expect((response as any as Response).status).toBe(HttpErrorsEnum.ErrBadRequest)
                let testdata ={
                    holdingRegisters: new Map<number, ReadRegisterResult|null>(),
                    analogInputs: new Map<number, ReadRegisterResult|null>(),
                    coils: new Map<number, ReadRegisterResult|null>()
                }
                testdata.holdingRegisters.set(100, null)
                Bus.getBus(0)!['setModbusAddressesForSlave'](2,testdata)
                request(httpServer.app).post(url).
                accept("application/json").
                send(spec1).
                expect(HttpErrorsEnum.OkCreated).
                then((response) => {
                   var found = ConfigSpecification.getSpecificationByFilename(spec1.filename)!;
                    let newFilename = new ConfigSpecification().getSpecificationPath(response.body);
                    let foundData = found.testdata.holdingRegisters?.find(data=>data.address == 100 && data.value == null)
                    expect(foundData).toBeDefined()
                    expect(fs.existsSync(newFilename)).toBeTruthy();
                    expect(getSpecificationI18nName(found!, "en")).toBe("Water Level Transmitter")
                    expect(response);
                    done();
                }).catch((_e) => {
                    console.log(_e)
                }); 
                console.log("in then")
            })
            .finally(()=>{
                    fs.copyFileSync(lspec + 'waterleveltransmitter.bck', filename);
                    fs.unlinkSync(lspec + 'waterleveltransmitter.bck')      
        
             })
        })
       
     
    })
    test("POST /modbus/entity: update ModbusCache data", done => {

        //@ts-ignore
        request(httpServer.app).post('/api/modbus/entity?busid=0&slaveid=1&entityid=1').

            send(spec2).
            accept("application/json").
            expect(201).
            then((response) => {
                let entityAndMessages = (response.body as ImodbusEntity);
                expect(entityAndMessages.modbusValue[0]).toBe(1);
                expect(parseFloat(entityAndMessages.mqttValue as string)).toBe(0.01);

                expect(response);
                done();
            }).catch((e) => {
                throw new Error('Exception caught ' + e)
            });
    });

    test("POST /modbus/bus: update bus", done => {
        let conn = structuredClone(Bus.getBus(0)!.properties.connectionData)
        conn.timeout = 500
        Config.updateBusProperties(Bus.getBus(0)!.properties!, conn)
        //@ts-ignore
        request(httpServer.app).post('/api/bus?busid=0').
            send(conn).
            expect(201).
            then((_response) => {
                expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(500)
                conn.timeout = 100
                Config.updateBusProperties(Bus.getBus(0)!.properties!, conn)
                expect(Bus.getBus(0)!.properties.connectionData.timeout).toBe(100)
                done();
            }).catch((e) => {
                throw new Error('Exception caught ' + e)
            });
    });

    test("POST /upload: upload files, delete uploaded file, add url, delete url", done => {
        mWaterlevel.runExclusive(()=>{
       
        let testdir = yamlDir + '/local/specifications/files/waterleveltransmitter/';
        let test = 'test.pdf'
        let test1 = 'test2.jpg'
        if (fs.existsSync(testdir + test))
            fs.unlinkSync(testdir + test)
        if (fs.existsSync(testdir + test1))
            fs.unlinkSync(testdir + test1)
        let lspec = yamlDir + '/local/specifications/'
        if( !fs.existsSync(lspec + 'waterleveltransmitter.bck'))
            fs.copyFileSync(lspec + 'waterleveltransmitter.yaml', lspec + 'waterleveltransmitter.bck', undefined)
        else
            if( !fs.existsSync(lspec + 'waterleveltransmitter.yaml'))
                fs.copyFileSync(lspec + 'waterleveltransmitter.bck', lspec + 'waterleveltransmitter.yaml', undefined)
            request(httpServer.app).post('/api/upload?specification=waterleveltransmitter&usage=doc').
            attach('documents', Buffer.from('whatever'), { filename: test }).
            attach('documents', Buffer.from('whatever2'), { filename: test1 }).
            then((_response) => {
                let d = (_response.body as IimageAndDocumentUrl[]);
                expect(d.find(ul => ul.url.endsWith("waterleveltransmitter" + '/' + test) && ul.usage === SpecificationFileUsage.documentation)).toBeTruthy();
                expect(d.find(ul => ul.url.endsWith("waterleveltransmitter" + '/' + test1) && ul.usage === SpecificationFileUsage.documentation)).toBeTruthy()
                expect(fs.existsSync(testdir + test)).toBeTruthy();
                expect(fs.existsSync(testdir + test1)).toBeTruthy();
                fs.unlinkSync(testdir + test1)
                fs.copyFileSync(lspec + 'waterleveltransmitter.bck', lspec + 'waterleveltransmitter.yaml', undefined)
                fs.unlinkSync(lspec + 'waterleveltransmitter.bck')
                request(httpServer.app).delete('/api/upload?specification=waterleveltransmitter&url=/files/waterleveltransmitter/' + test + '&usage=' + SpecificationFileUsage.documentation).then(() => {
                    expect(fs.existsSync(testdir + test)).toBeFalsy()
                    if (fs.existsSync(testdir + test1))
                        fs.unlinkSync(testdir + test1)
                    let i = { url: "http://www.spiegel.de", fileLocation: FileLocation.Global, usage: SpecificationFileUsage.documentation }
                    request(httpServer.app).post('/api/addFilesUrl?specification=waterleveltransmitter')
                        .set('Content-Type', 'application/json; charset=utf-8')
                        .send(i)
                        .expect(201).
                        then((_response) => {
                            expect(_response.body.length).toBe(4)
                            request(httpServer.app).delete('/api/upload?specification=waterleveltransmitter&url=http://www.spiegel.de&usage=' + SpecificationFileUsage.documentation)
                                .expect(200)
                                .then((_response) => {
                                    expect(_response.body.length).toBe(3)
                                    request(httpServer.app).delete('/api/upload?specification=waterleveltransmitter&url=' + _response.body[1].url + "&usage=' + SpecificationFileUsage.documentation)")
                                        .expect(200)
                                        .then((_response) => {
                                            expect(_response.body.length).toBe(2)
                                            done();
                                        })

                                })
                        })

                })
            }).catch((e) => {
                throw new Error('Exception caught ' + e)
            });
    });

    })
});
