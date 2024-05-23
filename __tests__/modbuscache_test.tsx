import { Config } from '../src/config';
import { ModbusCache, exportedForTesting } from '../src/modbuscache';
import ModbusRTU from 'modbus-serial';
const { ModbusStateMachine } = exportedForTesting;
import { yamlDir } from './../testHelpers/configsbase';
import { Mutex } from 'async-mutex';
import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
import { getReadRegisterResult } from '../src/submitRequestMock';
import Debug from "debug"
import { ConfigSpecification, Logger } from 'specification';
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


function submitReadRequest(addresses: Set<number>, resultFunction: (addresses: Set<number>, results: Map<number, ReadRegisterResult>) => void) {
    jest.spyOn(ModbusRTU.prototype, 'isOpen', 'get').mockReturnValue(true);
    new ModbusCache("test").submitGetHoldingRegisterRequest({ busid: 0, slaveid: 1 }
        , addresses, (result) => {
            resultFunction(addresses, result)
        }, () => { })

}
function expectObjectToBe(o: any, cmp: any) {
    expect(JSON.stringify(o)).toBe(JSON.stringify(cmp))
}
function resultFunction0(addresses: Set<number>, results: Map<number, ReadRegisterResult>): void {
    expect(results.get(300004)).toBeDefined();
    debug(results.get(300004))
    debug(getReadRegisterResult(3))
    expect(results.get(300004)!.data[0]).toBe(3);
    submitReadRequest(addresses, resultFunctions[1])
}

function resultFunction1(addresses: Set<number>, results: Map<number, ReadRegisterResult>): void {
    // cached call
    expect(results.get(300004)).toBeDefined();
    expect(results.get(300004)!.data[0]).toBe(3);
    expect(readHoldingRegisters).toHaveBeenCalledTimes(2);
    let na = structuredClone(addresses)
    na.add(300005);
    submitReadRequest(na, resultFunctions[2])
}

function resultFunction0Illegal(addresses: Set<number>, results: Map<number, ReadRegisterResult>): void {
    expect(results.get(300004)).toBeDefined();
    expect(results.get(300004)!.data[0]).toBe(4);
    let na = structuredClone(addresses)
    na.add(300010);
    submitReadRequest(na, resultFunctions[1])

}

let resultFunctions: ((addresses: Set<number>, _results: Map<number, ReadRegisterResult>) => void)[] = []

function executeSubmitGetHoldingRegisterRequests(addresses: Set<number>, readHoldingRegistersMock: jest.Mock<any, any, any>,
    resultF: ((_addresses: Set<number>, results: Map<number, ReadRegisterResult>) => void)[]) {
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
            let addresses = new Set<number>();
            addresses.add(300004);
            let f = (_addresses: Set<number>, results: Map<number, ReadRegisterResult>) => {
                expect(results.get(300005)!.data[0]).toBe(4);
                expect(readHoldingRegisters).toHaveBeenCalledTimes(3);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersNormal, [resultFunction0, resultFunction1, f])
        })
    }, 10 * 1000); // increased timeout for debugging

    test("submitGetHoldingRegisterRequest with Timeout", done => {
        mockMutex.acquire().then(() => {
            let addresses = new Set<number>();
            addresses.add(300004);
            let f = (_addresses: Set<number>, _results: Map<number, ReadRegisterResult>) => {
                expect(readHoldingRegisters).toHaveBeenCalledTimes(4);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersWithTimeout, [resultFunction0, resultFunction1, f])
        })
    })
    test("submitGetHoldingRegisterRequest with Illegal Address", done => {
        mockMutex.acquire().then(() => {

            let addresses = new Set<number>();

            addresses.add(300003);
            addresses.add(300004);
            let f = (_addresses: Set<number>, results: Map<number, ReadRegisterResult>) => {
                expectObjectToBe(results.get(300010), getReadRegisterResult(10));
                expect(readHoldingRegisters).toHaveBeenCalledTimes(12);
                mockMutex.release();
                done();
            }
            executeSubmitGetHoldingRegisterRequests(addresses, readHoldingRegistersWithIllegalAddress, [resultFunction0Illegal, f])
        })
    })

})



test("prepareAddressesAction", () => {
    let addresses = new Set<number>();
    addresses.add(300000);
    addresses.add(300001);
    addresses.add(300002);
    addresses.add(300003);
    let mockedfn = jest.fn();
    let originalFn: any = ModbusStateMachine.prototype.next;
    ModbusStateMachine.prototype.next = mockedfn;
    let sm = new ModbusStateMachine("test", { busid: 0, slaveid: 1 }, addresses, () => { }, () => { })
    sm.prepareAddressesAction();
    expect(sm['preparedAddresses'][0].address).toBe(300000);
    expect(sm['preparedAddresses'][0].length).toBe(4);
    ModbusStateMachine.prototype.next = originalFn;
})

test("writeRegisters", done => {
    new ModbusCache("test").writeRegisters({ busid: 0, slaveid: 1 }, 2100004, { data: [5], buffer: Buffer.from([5]) }, (_results) => {
        done();
    }, () => { });

});

