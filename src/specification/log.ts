import Debug from 'debug'
import fs from 'fs'
import { format } from 'util'
import winston, { Logger as WinstonLogger, Logform, LogEntry, LoggerOptions } from 'winston'
import Transport, { TransportStreamOptions } from 'winston-transport'
export enum LogLevelEnum {
  verbose = 'verbose',
  timing = 'timing',
  http = 'http',
  info = 'info',
  warn = 'warn',
  error = 'error',
}
const debug = Debug('logger')
interface LogLoggerOptions extends LoggerOptions {
  prefix?: string
}

class DebugTransport extends Transport {
  constructor() {
    super()
  }
  override log(info: LogEntry) {
    setImmediate(() => {
      Debug(info.message)
    })
  }
}

/* It is a workaround to log in jest test environment by forwarding the log to console.log
 * In productive mode, npmlog is called directly.
 * Logger makes it easy to set a source file specific prefix.
 */
export class Logger {
  private logger: WinstonLogger
  loggerTransport: winston.transports.ConsoleTransportInstance

  constructor(private prefix: string) {
    let format =
      process.env['JEST_WORKER_ID'] == undefined
        ? winston.format.combine(winston.format.timestamp(), winston.format.label({ label: this.prefix }))
        : winston.format.label({ label: this.prefix })

    let loggerTransport = process.env['JEST_WORKER_ID'] !== undefined ? new winston.transports.Console() : new DebugTransport()
    this.logger = winston.createLogger({
      level: LogLevelEnum.info,
      format: format,
      transports: [loggerTransport],
    })
  }
  log(level: LogLevelEnum, message: any, ...args: any[]) {
    const msg = format(message, ...args)
    this.logger.log({ level: level, message: msg, prefix: this.prefix })
  }
  log2File(message: any, ...args: any[]) {
    if (process.env['JEST_WORKER_ID'] !== undefined) fs.appendFileSync('test.log', format(message, ...args))
  }
}
