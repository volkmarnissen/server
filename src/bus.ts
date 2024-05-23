import Debug from "debug"
import { Observable, Subject, first } from "rxjs";
import { ImodbusEntityIdentification, ImodbusSpecification,  SpecificationStatus } from 'specification.shared';
import { IdentifiedStates } from 'specification.shared';
import { Mutex } from "async-mutex";
import { ModbusCache } from "./modbuscache";
import { ConverterMap, M2mSpecification } from "specification";
import { Config } from "./config";
import { Modbus } from "./modbus";
import { submitGetHoldingRegisterRequest } from "./submitRequestMock";
import { IfileSpecification } from "specification";
import { LogLevelEnum, Logger } from "specification";
import ModbusRTU from "modbus-serial";
import { ReadRegisterResult } from "modbus-serial/ModbusRTU";
import { Islave, IModbusConnection, IBus, IRTUConnection, ITCPConnection, IidentificationSpecification } from "server.shared";
import { ConfigSpecification } from "specification";
const debug = Debug("bus");
const debugMutex = Debug("bus.mutex")
const log = new Logger("bus")
interface Iparam {
    slaves: (Islave)[],
    slaveidIdx: number,
    allAddresses: Set<number>,
    finishedSubject: Subject<Map<number, ReadRegisterResult>>,
    failedFunction: (this: Bus, params: Iparam, e: any) => void,
}

export interface ReadRegisterResultWithDuration extends ReadRegisterResult {
    duration: number;
}

export class Bus {

    private static busses: Bus[] | undefined = undefined;
    private static allSpecificationsModbusAddresses: Set<number> | undefined = undefined
    static readBussesFromConfig(): void {
        let ibs = Config.getBussesProperties();
        if (!Bus.busses)
            Bus.busses = [];
        ibs.forEach(ib => {
            let bus = Bus.busses!.find(bus => bus.getId() == ib.busId);
            if (bus !== undefined)
                bus.properties = ib;
            else {
                let b = new Bus(ib);
                b.getSlaves().forEach(s => { s.evalTimeout = true })
                this.busses?.push(b)
            }
        })
        // delete removed busses
        for (let idx = 0; idx < Bus.busses!.length; idx++) {
            if (!ibs.find(ib => ib.busId == Bus.busses![idx].properties.busId))
                Bus.busses!.splice(idx, 1)
        }
    }
    static getBusses(): Bus[] {
        if (!Bus.busses) {
            Bus.readBussesFromConfig()
        }
        //debug("getBusses Number of busses:" + Bus.busses!.length)
        return Bus.busses!;
    }
    static addBus(connection: IModbusConnection): Bus {
        debug("addBus()")
        let busP = Config.addBusProperties(connection)
        let b = Bus.getBusses().find(b => b.getId() == busP.busId)
        if (b)
            throw new Error("Unable to add Bus it exists")
        else {
            b = new Bus(busP);
            Bus.getBusses().push(b);
        }
        return b;
    }
    updateBus(connection: IModbusConnection): Bus {
        debug("updateBus()")
        let busP = Config.updateBusProperties(this.properties, connection)
        let b = Bus.getBusses().find(b => b.getId() == busP.busId)
        if (b)
            b.properties = busP
        else
            throw new Error("Bus does not exist")
        return b;
    }
    static deleteBus(busid: number) {
        let idx = Bus.getBusses().findIndex(b => b.properties.busId == busid);
        if (idx >= 0) {
            Bus.getBusses().splice(idx, 1);
            Config.deleteBusProperties(busid)

        }
    }
    static getBus(busid: number): Bus | undefined {
        // debug("getBus()")
        return Bus.getBusses().find(b => b.properties.busId == busid);
    }

    //Runs in background only no feedback
    static getAllAvailableModusData(): void {
        debug("getAllAvailableModusData")
        let subject = new Subject<void>
        let busCount = Bus.getBusses().length;
        if (busCount == 0)
            setTimeout(() => { subject.next() }, 2);
    }

