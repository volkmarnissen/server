import { expect, describe, test, beforeEach, afterEach } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { CmdlineMigrate } from '../../src/server/CmdlineMigrate'
import { MigrationTestHelper } from './testhelper'

describe('CmdlineMigrate', () => {
  const testBaseDir = path.join(__dirname, 'temp-migration-test')
  const dataDir = path.join(testBaseDir, 'data')
  const configDir = path.join(testBaseDir, 'config')
  const oldLocalDir = path.join(dataDir, 'local')
  const newLocalDir = path.join(configDir, 'modbus2mqtt')
  let testHelper: MigrationTestHelper

  beforeEach(() => {
    testHelper = new MigrationTestHelper()
    testHelper.registerTempDir(testBaseDir)

    // Clean up before each test
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true })
    }
    // Create base directories
    fs.mkdirSync(dataDir, { recursive: true })
    fs.mkdirSync(configDir, { recursive: true })
  })

  afterEach(() => {
    // Verwende den TestHelper für cleanup
    testHelper.cleanup()
  })

  describe('needsMigration', () => {
    test('returns true when old structure exists and new does not', () => {
      // Create old structure
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'test.yaml'), 'test: data')

      const result = CmdlineMigrate.needsMigration(dataDir, configDir)
      expect(result).toBe(true)
    })

    test('returns false when old structure does not exist', () => {
      const result = CmdlineMigrate.needsMigration(dataDir, configDir)
      expect(result).toBe(false)
    })

    test('returns false when new structure already exists', () => {
      // Create both old and new structures
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.mkdirSync(newLocalDir, { recursive: true })

      const result = CmdlineMigrate.needsMigration(dataDir, configDir)
      expect(result).toBe(false)
    })

    test('returns false when only new structure exists', () => {
      // Create only new structure (migration already done)
      fs.mkdirSync(newLocalDir, { recursive: true })

      const result = CmdlineMigrate.needsMigration(dataDir, configDir)
      expect(result).toBe(false)
    })
  })

  describe('migrate', () => {
    test('successfully migrates old structure to new', () => {
      // Create old structure with content
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'config.yaml'), 'version: 1')
      fs.mkdirSync(path.join(oldLocalDir, 'specifications'), { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'specifications', 'spec1.yaml'), 'spec: data')

      const result = CmdlineMigrate.migrate(dataDir, configDir)

      expect(result).toBe(true)
      expect(fs.existsSync(oldLocalDir)).toBe(false)
      expect(fs.existsSync(newLocalDir)).toBe(true)
      expect(fs.existsSync(path.join(newLocalDir, 'config.yaml'))).toBe(true)
      expect(fs.existsSync(path.join(newLocalDir, 'specifications', 'spec1.yaml'))).toBe(true)
    })

    test('returns false when migration not needed', () => {
      // No old structure exists
      const result = CmdlineMigrate.migrate(dataDir, configDir)
      expect(result).toBe(false)
    })

    test('does not migrate if new structure already exists', () => {
      // Create both structures
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'old.yaml'), 'old')
      fs.mkdirSync(newLocalDir, { recursive: true })
      fs.writeFileSync(path.join(newLocalDir, 'new.yaml'), 'new')

      const result = CmdlineMigrate.migrate(dataDir, configDir)

      expect(result).toBe(false)
      expect(fs.existsSync(oldLocalDir)).toBe(true) // Old still exists
      expect(fs.readFileSync(path.join(newLocalDir, 'new.yaml'), 'utf-8')).toBe('new') // New unchanged
    })

    test('creates config directory if it does not exist', () => {
      // Remove config dir
      fs.rmSync(configDir, { recursive: true, force: true })

      // Create old structure
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'test.yaml'), 'test')

      const result = CmdlineMigrate.migrate(dataDir, configDir)

      expect(result).toBe(true)
      expect(fs.existsSync(configDir)).toBe(true)
      expect(fs.existsSync(newLocalDir)).toBe(true)
    })

    test('preserves directory structure during migration', () => {
      // Create complex old structure
      fs.mkdirSync(path.join(oldLocalDir, 'specifications', 'files', 'device1'), { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'specifications', 'device1.yaml'), 'device1')
      fs.writeFileSync(path.join(oldLocalDir, 'specifications', 'files', 'device1', 'image.png'), 'image')

      CmdlineMigrate.migrate(dataDir, configDir)

      expect(fs.existsSync(path.join(newLocalDir, 'specifications', 'device1.yaml'))).toBe(true)
      expect(fs.existsSync(path.join(newLocalDir, 'specifications', 'files', 'device1', 'image.png'))).toBe(true)
    })
  })

  describe('validateNewStructure', () => {
    test('returns true when new structure exists and is directory', () => {
      fs.mkdirSync(newLocalDir, { recursive: true })
      const result = CmdlineMigrate.validateNewStructure(configDir)
      expect(result).toBe(true)
    })

    test('returns false when new structure does not exist', () => {
      const result = CmdlineMigrate.validateNewStructure(configDir)
      expect(result).toBe(false)
    })

    test('returns false when modbus2mqtt is a file instead of directory', () => {
      fs.writeFileSync(newLocalDir, 'not a directory')
      const result = CmdlineMigrate.validateNewStructure(configDir)
      expect(result).toBe(false)
    })
  })

  describe('createBackup', () => {
    test('creates backup of old local directory', () => {
      // Create old structure
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'important.yaml'), 'important data')

      const backupPath = CmdlineMigrate.createBackup(dataDir)

      expect(backupPath).not.toBeNull()
      expect(backupPath).toMatch(/local_backup_/)
      expect(fs.existsSync(backupPath!)).toBe(true)
      expect(fs.existsSync(path.join(backupPath!, 'important.yaml'))).toBe(true)
      expect(fs.readFileSync(path.join(backupPath!, 'important.yaml'), 'utf-8')).toBe('important data')
    })

    test('returns null when old structure does not exist', () => {
      const backupPath = CmdlineMigrate.createBackup(dataDir)
      expect(backupPath).toBeNull()
    })

    test('creates backup with nested directories', () => {
      // Create nested structure
      fs.mkdirSync(path.join(oldLocalDir, 'deep', 'nested', 'path'), { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'deep', 'nested', 'path', 'file.txt'), 'nested content')

      const backupPath = CmdlineMigrate.createBackup(dataDir)

      expect(backupPath).not.toBeNull()
      expect(fs.existsSync(path.join(backupPath!, 'deep', 'nested', 'path', 'file.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(backupPath!, 'deep', 'nested', 'path', 'file.txt'), 'utf-8')).toBe('nested content')
    })

    test('backup does not interfere with original', () => {
      fs.mkdirSync(oldLocalDir, { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'data.yaml'), 'original')

      const backupPath = CmdlineMigrate.createBackup(dataDir)

      // Modify original
      fs.writeFileSync(path.join(oldLocalDir, 'data.yaml'), 'modified')

      // Backup should still have original content
      expect(fs.readFileSync(path.join(backupPath!, 'data.yaml'), 'utf-8')).toBe('original')
      expect(fs.readFileSync(path.join(oldLocalDir, 'data.yaml'), 'utf-8')).toBe('modified')
    })
  })

  describe('integration: full migration workflow', () => {
    test('complete migration from old to new structure', () => {
      // Setup old structure with realistic content
      fs.mkdirSync(path.join(oldLocalDir, 'specifications'), { recursive: true })
      fs.writeFileSync(path.join(oldLocalDir, 'modbus2mqtt.yaml'), 'httpport: 3000')
      fs.writeFileSync(path.join(oldLocalDir, 'specifications', 'device.yaml'), 'manufacturer: test')

      // Also create public directory (should remain untouched)
      const publicDir = path.join(dataDir, 'public')
      fs.mkdirSync(path.join(publicDir, 'specifications'), { recursive: true })
      fs.writeFileSync(path.join(publicDir, 'specifications', 'public.yaml'), 'public: spec')

      // Step 1: Check if migration is needed
      expect(CmdlineMigrate.needsMigration(dataDir, configDir)).toBe(true)

      // Step 2: Create backup
      const backupPath = CmdlineMigrate.createBackup(dataDir)
      expect(backupPath).not.toBeNull()

      // Step 3: Perform migration
      const migrated = CmdlineMigrate.migrate(dataDir, configDir)
      expect(migrated).toBe(true)

      // Step 4: Validate new structure
      expect(CmdlineMigrate.validateNewStructure(configDir)).toBe(true)

      // Step 5: Verify content
      expect(fs.existsSync(path.join(newLocalDir, 'modbus2mqtt.yaml'))).toBe(true)
      expect(fs.existsSync(path.join(newLocalDir, 'specifications', 'device.yaml'))).toBe(true)

      // Step 6: Verify public directory is untouched
      expect(fs.existsSync(path.join(publicDir, 'specifications', 'public.yaml'))).toBe(true)
      expect(fs.readFileSync(path.join(publicDir, 'specifications', 'public.yaml'), 'utf-8')).toBe('public: spec')

      // Step 7: Verify old local dir is gone
      expect(fs.existsSync(oldLocalDir)).toBe(false)

      // Step 8: Verify backup still exists
      expect(fs.existsSync(backupPath!)).toBe(true)
    })
  })
})
