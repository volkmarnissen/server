# Test File Backup System

## Problem
Jest Tests verändern verschiedene Konfigurationsdateien während der Ausführung:
- `secrets.yaml` 
- `busses/bus.0/s2.yaml`
- `specifications/files/waterleveltransmitter/files.yaml`

Dies kann zu inkonsistenten Test-Ergebnissen, verschmutzter Test-Umgebung und Konflikten zwischen parallelen Tests führen.

## Lösung
Umfassendes, automatisches Backup/Restore-System für alle test-relevanten Dateien mit sequenzieller Testausführung.

### Implementierung

#### 1. FileBackupHelper - Basis-System (`__tests__/server/testhelper.ts`)
```typescript
export class FileBackupHelper {
  constructor(testName?: string)     // Eindeutige Test-ID
  backup(filePath: string): void     // Einzelne Datei sichern
  restore(filePath: string): void    // Einzelne Datei wiederherstellen
  restoreAll(): void                 // Alle Dateien wiederherstellen
  cleanup(): void                    // Alle Backups löschen
}
```

#### 2. Spezialisierte Helper-Klassen

**ConfigTestHelper** - Für Config-relevante Tests:
```typescript
export class ConfigTestHelper {
  constructor(testName?: string)
  setup(): void      // Sichert secrets.yaml + Bus-Dateien + Specification-Dateien
  restore(): void    // Stellt alle Dateien wieder her
  cleanup(): void    // Löscht alle Backups
}
```

**SpecificationTestHelper** - Für Specification Tests:
```typescript
export class SpecificationTestHelper {
  backupWaterLevelTransmitter(baseDir: string): void
  backupBusConfig(baseDir: string): void
  backupAll(baseDir: string): void
  restoreAll(): void
}
```

**MigrationTestHelper** - Für Migration Tests:
```typescript
export class MigrationTestHelper {
  registerTempDir(dirPath: string): void
  backup(filePath: string): void
  cleanup(): void    // Räumt temporäre Verzeichnisse + Backups auf
}
```

#### 3. Jest Konfiguration
**Sequenzielle Testausführung** (`jest.config.ts`):
```typescript
export default {
  maxWorkers: 1,  // Verhindert parallele Test-Konflikte
  // ...
}
```

#### 4. Test-Integration

**Instanz-basierte Helper** (nicht mehr statisch):
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

### Gesicherte Dateien

#### Config Tests (config_test.tsx, httpserver_test.tsx)
- ✅ `secrets.yaml` 
- ✅ `busses/bus.0/s2.yaml`
- ✅ `specifications/files/waterleveltransmitter/files.yaml`

#### Bus Tests (bus_test.tsx)  
- ✅ `busses/bus.0/s2.yaml`
- ✅ `specifications/files/waterleveltransmitter/files.yaml`

#### Specification Tests (configSpecification_test.tsx)
- ✅ `specifications/files/waterleveltransmitter/files.yaml`
- ✅ `busses/bus.0/s2.yaml`

#### Migration Tests (CmdlineMigrate_test.tsx)
- ✅ Automatisches Cleanup temporärer Test-Verzeichnisse
- ✅ Backup relevanter Dateien bei Bedarf

### Test-Ergebnisse
- ✅ **134 Tests bestehen** (21 Test-Suites)
- ✅ **Keine Backup-Dateien** bleiben zurück
- ✅ **Konsistente Werte** zwischen Test-Läufen
- ✅ **8 Sekunden** Gesamtlaufzeit (sequenziell)
- ✅ **Vollständige Test-Isolation**

### Vorteile
- ✅ **Automatisches Backup/Restore** für alle relevanten Dateien
- ✅ **Verhindert Test-Interferenzen** durch sequenzielle Ausführung
- ✅ **Saubere Test-Umgebung** ohne Rückstände
- ✅ **Skalierbar** - einfach weitere Dateien hinzufügbar
- ✅ **Eindeutige Test-IDs** verhindern Backup-Konflikte
- ✅ **Instanz-basiert** - kein globaler Zustand mehr