    slaves = new Map<number, Map<number, ReadRegisterResult>>()
    properties: IBus;
    private modbusClient: ModbusRTU | undefined
    private modbusClientTimedOut: boolean = false;
    private modbusClientMutex = new Mutex()
    private modbusClientMutexAquireCount = 0
    private modbusClientActionMutex = new Mutex()
    constructor(ibus: IBus) {
        this.properties = ibus

    }
    getId(): number {
        return this.properties.busId
    }
    private connectRTUClient(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.modbusClient == undefined)
                this.modbusClient = new ModbusRTU()
            if (this.modbusClient.isOpen) {
                resolve()
                return
            }

            // debug("connectRTU")
            let port = (this.properties.connectionData as IRTUConnection).serialport;
            let baudrate = (this.properties.connectionData as IRTUConnection).baudrate;
            if (port && baudrate) {
                this.modbusClient.connectRTU(port, { baudRate: baudrate }).then(resolve).catch(reject)
            } else {
                let host = (this.properties.connectionData as ITCPConnection).host;
                let port = (this.properties.connectionData as ITCPConnection).port;
                this.modbusClient.connectTCP(host, { port: port }).then(resolve).catch(reject)
            }

        })

    }
    reconnectRTU(task: string): Promise<void> {
        debugMutex(task + " reconnecting " + (this.modbusClient?.isOpen ? "opened" : "closed"))
        let rc = new Promise<void>((resolve, reject) => {
            if (this.modbusClientTimedOut) {
                if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
                    reject(task + " Last read failed with TIMEOUT and modbusclient is not ready")
                    return
                }
                else
                    resolve()
            } else if (this.modbusClient == undefined || !this.modbusClient.isOpen) {
                this.connectRTUClient().then(resolve).catch((e) => {
                    log.log(LogLevelEnum.error, task + " connection failed " + e)
                    debugMutex(task + " release " + this.modbusClientMutexAquireCount--)
                    this.modbusClientMutex.release()
                    reject(e)
                })
            }
            else
                if (this.modbusClient!.isOpen) {
                    this.modbusClient.close(() => {
                        debug("closed")
                        if (this.modbusClient!.isOpen)
                            setTimeout(() => {
                                if (this.modbusClient!.isOpen)
                                    reject(new Error("ModbusClient is open after close"))
                                else
                                    this.reconnectRTU(task).then(resolve).catch(reject)
                            }, 10);
                        else
                            this.reconnectRTU(task).then(resolve).catch(reject)
                    })
                }
                else {
                    debugMutex(task + " release " + this.modbusClientMutexAquireCount--)
                    this.modbusClientMutex.release()
                    reject(new Error(task + " unable to open"))
                }

        })
        return rc;
    }
    connectRTU(task: string): Promise<void> {
        let rc = new Promise<void>((resolve, reject) => {
            debugMutex(task + " connectRTU modbusClientMutex " + (this.modbusClientMutex.isLocked() ? "locked" : "unlocked") + " mutex:" + this.modbusClientMutexAquireCount++)
            this.modbusClientMutex.acquire().then(() => {
                this.connectRTUClient().then(resolve).catch((e) => {
                    log.log(LogLevelEnum.error, task + " connection failed " + e)
                    debugMutex(task + " release " + this.modbusClientMutexAquireCount--)
                    this.modbusClientMutex.release()
                    reject(e)
                })
            })
        })
        return rc;
    }

    closeRTU(task: string, callback: Function) {
        debugMutex(task + " closeRTU")
        if (this.modbusClientTimedOut) {
            debugMutex(task + " Timeout: release " + this.modbusClientMutexAquireCount--)
            this.modbusClientMutex.release()
            debug("Workaround: Last calls TIMEDOUT won't close")
            callback()

        }
        else if (this.modbusClient == undefined) {
            debugMutex(task + " modbusClient undefined: release " + this.modbusClientMutexAquireCount--)

            this.modbusClientMutex.release()
            log.log(LogLevelEnum.error, "modbusClient is undefined")
        }
        else
            this.modbusClient.close(() => {
                debugMutex(task + " close: release " + this.modbusClientMutexAquireCount--)

                this.modbusClientMutex.release()
                // debug("closeRTU: " + (this.modbusClient?.isOpen ? "open" : "closed"))
                callback()
            })

    }
    isRTUopen(): boolean {
        if (this.modbusClient == undefined) {
            log.log(LogLevelEnum.error, "modbusClient is undefined")
            return false
        }
        else
            return this.modbusClient.isOpen
    }
    setModbusTimout(reject: (e: any) => void, e: any) {
        this.modbusClientTimedOut = (e.errno && e.errno == "ETIMEDOUT")
        reject(e)
    }
    clearModbusTimout() {
        this.modbusClientTimedOut = false
    }

    readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
        let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
            if (this.modbusClient == undefined) {
                log.log(LogLevelEnum.error, "modbusClient is undefined")
                reject(new Error("modbusClient is undefined"))
            }
            else {
                this.prepareRead(slaveid)
                this.modbusClientActionMutex.acquire().then(() => {
                    let start = Date.now()
                    this.modbusClient!.readHoldingRegisters(dataaddress, length).then((data) => {
                        this.modbusClientActionMutex.release()
                        this.clearModbusTimout()
                        resolve({ ...data, duration: Date.now() - start })
                    }).catch(e => {
                        this.modbusClientActionMutex.release()
                        e.duration = Date.now() - start
                        this.setModbusTimout(reject, e)
                    })
                })
            }
        })
        return rc;
    }
    readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
        let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
            if (this.modbusClient == undefined) {
                log.log(LogLevelEnum.error, "modbusClient is undefined")
                return
            }
            else {
                this.prepareRead(slaveid)
                this.modbusClientActionMutex.acquire().then(() => {
                    let start = Date.now()
                    this.modbusClient!.readInputRegisters(dataaddress, length).then((data) => {
                        this.modbusClientActionMutex.release()
                        resolve({ ...data, duration: Date.now() - start })

                        this.clearModbusTimout()
                    }).catch(e => {
                        this.modbusClientActionMutex.release()
                        this.setModbusTimout(reject, e)
                    })
                })
            }
        })
        return rc;
    }
    readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<ReadRegisterResultWithDuration> {
        let rc = new Promise<ReadRegisterResultWithDuration>((resolve, reject) => {
            if (this.modbusClient == undefined) {
                log.log(LogLevelEnum.error, "modbusClient is undefined")
                return
            }
            else {
                this.prepareRead(slaveid)
                this.modbusClientActionMutex.acquire().then(() => {
                    let start = Date.now()
                    this.modbusClient!.readDiscreteInputs(dataaddress, length).then(resolveBoolean => {
                        this.modbusClientActionMutex.release()
                        let readResult: ReadRegisterResult = {
                            data: [],
                            buffer: Buffer.allocUnsafe(0)
                        }
                        resolveBoolean.data.forEach(d => { readResult.data.push(d ? 1 : 0) })
                        resolve({ ...readResult, duration: Date.now() - start })

                        this.clearModbusTimout()
                    }).catch(e => {
                        this.modbusClientActionMutex.release()
                        this.setModbusTimout(reject, e)
                    })
                })
            }
        })
        return rc;
    }
    private prepareRead(slaveid: number) {

        this.modbusClient!.setID(slaveid)
        let slave = this.getSlaveBySlaveId(slaveid)
        if (slave) {
            if (slave.modbusTimout == undefined)
                slave.modbusTimout = (this.properties.connectionData as IRTUConnection).timeout
            this.modbusClient!.setTimeout(slave.modbusTimout)

        }

    }
    getMaxModbusTimeout() {
        return (this.properties.connectionData as IRTUConnection).timeout;
    }

    writeHoldingRegisters(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
        let rc = new Promise<void>((resolve, reject) => {
            if (this.modbusClient == undefined) {
                log.log(LogLevelEnum.error, "modbusClient is undefined")
                return
            }
            else {
                this.modbusClientActionMutex.acquire().then(() => {

                    this.modbusClient!.setID(slaveid)
                    this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
                    this.modbusClient!.writeRegisters(dataaddress, data.data).then(() => {
                        this.modbusClientTimedOut = false;
                        this.modbusClientActionMutex.release()
                        resolve()
                    }).catch(e => {
                        this.modbusClientActionMutex.release()
                        this.setModbusTimout(reject, e)
                    });
                })
            }
        })
        return rc;
    }
    writeCoils(slaveid: number, dataaddress: number, data: ReadRegisterResult): Promise<void> {
        let rc = new Promise<void>((resolve, reject) => {
            if (this.modbusClient == undefined) {
                log.log(LogLevelEnum.error, "modbusClient is undefined")
                return
            }
            else {
                this.modbusClientActionMutex.acquire().then(() => {

                    this.modbusClient!.setID(slaveid)
                    this.modbusClient!.setTimeout((this.properties.connectionData as IRTUConnection).timeout)
                    let dataB: boolean[] = []
                    data.data.forEach(d => { dataB.push(d == 1) })
                    this.modbusClient!.writeCoils(dataaddress, dataB).then(() => {
                        this.modbusClientActionMutex.release()
                        this.modbusClientTimedOut = false;
                        resolve()
                    }).catch(e => {
                        this.modbusClientActionMutex.release()
                        this.setModbusTimout(reject, e)
                    });

                })
            }
        })
        return rc;
    }


    setModbusAddressesForSlave(slaveid: number, addresses: Map<number, ReadRegisterResult>) {
        if (this.slaves)
            this.slaves!.set(slaveid, addresses)
    }
    deleteSlave(slaveid: number) {
        new Config().deleteSlave(this.properties.busId, slaveid)
        if (this.slaves)
            this.slaves!.delete(slaveid)
    }
    static getModbusAddressesForSpec(spec: IfileSpecification, addresses: Set<number>): void {
        for (let ent of spec.entities) {
            let converter = ConverterMap.getConverter(ent);
            if (ent.modbusAddress != undefined && converter && ent.functionCode)
                for (let i = 0; i < converter.getModbusLength(ent); i++)
                    addresses.add(M2mSpecification.getModbusAddressFCFromEntity(ent) + i);
        }
    }
    private static updateAllSpecificationsModbusAddresses(specificationid: string | null) {
        let cfg = new Config();
        // If a used specificationid was deleted, remove it from slaves
        if (specificationid != null) {
            new ConfigSpecification().filterAllSpecifications(spec => {
                if (spec.filename == specificationid)
                    specificationid = null
            })
            Bus.getBusses().forEach(bus => {
                bus.getSlaves().forEach(slave => {
                    debug("updateAllSpecificationsModbusAddresses slaveid: " + slave.slaveid)
                    if (slave.specificationid == specificationid)
                        cfg.writeslave(bus.getId(), slave.slaveid, specificationid == null ? undefined : specificationid, slave.name)
                })
            })
        }
        Bus.allSpecificationsModbusAddresses = new Set<number>();
        new ConfigSpecification().filterAllSpecifications((spec) => { Bus.getModbusAddressesForSpec(spec, Bus.allSpecificationsModbusAddresses!) });
    }
    /*
     * returns cached set of all modbusaddresses for all specifications.
     * It will be updated after any change to Config.specifications array
     */
    private static getModbusAddressesForAllSpecs(): Set<number> {
        debug('getAllModbusAddresses')
        if (!Bus.allSpecificationsModbusAddresses) {
            Bus.updateAllSpecificationsModbusAddresses(null)
            Config.getSpecificationsChangedObservable().subscribe(Bus.updateAllSpecificationsModbusAddresses)
        }
        return Bus.allSpecificationsModbusAddresses!;
    }
    private failedFunction(param: Iparam, e: any): void {
        log.log(LogLevelEnum.error, e)
        debug("readModbus failed slaveidx: ", param.slaveidIdx + " slaves.length:" + param.slaves.length)
        if (param.slaveidIdx < param.slaves.length)
            this.getAvailableModusDataLocal.bind(this, param)(new Map<number, ReadRegisterResult>())
        else
            param.finishedSubject.next(new Map<number, ReadRegisterResult>());
    }
    getAvailableModusData(slaveid: number = -1): Observable<Map<number, ReadRegisterResult>> {
        debug("getAvailableModusData slaveid: " + slaveid)
        let finishedSubject = new Subject<Map<number, ReadRegisterResult>>()
        let slave = this.getSlaveBySlaveId(slaveid)
        let slaves = this.getSlaves()
        if (slaveid != -1)
            if (slave)
                slaves = [slave]
            else
                slaves = [{ slaveid: slaveid }] // The bus has no configured slave with this slaveid
        // no data available read from modbus
        let rc = new Map<number, ReadRegisterResult>()
        let allSlaves: number[] = []
        this.getSlaves().forEach(s => { allSlaves.push(s.slaveid) })
        if (allSlaves.length >= 0) {
            let parameter: Iparam = {
                slaves: slaves,
                slaveidIdx: -1,
                allAddresses: Bus.getModbusAddressesForAllSpecs(),
                finishedSubject: finishedSubject,
                failedFunction: this.failedFunction
            }
            let fn = (async () => { this.getAvailableModusDataLocal(parameter, rc) })
            setTimeout(fn, 2);
        }
        else
            setTimeout(() => { finishedSubject.next(new Map<number, ReadRegisterResult>()) }, 2)

        return finishedSubject.pipe(first());
    }
    /*
     * This is a recursion function. It calls itself after readingModbusRegister
     */
    private async getAvailableModusDataLocal(parameter: Iparam, results: Map<number, ReadRegisterResult>): Promise<void> {
        debug("getAvailableModusDataLocal slaveid: " + parameter.slaves[parameter.slaveidIdx]?.slaveid + " slaveids: " + JSON.stringify(parameter.slaves))
        let b = this.getAvailableModusDataLocal.bind(this, parameter)
        let slave = parameter.slaves[parameter.slaveidIdx]
        if (parameter.slaveidIdx >= 0) //ignore the first call there are no results
        {
            //Store results from readModbusRegister
            this.setModbusAddressesForSlave(slave.slaveid, results)
        }
        if (parameter.slaveidIdx < parameter.slaves.length - 1 && parameter.slaves[parameter.slaveidIdx + 1]?.slaveid != -1) {
            parameter.slaveidIdx++;
            slave = parameter.slaves[parameter.slaveidIdx]
            let addresses = parameter.allAddresses
            // If there is a specification for slave configure, just read modbus date for this. 
            // This avoids timeouts when reading modbus data
            if (slave.specification) {

                let spec = ConfigSpecification.getSpecificationByFilename(slave.specification.filename)
                if (spec) {
                    addresses = new Set<number>()
                    Bus.getModbusAddressesForSpec(spec, addresses)
                }
            }
            await this.readModbusRegister("getAvailableModusData", slave.slaveid, addresses, b, parameter.failedFunction.bind(this, parameter))
        } else
            setTimeout(() => { parameter.finishedSubject.next(results) }, 2);
    }
    async readModbusRegister(task: string, slaveid: number, addresses: Set<number>, resultFunction: (results: Map<number, ReadRegisterResult>) => void, failedFunction: (e: any) => void) {

        debug("readModbusRegister slaveid: " + slaveid + " addresses: " + JSON.stringify(Array.from(addresses)))
        let fn = (async () => {
            if (Config.getConfiguration().fakeModbus)
                submitGetHoldingRegisterRequest({ busid: this.getId(), slaveid: slaveid }, addresses, resultFunction, failedFunction)
            else
                new ModbusCache(task + "(" + slaveid + ")").
                    submitGetHoldingRegisterRequest({ busid: this.getId(), slaveid: slaveid }, addresses, resultFunction, failedFunction)
        });
        fn();
    }

    getAvailableSpecs(slaveid: number): Observable<(IidentificationSpecification)[]> {
        let rc = new Subject<(IidentificationSpecification)[]>();
        let iSpecs: IidentificationSpecification[] = [];
        // will be called one (per slave)
        this.getAvailableModusData(slaveid).subscribe(modbusData => {
            let cfg = new ConfigSpecification();
            cfg.filterAllSpecifications((spec) => {
                let mspec = M2mSpecification.fileToModbusSpecification(spec, modbusData)
                debug("getAvailableSpecs");
                if (mspec) {
                    if ([SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status) && mspec.identified == IdentifiedStates.identified)
                        iSpecs.push(this.convert2ImodbusSpecification(slaveid, mspec));
                    else
                        if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(mspec.status))
                            iSpecs.push(this.convert2ImodbusSpecification(slaveid, mspec));
                }
                else
                    if (![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status))
                        iSpecs.push(this.convert2ImodbusSpecificationFromSpec(slaveid, spec))
            });
            // let sStatus: EnumSlaveStatus = EnumSlaveStatus.configured
            // if (modbusData.size == 0)
            //     sStatus = EnumSlaveStatus.notAvailable
            // else
            //     sStatus = EnumSlaveStatus.available
            // if (iSpecs.find(i => i.identified == IdentifiedStates.identified))
            //     sStatus = EnumSlaveStatus.matchesToSpec
            // if (iSpecs.find(i => i.configuredSlave != undefined && i.identified == IdentifiedStates.identified))
            //     sStatus = EnumSlaveStatus.matchestoConfiguredSpec

            // // all specifications are done
            // let r: IslaveidWithIdentifications = {
            //     slaveId: slaveid,
            //     slaveStatus: sStatus,
            //     identifications: iSpecs
            // }
            rc.next(iSpecs);
        })
        return rc
    }

    private convert2ImodbusSpecification(slaveid: number, mspec: ImodbusSpecification): IidentificationSpecification {
        // for each spec
        let entityIdentifications: ImodbusEntityIdentification[] = [];
        for (let ment of mspec.entities) {
            entityIdentifications.push({
                id: ment.id,
                modbusValue: ment.modbusValue,
                mqttValue: ment.mqttValue,
                identified: ment.identified
            });
        }
        let configuredslave = this.properties.slaves.find(dev => dev.specificationid === mspec.filename && dev.slaveid == slaveid)
        return {
            filename: mspec.filename,
            files: mspec.files,
            i18n: mspec.i18n,
            status: mspec.status!,
            configuredSlave: configuredslave,
            entities: entityIdentifications, identified: mspec.identified
        };
    }
    private convert2ImodbusSpecificationFromSpec(slaveid: number, spec: IfileSpecification): IidentificationSpecification {
        // for each spec
        let entityIdentifications: ImodbusEntityIdentification[] = [];
        for (let ent of spec.entities) {
            entityIdentifications.push({
                id: ent.id,
                modbusValue: [],
                mqttValue: "",
                identified: IdentifiedStates.notIdentified
            });
        }
        let configuredslave = this.properties.slaves.find(dev => dev.specificationid === spec.filename && dev.slaveid == slaveid)
        return {
            filename: spec.filename,
            files: spec.files,
            i18n: spec.i18n,
            status: spec.status!,
            configuredSlave: configuredslave,
            entities: entityIdentifications, identified: IdentifiedStates.notIdentified
        };
    }

    writeSlave(slaveid: number, specification: string | undefined, name: string | undefined, polInterval: number | undefined): Islave {
        if (slaveid < 0)
            throw new Error("Try to save invalid slave id ")        // Make sure slaveid is unique
        let oldIdx = this.properties.slaves.findIndex((dev) => { return dev.slaveid === slaveid });
        let slave = new Config().writeslave(this.properties.busId, slaveid, specification, name, polInterval)


        if (oldIdx >= 0)
            this.properties.slaves[oldIdx] = slave;
        else
            this.properties.slaves.push(slave);
        return slave;
    }
    getCachedValues(slaveid: number, addresses: Set<number>): Map<number, ReadRegisterResult> | null {
        let rc = new Map<number, ReadRegisterResult>()
        if (this.slaves) {
            let saddresses = this.slaves.get(slaveid)
            if (saddresses)
                for (let address of addresses) {
                    let value = saddresses!.get(address)
                    if (value == undefined || value == null)
                        return null
                    rc.set(address, value)
                }
        }
        return rc;
    }

    getSlaves(): Islave[] {
        this.properties.slaves.forEach(s => {
            if (s && s.specificationid) {
                let ispec = ConfigSpecification.getSpecificationByFilename(s.specificationid);
                if (ispec)
                    s.specification = ispec;
            }
        })
        return this.properties.slaves;
    }
    getSlaveBySlaveId(slaveid: number): Islave | undefined {
        let slave = this.properties.slaves.find(dev => dev.slaveid == slaveid)

        if (slave && slave.specificationid) {
            let ispec = ConfigSpecification.getSpecificationByFilename(slave.specificationid);
            if (ispec)
                slave.specification = ispec;
        }
        return slave;
    }
}