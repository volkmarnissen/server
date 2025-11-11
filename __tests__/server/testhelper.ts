import { expect } from '@jest/globals'
import { IModbusResultWithDuration } from '../../src/server/bus'
import { ModbusRTUQueue } from '../../src/server/modbusRTUqueue'
import { ModbusRTUWorker } from '../../src/server/modbusRTUworker'
import { IModbusAPI } from '../../src/server/modbusWorker'
import { ModbusTasks } from '../../src/server.shared'
import * as fs from 'fs'
import { Config } from '../../src/server/config'

/**
 * Universal Test Helper für Datei Backup/Restore
 * Sichere und Wiederherstellen von Dateien vor/nach Tests
 */
export class FileBackupHelper {
  private backups: Map<string, string> = new Map()
  private testId: string

  constructor(testName?: string) {
    this.testId = testName || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Erstellt ein Backup einer Datei
   */
  backup(filePath: string): void {
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.backup-${this.testId}`
      fs.copyFileSync(filePath, backupPath)
      this.backups.set(filePath, backupPath)
    }
  }

  /**
   * Stellt eine Datei aus dem Backup wieder her
   */
  restore(filePath: string): void {
    const backupPath = this.backups.get(filePath)
    if (backupPath && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath)
      fs.unlinkSync(backupPath)
      this.backups.delete(filePath)
    }
  }

  /**
   * Stellt alle gesicherten Dateien wieder her
   */
  restoreAll(): void {
    for (const [originalPath, backupPath] of this.backups.entries()) {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, originalPath)
        fs.unlinkSync(backupPath)
      }
    }
    this.backups.clear()
  }

  /**
   * Löscht alle Backup-Dateien ohne Wiederherstellung
   */
  cleanup(): void {
    for (const backupPath of this.backups.values()) {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath)
      }
    }
    this.backups.clear()
  }
}

/**
 * Test Helper für Config-Datei Backup/Restore
 * Sichere und Wiederherstellen von secrets.yaml und anderen Dateien vor/nach Tests
 */
export class ConfigTestHelper {
  private helper: FileBackupHelper
  private originalSecretsPath: string

  constructor(testName?: string) {
    // Erst sicherstellen, dass Config-Verzeichnisse gesetzt sind
    if (!Config.configDir || Config.configDir.length === 0) {
      throw new Error('Config.configDir must be set before creating ConfigTestHelper')
    }

    this.helper = new FileBackupHelper(testName)
    this.originalSecretsPath = Config.getLocalDir() + '/secrets.yaml'
  }

  setup(): void {
    // Backup aller relevanten Dateien erstellen
    this.helper.backup(this.originalSecretsPath)

    // Zusätzlich Bus- und Specification-Dateien sichern
    const configDir = Config.configDir
    if (configDir) {
      this.helper.backup(`${configDir}/modbus2mqtt/busses/bus.0/s2.yaml`)
      this.helper.backup(`${configDir}/modbus2mqtt/specifications/files/waterleveltransmitter/files.yaml`)
    }
  }

  restore(): void {
    this.helper.restoreAll()
  }

  cleanup(): void {
    this.helper.cleanup()
  }
}

/**
 * Test Helper für Specification-Dateien
 * Sichere verschiedene Specification-Dateien vor Tests
 */
export class SpecificationTestHelper {
  private helper: FileBackupHelper

  constructor(testName?: string) {
    this.helper = new FileBackupHelper(testName)
  }

  /**
   * Sichert waterleveltransmitter files.yaml
   */
  backupWaterLevelTransmitter(baseDir: string): void {
    const filePath = `${baseDir}/modbus2mqtt/specifications/files/waterleveltransmitter/files.yaml`
    this.helper.backup(filePath)
  }

  /**
   * Sichert bus.0 s2.yaml Dateien
   */
  backupBusConfig(baseDir: string): void {
    const filePath = `${baseDir}/modbus2mqtt/busses/bus.0/s2.yaml`
    this.helper.backup(filePath)
  }

  /**
   * Sichert alle Test-relevanten Specification-Dateien
   */
  backupAll(baseDir: string): void {
    this.backupWaterLevelTransmitter(baseDir)
    this.backupBusConfig(baseDir)
  }

  /**
   * Stellt alle Dateien wieder her
   */
  restoreAll(): void {
    this.helper.restoreAll()
  }

  /**
   * Cleanup ohne Wiederherstellung
   */
  cleanup(): void {
    this.helper.cleanup()
  }
}

/**
 * Test Helper für Migration-Tests
 * Verwaltet temporäre Verzeichnisse und Dateien für CmdlineMigrate Tests
 */
export class MigrationTestHelper {
  private helper: FileBackupHelper
  private tempDirs: Set<string> = new Set()

  constructor(testName?: string) {
    this.helper = new FileBackupHelper(testName)
  }

  /**
   * Registriert ein temporäres Verzeichnis für Cleanup
   */
  registerTempDir(dirPath: string): void {
    this.tempDirs.add(dirPath)
  }

  /**
   * Sichert eine Datei vor dem Test
   */
  backup(filePath: string): void {
    this.helper.backup(filePath)
  }

  /**
   * Cleanup aller temporären Dateien und Verzeichnisse
   */
  cleanup(): void {
    // Helper cleanup
    this.helper.cleanup()

    // Temporäre Verzeichnisse löschen
    for (const dirPath of this.tempDirs) {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true })
      }
    }
    this.tempDirs.clear()
  }

  /**
   * Stellt alle gesicherten Dateien wieder her
   */
  restoreAll(): void {
    this.helper.restoreAll()
  }
}

let data = 198
export class FakeBus implements IModbusAPI {
  reconnected: boolean = false
  wroteDataCount: number = 0
  callCount: number = 0
  constructor() {
    data = 198
  }
  getCacheId(): string {
    return '1'
  }
  reconnectRTU(task: string) {
    return new Promise<void>((resolve) => {
      this.reconnected = true
      resolve()
    })
  }

  writeHoldingRegisters(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wroteDataCount++
      expect(data[0]).toBeGreaterThanOrEqual(200)
      resolve()
    })
  }
  writeCoils(slaveid: number, dataaddress: number, data: number[]): Promise<void> {
    return new Promise<void>((_resolve, reject) => {
      reject(new Error('Error'))
    })
  }
  defaultRC = (resolve: (result: IModbusResultWithDuration) => void, reject: (e: any) => void) => {
    resolve({ data: [0], duration: 199 })
  }
  readHoldingRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve) => {
      let d: number[] = []
      this.callCount = 1
      for (let idx = 0; idx < length; idx++) d.push(dataaddress)
      data++
      resolve({ data: d, duration: data })
    })
  }
  readCoils(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>((resolve, reject) => {
      if (this.callCount > 0) {
        this.callCount = 0
        let r: IModbusResultWithDuration = {
          data: [1],
          duration: 100,
        }
        resolve(r)
      } else {
        this.callCount = 1
        switch (dataaddress) {
          case 197:
            {
              this.callCount = 1
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function address
              reject(e1)
            }
            break
          case 198:
            {
              let e1: any = new Error('Error')
              e1.modbusCode = 1 // Illegal function code
              reject(e1)
            }
            break
          case 199:
            let e1: any = new Error('CRC error')
            reject(e1)
            break
          case 202:
            let e2: any = new Error('CRC error')
            reject(e2)
            break
          case 200:
            let e = new Error('Error')
            ;(e as any).errno = 'ETIMEDOUT'
            reject(e)
            break
          default:
            let r: IModbusResultWithDuration = {
              data: [1],
              duration: 100,
            }
            if (length > 1) for (let l = 1; l < length; l++) r.data.push(1)
            resolve(r)
        }
      }
    })
  }
  readDiscreteInputs(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
  readInputRegisters(slaveid: number, dataaddress: number, length: number): Promise<IModbusResultWithDuration> {
    return new Promise<IModbusResultWithDuration>(this.defaultRC)
  }
}
export class ModbusRTUWorkerForTest extends ModbusRTUWorker {
  public isRunningForTest: boolean
  public expectedReconnected: boolean = false
  public expectedAPIcallCount: number = 1
  public expectedAPIwroteDataCount: number = 0
  public expectedRequestCountSpecification = 0
  constructor(
    modbusAPI: IModbusAPI,
    queue: ModbusRTUQueue,
    private done: () => void,
    private testcase: string
  ) {
    super(modbusAPI, queue)
    this.isRunningForTest = false
  }
  override onFinish(): void {
    let fakeBus: FakeBus = this.modbusAPI as any
    expect(fakeBus.callCount).toBe(this.expectedAPIcallCount)
    expect((this.modbusAPI as FakeBus).reconnected).toBe(this.expectedReconnected)
    expect(fakeBus.wroteDataCount).toBe(this.expectedAPIwroteDataCount)
    if (this.expectedRequestCountSpecification > 0) {
      let min = new Date().getMinutes()
      expect(this['cache'].get(1)!.requestCount[ModbusTasks.specification][min]).toBe(this.expectedRequestCountSpecification)
    }
    this.done()
  }
}
export interface Itest {
  worker?: ModbusRTUWorkerForTest
}
