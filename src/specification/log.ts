import Debug from 'debug'
import fs from 'fs'
import { format } from 'util'
import winston, { Logger as WinstonLogger, LoggerOptions } from 'winston'
import Transport from 'winston-transport'
export enum LogLevelEnum {
  verbose = 'verbose',
  timing = 'timing',
  http = 'http',
  info = 'info',
  warn = 'warn',
  error = 'error',
}
const debug = Debug('logger')
// Reserved for potential future extension of logger configuration
interface LogLoggerOptions extends LoggerOptions {
  prefix?: string
}

class DebugTransport extends Transport {
  constructor() {
    super()
  }
  // Winston transport contract: log(info, next)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override log(info: any, next?: () => void) {
    setImmediate(() => {
      const level = info?.level ?? 'info'
      const label = info?.label ?? info?.prefix ?? ''
      const msg = typeof info?.message !== 'undefined' ? String(info.message) : JSON.stringify(info)
      const prefix = label ? ` ${label}` : ''
      debug(`${level}${prefix}: ${msg}`)
      this.emit('logged', info)
    })
    if (next) next()
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
    const commonLabel = winston.format.label({ label: this.prefix })
    const format =
      process.env['JEST_WORKER_ID'] == undefined
        ? winston.format.combine(
            winston.format.timestamp(),
            commonLabel,
            winston.format.printf((info) => {
              const time = (info as any)['timestamp']
              const label = (info as any).label ?? (info as any).prefix ?? ''
              return `${time} ${info.level}${label ? ' ' + label : ''}: ${info.message}`
            })
          )
        : winston.format.combine(
            commonLabel,
            winston.format.printf((info) => {
              const label = (info as any).label ?? (info as any).prefix ?? ''
              return `${info.level}${label ? ' ' + label : ''}: ${info.message}`
            })
          )

    // Show logs on console in normal runtime; in Jest route through debug() (quiet unless DEBUG includes 'logger')
    const loggerTransport = process.env['JEST_WORKER_ID'] !== undefined ? new DebugTransport() : new winston.transports.Console()
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
