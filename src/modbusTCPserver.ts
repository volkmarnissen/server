import { FCallbackVal, IServiceVector, ServerTCP } from "modbus-serial";
import Debug from "debug"
import { ModbusRegisterType } from '@modbus2mqtt/specification.shared';

export const XYslaveid = 1
export const Dimplexslaveid = 2
export const Eastronslaveid = 3
const debug = Debug("modbusserver");
const dimplexHolding = [[1, 200],
[1, 200],
[174, 450],
[11, 208],
[3, 480],
[46, 209],
[47, 30],
]

const values = {
    //XY-MD02
    inputRegisters: [{ slaveid: XYslaveid, address: 1, value: 195 }, { slaveid: XYslaveid, address: 2, value: 500 },
    ],
    holdingRegisters: [{ slaveid: XYslaveid, address: 0x0101, value: 1 }, { slaveid: XYslaveid, address: 0x0102, value: 1 }],
    coils: [{ slaveid: XYslaveid, address: 1, value: true }, { slaveid: XYslaveid, address: 2, value: true },
    { slaveid: Dimplexslaveid, address: 1, value: false }, { slaveid: Dimplexslaveid, address: 3, value: false }],
}

function getCoil(addr: number, unitID: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        let v = values.coils.find(v => v.slaveid == unitID && v.address == addr)
        if (v) {
            debug("getCoil: slave: " + unitID + "address: " + addr + "v: " + v.value)
            resolve(v.value)
        }
        else {
            debug("getCoil: failed slave: " + unitID + "address: " + addr)

            reject({ modbusErrorCode: 2, msg: "" })
        }

    })
}
const vector: IServiceVector = {
    getInputRegister: function (addr: number, unitID: number): Promise<number> {
        return new Promise<number>((resolve, reject) => {

            let v = values.inputRegisters.find(v => v.slaveid == unitID && v.address == addr)
            if (v) {
                debug("getInputRegister slave:" + addr + "unit" + unitID + "v: " + v.value)
                resolve(v.value)
            }
            else {
                debug("getInputRegister slave:" + addr + "unit" + unitID)
                reject({ modbusErrorCode: 2, msg: "" })
            }
        });
    },
    getHoldingRegister: function (addr: number, unitID: number): Promise<number> {
        return new Promise<number>((resolve, reject) => {

            let v = values.holdingRegisters.find(v => v.slaveid == unitID && v.address == addr)
            if (v) {
                debug("getHoldingRegister addr:" + addr + " slave: " + unitID + "v: " + v.value)
                resolve(v.value)
            }
            else {
                debug("getHoldingRegister not found addr:" + addr + " slave: " + unitID)
                reject({ modbusErrorCode: 2, msg: "" })
            }

        });

    },
    getMultipleInputRegisters: (addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void => {
        let rc: number[] = []
        for (let idx = 0; idx < length; idx++) {
            let v = values.inputRegisters.find(v => v.slaveid == unitID && v.address == addr + idx)
            if (v)
                rc.push(v.value)
            else {
                debug("getMultipleInputRegisters not found addr:" + addr + " slave: " + unitID)
                cb({ modbusErrorCode: 2 } as any as Error, []);
                return
            }
        }
        debug("getMultipleInputRegisters addr:" + addr + " slave: " + unitID + "rc: " + JSON.stringify(rc))
        cb(null, rc)
    },
    getMultipleHoldingRegisters: (addr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void => {
        let rc: number[] = []
        for (let idx = 0; idx < length; idx++) {
            let v = values.holdingRegisters.find(v => v.slaveid == unitID && v.address == addr + idx)
            if (v)
                rc.push(v.value)
            else {
                console.log("Invalid holding reg s:" + unitID + " a: " + addr+idx)
                cb({ modbusErrorCode: 2 } as any as Error, []);
                return
            }

        }
        debug("getMultipleHoldingRegisters " + JSON.stringify(rc))
        cb(null, rc)
    },
    getDiscreteInput: getCoil,
    getCoil: getCoil,

    setRegister: (addr: number, value: number, unitID: number): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            let v = values.holdingRegisters.find(v => v.slaveid == unitID && v.address == addr)
            if (v) {
                v.value = value
                resolve()
            }
            else
                reject({ modbusErrorCode: 2, msg: "" })
        });

    },
    setCoil: (addr: number, value: boolean, unitID: number, cb: FCallbackVal<number>): void => {
        let v = values.coils.find(v => v.slaveid == unitID && v.address == addr)
        if (v) {
            v.value = value
            cb(null, value ? 1 : 0)
        }
        else {
            cb({ modbusErrorCode: 2 } as any as Error, 0);
            return
        }
    }
};
export class ModbusServer {
    serverTCP: ServerTCP | undefined
    async startServer(port: number): Promise<ServerTCP> {
        dimplexHolding.forEach((nv) => {
            values.holdingRegisters.push({ slaveid: Dimplexslaveid, address: nv[0], value: nv[1] })

        })

        let rc = new Promise<ServerTCP>((resolve) => {
            console.log("ModbusTCP listening on modbus://0.0.0.0:" + port);
            this.serverTCP = new ServerTCP(vector, { host: "0.0.0.0", port: port, debug: true });

            this.serverTCP.on("socketError", function (err) {
                // Handle socket error if needed, can be ignored
                console.error(err);
            });
            this.serverTCP.on("initialized", () => { resolve(this.serverTCP!) })
        })
        return rc;
    }
    stopServer(cb?: () => void) {
        if (this.serverTCP)
            this.serverTCP.close(() => {
                if (cb)
                    cb();
            })
    }
}
export function addRegisterValue( slaveid: number, address: number, fc:ModbusRegisterType, value: number):void{
    switch( fc ){
        case ModbusRegisterType.HoldingRegister:
                  values.holdingRegisters.push({ slaveid:slaveid, address:address,value:value})
                break;
        
        case  ModbusRegisterType.Coils:
                values.coils.push({ slaveid:slaveid, address:address,value:value!= 0})
                break;
        case ModbusRegisterType.AnalogInputs:
                values.inputRegisters.push({ slaveid:slaveid, address:address,value:value})
                break;
        default:
                console.log("Invalid function code " + fc)
                
    }
}
export function logValues(){
    console.log("coils")
    values.coils.forEach(c=>{
        console.log("s: " + c.slaveid + " a: " + c.address + " v: " + c.value)
    })
    console.log("holding")
    values.holdingRegisters.forEach(c=>{
        console.log("s: " + c.slaveid + " a: " + c.address + " v: " + c.value)
    })
    console.log("input")
    values.inputRegisters.forEach(c=>{
        console.log("s: " + c.slaveid + " a: " + c.address + " v: "  + c.value)
    })
}
export function runModbusServer(port: number = 8502): void {
    new ModbusServer().startServer(port).then(() => { console.log("listening") });
}
// set the server to answer for modbus requests
