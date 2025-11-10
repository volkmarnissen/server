import { expect, jest, describe, test } from '@jest/globals'
import { Logger, LogLevelEnum } from '../../src/specification/log'

describe('Logger wrapper (npmlog backend)', () => {
  test('initializes and logs in jest environment without throwing', () => {
    // Simulate jest environment
    process.env['JEST_WORKER_ID'] = '1'
    const logger = new Logger('specTest')

    expect(() => logger.log(LogLevelEnum.info, 'Hello %s', 'World')).not.toThrow()
    delete process.env['JEST_WORKER_ID']
  })

  test('initializes when not in jest', () => {
    delete process.env['JEST_WORKER_ID']
    const logger = new Logger('prodTest')
    expect(() => logger.log(LogLevelEnum.info, 'Prod message')).not.toThrow()
  })

  test('writes to test.log in jest when using log2File', () => {
    process.env['JEST_WORKER_ID'] = '1'
    const logger = new Logger('fileTest')
    logger.log2File('File %s', 'Entry')
    const fs = require('fs')
    const content = fs.readFileSync('test.log').toString()
    expect(content).toContain('File Entry')
    fs.unlinkSync('test.log')
    delete process.env['JEST_WORKER_ID']
  })
})
