import type { Config } from 'jest'

const config: Config = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__', '<rootDir>/testHelpers'],
  transform: {
    '^.+\\.tsx+$': 'ts-jest',
  },
  testRegex: '/__tests__/(.*|(\\.|/)(test|spec))(\\.tsx)+$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  //  setupFiles: ["<rootDir>/.jest/setEnvVars.js"]
  collectCoverage: true,
  coverageDirectory: './',
  coveragePathIgnorePatterns: ['/node_modules/', '__test__/'],
  coverageReporters: ['json-summary'],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        suiteName: 'jest tests',
        outputDirectory: '.',
        outputName: 'junit.xml',
        uniqueOutputName: 'false',
        classNameTemplate: '{filename}',
        titleTemplate: '{title}',
        suiteNameTemplate: '{filename}',
      } as any,
    ],
  ],
}
export default config
