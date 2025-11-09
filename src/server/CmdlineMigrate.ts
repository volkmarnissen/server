import fs from 'fs'
import path from 'path'
import { Logger, LogLevelEnum } from '../specification/log'

const log = new Logger('CmdlineMigrate')

/**
 * CmdlineMigrate handles migration from old to new command line structure:
 *
 * OLD structure (before migration):
 * -d --data <data-dir>
 *   └── local/           (user specifications)
 *   └── public/          (public specifications)
 *
 * NEW structure (after migration):
 * -c --config <config-dir>
 *   └── modbus2mqtt/
 *       └── (content of old local/)
 * -d --data <data-dir>
 *   └── public/          (public specifications, unchanged)
 *
 * Migration is idempotent - it will only execute if old structure exists
 * and new structure doesn't exist yet.
 */
export class CmdlineMigrate {
  /**
   * Checks if migration is needed by detecting old structure
   * @param dataDir - Path to data directory
   * @param configDir - Path to config directory
   * @returns true if old structure exists and migration needed
   */
  static needsMigration(dataDir: string, configDir: string): boolean {
    const oldLocalDir = path.join(dataDir, 'local')
    const newLocalDir = path.join(configDir, 'modbus2mqtt')

    // Check if old structure exists
    const hasOldStructure = fs.existsSync(oldLocalDir)

    // Check if new structure already exists
    const hasNewStructure = fs.existsSync(newLocalDir)

    // Migration needed if old exists but new doesn't
    return hasOldStructure && !hasNewStructure
  }

  /**
   * Performs the migration from old to new structure
   * @param dataDir - Path to data directory
   * @param configDir - Path to config directory
   * @returns true if migration was performed, false if skipped
   */
  static migrate(dataDir: string, configDir: string): boolean {
    if (!this.needsMigration(dataDir, configDir)) {
      log.log(LogLevelEnum.info, 'Migration not needed or already completed')
      return false
    }

    const oldLocalDir = path.join(dataDir, 'local')
    const newLocalDir = path.join(configDir, 'modbus2mqtt')

    try {
      log.log(LogLevelEnum.info, `Migrating from ${oldLocalDir} to ${newLocalDir}`)

      // Create config directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
        log.log(LogLevelEnum.info, `Created config directory: ${configDir}`)
      }

      // Move old local directory to new location
      fs.renameSync(oldLocalDir, newLocalDir)

      log.log(LogLevelEnum.info, 'Migration completed successfully')
      return true
    } catch (error) {
      log.log(LogLevelEnum.error, `Migration failed: ${error}`)
      throw new Error(`Failed to migrate directory structure: ${error}`)
    }
  }

  /**
   * Validates that the new structure exists and is accessible
   * @param configDir - Path to config directory
   * @returns true if new structure is valid
   */
  static validateNewStructure(configDir: string): boolean {
    const newLocalDir = path.join(configDir, 'modbus2mqtt')
    return fs.existsSync(newLocalDir) && fs.statSync(newLocalDir).isDirectory()
  }

  /**
   * Creates a backup of the old structure before migration
   * @param dataDir - Path to data directory
   * @returns path to backup directory
   */
  static createBackup(dataDir: string): string | null {
    const oldLocalDir = path.join(dataDir, 'local')
    if (!fs.existsSync(oldLocalDir)) {
      return null
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(dataDir, `local_backup_${timestamp}`)

    try {
      fs.cpSync(oldLocalDir, backupDir, { recursive: true })
      log.log(LogLevelEnum.info, `Backup created at: ${backupDir}`)
      return backupDir
    } catch (error) {
      log.log(LogLevelEnum.error, `Failed to create backup: ${error}`)
      return null
    }
  }
}
