import { Config } from '../src/config';
import { ImodbusAddress, ModbusCache, exportedForTesting } from '../src/modbuscache';
import ModbusRTU from 'modbus-serial';
const { ModbusStateMachine } = exportedForTesting;
import { yamlDir } from './../testHelpers/configsbase';
import { Mutex } from 'async-mutex';
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
import { getReadRegisterResult } from '../src/submitRequestMock';
import Debug from "debug"
import { ConfigSpecification, ImodbusValues, Logger } from 'specification';
import { ModbusRegisterType } from 'specification.shared';
const debug = Debug("modbuscachetest");
let mockMutex = new Mutex()
Config['yamlDir'] = yamlDir;
Config.sslDir = yamlDir;

new Config().readYaml();
new ConfigSpecification().readYaml();
let mockedConnectRTU = jest.fn() as jest.MockedFunction<typeof ModbusRTU.prototype.connectRTU>

let b34 = [0, 3, 0, 4]
let readHoldingRegistersNormal = jest.fn().mockResolvedValueOnce(getReadRegisterResult(3)).mockResolvedValueOnce(getReadRegisterResult(3)).mockResolvedValueOnce({ data: [3, 4], buffer: Buffer.from(b34) });
let readHoldingRegistersWithTimeout = jest.fn().mockResolvedValueOnce(getReadRegisterResult(3)).mockResolvedValueOnce(getReadRegisterResult(3)).mockImplementationOnce(async () => { throw { errno: "ETIMEDOUT" } }).mockResolvedValueOnce({ data: [3, 4], buffer: Buffer.from(b34) });
let readHoldingRegistersWithIllegalAddress =
    jest.fn().mockImplementationOnce(async () => { throw { modbusCode: 2 } })
        .mockImplementationOnce(async () => { throw { modbusCode: 2 } })
        .mockResolvedValueOnce({ data: [4], buffer: Buffer.alloc(2) })
        .mockImplementationOnce(async () => { throw { modbusCode: 2 } })
        .mockImplementationOnce(async () => { throw { modbusCode: 2 } })
        .mockResolvedValueOnce(getReadRegisterResult(4))
        .mockResolvedValueOnce(getReadRegisterResult(5))
        .mockResolvedValueOnce(getReadRegisterResult(6))
        .mockResolvedValueOnce(getReadRegisterResult(7))
        .mockResolvedValueOnce(getReadRegisterResult(8))
        .mockResolvedValueOnce(getReadRegisterResult(9))
        .mockResolvedValueOnce(getReadRegisterResult(10))
        .mockResolvedValueOnce(getReadRegisterResult(11));
let readHoldingRegisters = readHoldingRegistersNormal
let readHoldingRegistersMutex = new Mutex()
let oldLog: any
beforeAll(() => {
    jest.mock('modbus-serial');
    jest.spyOn(console, "warn").mockImplementation(() => { })
    jest.spyOn(console, "log").mockImplementation(() => { })
    mockedConnectRTU.mockImplementation(() => {
        jest.spyOn(ModbusRTU.prototype, 'isOpen', 'get').mockReturnValue(true);
        return Promise.resolve()
    });
    ModbusRTU.prototype.connectRTU = mockedConnectRTU;
    ModbusRTU.prototype.writeRegisters = jest.fn(() => Promise.resolve({ address: 4, length: 1 }));
    ModbusRTU.prototype.close = jest.fn().mockImplementation((cb) => {
        jest.spyOn(ModbusRTU.prototype, 'isOpen', 'get').mockReturnValue(false);
        cb()
    });
    ModbusRTU.prototype.open = jest.fn().mockImplementation((cb) => { cb() });

});


function submitReadRequest(addresses: Set<ImodbusAddress>, resultFunction: (addresses: Set<ImodbusAddress>, results: ImodbusValues) => void) {
    jest.spyOn(ModbusRTU.prototype, 'isOpen', 'get').mockReturnValue(true);
    new ModbusCache("test").submitGetHoldingRegisterRequest({ busid: 0, slaveid: 1 }
        , addresses, (result) => {
            resultFunction(addresses, result)
        }, () => { })

}
function expectObjectToBe(o: any, cmp: any) {
    expect(JSON.stringify(o)).toBe(JSON.stringify(cmp))
}
function resultFunction0(addresses: Set<ImodbusAddress>, results: ImodbusValues): void {
    expect(results.holdingRegisters.get(4)).toBeDefined();
    debug(results.holdingRegisters.get(4))
    debug(getReadRegisterResult(3))
    expect(results.holdingRegisters.get(4)!.data[0]).toBe(3);
    submitReadRequest(addresses, resultFunctions[1])
}

