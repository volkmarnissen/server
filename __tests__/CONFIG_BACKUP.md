# Test File Backup System

## Problem
Jest tests modify various configuration files during execution:
- `secrets.yaml`
- `busses/bus.0/s2.yaml`
- `specifications/files/waterleveltransmitter/files.yaml`

This can lead to inconsistent test results, a polluted test environment, and conflicts between parallel tests.

## Solution
Comprehensive, automatic backup/restore system for all test-relevant files with sequential test execution.

### Implementation

#### 1. FileBackupHelper - Base system (`__tests__/server/testhelper.ts`)
```typescript
export class FileBackupHelper {
  constructor(testName?: string)     // Unique test ID
  backup(filePath: string): void     // Back up a single file
  restore(filePath: string): void    // Restore a single file
  restoreAll(): void                 // Restore all files
  cleanup(): void                    // Remove all backups
}
```

#### 2. Specialized helper classes

**ConfigTestHelper** - For config-related tests:
```typescript
export class ConfigTestHelper {
  constructor(testName?: string)
  setup(): void      // Backs up secrets.yaml + bus files + specification files
  restore(): void    // Restores all files
  cleanup(): void    // Removes all backups
}
```

**SpecificationTestHelper** - For specification tests:
```typescript
export class SpecificationTestHelper {
  backupWaterLevelTransmitter(baseDir: string): void
  backupBusConfig(baseDir: string): void
  backupAll(baseDir: string): void
  restoreAll(): void
}
```

**MigrationTestHelper** - For migration tests:
```typescript
export class MigrationTestHelper {
  registerTempDir(dirPath: string): void
  backup(filePath: string): void
  cleanup(): void    // Cleans temporary directories + backups
}
```

#### 3. Jest configuration
**Sequential test execution** (`jest.config.ts`):
```typescript
export default {
  maxWorkers: 1,  // Prevents parallel test conflicts
  // ...
}
```

#### 4. Test integration

**Instance-based helpers** (no longer static):
```typescript
// config_test.tsx & httpserver_test.tsx
let configTestHelper: ConfigTestHelper

beforeAll(() => {
  configTestHelper = new ConfigTestHelper('test-name')
  configTestHelper.setup()
})

afterAll(() => {
  configTestHelper.restore()
})

// bus_test.tsx
let busTestHelper: FileBackupHelper

beforeEach(() => {
  busTestHelper = new FileBackupHelper()
  busTestHelper.backup('/path/to/s2.yaml')
  busTestHelper.backup('/path/to/files.yaml')
})

afterEach(() => {
  busTestHelper.restoreAll()
})
```

### Files backed up

#### Config tests (config_test.tsx, httpserver_test.tsx)
- ✅ `secrets.yaml`
- ✅ `busses/bus.0/s2.yaml`
- ✅ `specifications/files/waterleveltransmitter/files.yaml`

#### Bus tests (bus_test.tsx)
- ✅ `busses/bus.0/s2.yaml`
- ✅ `specifications/files/waterleveltransmitter/files.yaml`

#### Specification tests (configSpecification_test.tsx)
- ✅ `specifications/files/waterleveltransmitter/files.yaml`
- ✅ `busses/bus.0/s2.yaml`

#### Migration tests (CmdlineMigrate_test.tsx)
- ✅ Automatic cleanup of temporary test directories
- ✅ Backup of relevant files when needed

### Test results
- ✅ **134 tests pass** (21 test suites)
- ✅ **No backup files** left behind
- ✅ **Consistent values** between test runs
- ✅ **8 seconds** total runtime (sequential)
- ✅ **Complete test isolation**

### Benefits
- ✅ **Automatic backup/restore** for all relevant files
- ✅ **Prevents test interference** by running tests sequentially
- ✅ **Clean test environment** with no leftovers
- ✅ **Scalable** — easy to add more files
- ✅ **Unique test IDs** prevent backup collisions
- ✅ **Instance-based** — no more global state