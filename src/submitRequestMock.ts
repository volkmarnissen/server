import { ReadRegisterResult } from 'modbus-serial/ModbusRTU';
import { FCOffset } from 'specification.shared';
import { IslaveId } from './modbuscache';

export function getReadRegisterResult(n: number): ReadRegisterResult {
    let one: ReadRegisterResult = {
        data: [n],
        buffer: Buffer.allocUnsafe(2)
    }
    one.buffer.writeInt16BE(n)
    return one
}

export function submitGetHoldingRegisterRequest(_slaveid: IslaveId, addresses: Set<number>, resultFunction: (results: Map<number, ReadRegisterResult>) => void, _failedFunction: (e: any) => void): void {
    let rc = new Map<number, ReadRegisterResult>();
    if (_slaveid.slaveid > 10) {
        _failedFunction(new Error("terminate more slaveid "))
        return;
    }
    if (_slaveid.slaveid == 1)
        addresses.forEach(addr => {
            let a = addr % FCOffset
            switch (a) {
                case 0: rc.set(addr, getReadRegisterResult(1)); break;
                case 1: rc.set(addr, getReadRegisterResult(1)); break;
                case 2: rc.set(addr, getReadRegisterResult(1)); break;
                case 3: rc.set(addr, getReadRegisterResult(1)); break;
                case 4: rc.set(addr, getReadRegisterResult(210)); break;
                default: rc.set(addr, getReadRegisterResult(0));
            }
        })
    else
        addresses.forEach(addr => {
            let a = addr % FCOffset
            switch (a) {
                case 3: rc.set(addr, getReadRegisterResult(2)); break;
                case 5: rc.set(addr, getReadRegisterResult(65 << 8 | 66)); break;
                case 6: rc.set(addr, getReadRegisterResult(67 << 8 | 68)); break;
                case 7:
                case 8:
                case 9: rc.set(addr, getReadRegisterResult(0)); break;
                default: rc.set(addr, getReadRegisterResult(3));
            }

        });
    resultFunction(rc);
}