function resultFunction1(addresses: Set<ImodbusAddress>, results: ImodbusValues): void {
    // cached call
    expect(results.holdingRegisters.get(4)).toBeDefined();
    expect(results.holdingRegisters.get(4)!.data[0]).toBe(3);
    expect(readHoldingRegisters).toHaveBeenCalledTimes(2);
    let na = structuredClone(addresses)
    na.add({address:5,registerType:ModbusRegisterType.HoldingRegister});
    submitReadRequest(na, resultFunctions[2])
}

function resultFunction0Illegal(addresses: Set<ImodbusAddress>, results: ImodbusValues): void {
    expect(results.holdingRegisters.get(4)).toBeDefined();
    expect(results.holdingRegisters.get(4)!.data[0]).toBe(4);
    let na = structuredClone(addresses)
    na.add({address:10, registerType: ModbusRegisterType.HoldingRegister});
    submitReadRequest(na, resultFunctions[1])

}

let resultFunctions: ((addresses: Set<ImodbusAddress>, _results: ImodbusValues) => void)[] = []

function executeSubmitGetHoldingRegisterRequests(addresses: Set<ImodbusAddress>, readHoldingRegistersMock: jest.Mock<any, any, any>,
    resultF: ((_addresses: Set<ImodbusAddress>, results: ImodbusValues) => void)[]) {
    readHoldingRegistersMutex.runExclusive(() => {
        readHoldingRegisters = readHoldingRegistersMock
        resultFunctions = resultF
        ModbusRTU.prototype.readHoldingRegisters = readHoldingRegisters;
        submitReadRequest(addresses, resultFunctions[0]);

    }) // Mutex

}

// 2 calls for same addresses: second call doesn't readHoldingRegisters from modbus
// Add an address: calls readHoldingRegisters for new registers
describe("submitGetHoldingRegisterRequests", () => {
    beforeAll(() => {
        oldLog = Logger.prototype.log
        Logger.prototype.log = jest.fn()
    })
    afterAll(() => {
        Logger.prototype.log = oldLog
    })

    test("submitGetHoldingRegisterRequest", done => {
        mockMutex.acquire().then(() => {
            let addresses = new Set<ImodbusAddress>();
            addresses.add({address:4, registerType: ModbusRegisterType.HoldingRegister});
            let f = (_addresses: Set<ImodbusAddress>, results: ImodbusValues) => {
                expect(results.holdingRegisters.get(5)!.data[0]).toBe(4);
                expect(readHoldingRegisters).toHaveBeenCalledTimes(3);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersNormal, [resultFunction0, resultFunction1, f])
        })
    }, 10 * 1000); // increased timeout for debugging

    test("submitGetHoldingRegisterRequest with Timeout", done => {
        mockMutex.acquire().then(() => {
            let addresses = new Set<ImodbusAddress>();
            addresses.add({address:4, registerType: ModbusRegisterType.HoldingRegister});
            let f = (_addresses: Set<ImodbusAddress>, _results: ImodbusValues) => {
                expect(readHoldingRegisters).toHaveBeenCalledTimes(4);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersWithTimeout, [resultFunction0, resultFunction1, f])
        })
    })
    test("submitGetHoldingRegisterRequest with Illegal Address", done => {
        mockMutex.acquire().then(() => {

            let addresses = new Set<ImodbusAddress>();

            addresses.add({address:3, registerType: ModbusRegisterType.HoldingRegister});
            addresses.add({address:4, registerType: ModbusRegisterType.HoldingRegister});
            let f = (_addresses: Set<ImodbusAddress>, results: ImodbusValues) => {
                expectObjectToBe(results.holdingRegisters.get(10), getReadRegisterResult(10));
                expect(readHoldingRegisters).toHaveBeenCalledTimes(12);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersWithIllegalAddress, [resultFunction0Illegal, f])
        })
    })

})



test("prepareAddressesAction", () => {
    let addresses = new Set<ImodbusAddress>();
    addresses.add({address:0, registerType: ModbusRegisterType.HoldingRegister});
    addresses.add({address:1, registerType: ModbusRegisterType.HoldingRegister});
    addresses.add({address:2, registerType: ModbusRegisterType.HoldingRegister});
    addresses.add({address:3, registerType: ModbusRegisterType.HoldingRegister});
    let mockedfn = jest.fn();
    let originalFn: any = ModbusStateMachine.prototype.next;
    ModbusStateMachine.prototype.next = mockedfn;
    let sm = new ModbusStateMachine("test", { busid: 0, slaveid: 1 }, addresses, () => { }, () => { })
    sm.prepareAddressesAction();
    expect(sm['preparedAddresses'][0].address).toBe(0);
    expect(sm['preparedAddresses'][0].length).toBe(4);
    ModbusStateMachine.prototype.next = originalFn;
})

test("writeRegisters", done => {
    new ModbusCache("test").writeRegisters({ busid: 0, slaveid: 1 }, 4,ModbusRegisterType.HoldingRegister, { data: [5], buffer: Buffer.from([5]) }, (_results) => {
        done();
    }, () => { });

});

