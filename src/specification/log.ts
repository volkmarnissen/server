import npmlog from 'npmlog'
import Debug from 'debug'
import fs from 'fs'
import { format } from 'util'
export enum LogLevelEnum {
  verbose = 'verbose',
  timing = 'timing',
  http = 'http',
  notice = 'notice',
  warn = 'warn',
  error = 'error',
}
const debug = Debug('logger')

/*
 * Logger is a gateway to npmlog.
 * It is a workaround to log in jest test environment by forwarding the log to console.log
 * In productive mode, npmlog is called directly.
 * Logger makes it easy to set a source file specific prefix.
 */
export class Logger {
  static isInitialized = false

  constructor(private prefix: string) {}

  public static logLevel: LogLevelEnum = LogLevelEnum.notice
  log(level: LogLevelEnum, message: any, ...args: any[]) {
    if (!Logger.isInitialized) {
      Logger.init()
    }
    if (process.env['JEST_WORKER_ID'] !== undefined) {
      Debug(this.prefix)(format(message, ...args))
    } else npmlog.log(level, this.prefix, message, ...args)
  }
  private static init(): void {
    Logger.isInitialized = true
    //log.level = Logger.logLevel
    if (process.env['JEST_WORKER_ID'] !== undefined) {
      npmlog.on('log', Logger.forwardToConsole)
    } else {
      Object.defineProperty(npmlog, 'heading', {
        get: () => {
          var d = new Date()
          return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
        },
      })
      //  log.headingStyle = { bg: '', fg: 'white' }
    }
  }
  private static forwardToConsole(message: any) {
    debug(message.level + ' ' + message.prefix + ': ' + message.message)
  }
  log2File(message: any, ...args: any[]) {
    if (process.env['JEST_WORKER_ID'] !== undefined) fs.appendFileSync('test.log', format(message, ...args))
  }
}
