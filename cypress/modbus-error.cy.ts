import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { provideRouter } from '@angular/router'

import { ModbusErrorComponent } from '../src/angular/app/modbus-error/modbus-error.component'
import { ImodbusStatusForSlave, ModbusErrorStates, ModbusTasks } from '../src/server.shared'
import { ModbusRegisterType } from '../src/specification.shared'

let date = Date.now()
let modbusErrors: ImodbusStatusForSlave = {
  errors: [
    {
      task: ModbusTasks.specification,
      date: date,
      address: { address: 1, registerType: ModbusRegisterType.HoldingRegister },
      state: ModbusErrorStates.crc,
    },
  ],
  requestCount: [0, 1, 2, 3, 4, 5, 6, 7],
  queueLength: 23,
}
function mount(currentDate: number) {
  // This configures the rootUrl for /api... calls
  // they need to be relative in ingress scenarios,
  // but they must be absolute for cypress tests
  cy.window().then((win) => {
    ;(win as any).configuration = { rootUrl: '/' }
  })
  cy.mount(ModbusErrorComponent, {
    providers: [provideHttpClient(withInterceptorsFromDi()), provideRouter([])],
    autoDetectChanges: true,
    componentProperties: {
      modbusErrors: modbusErrors,
      currentDate: date + 30 * 1000,
    },
  })

  // This configures the rootUrl for /api... calls
  // they need to be relative in ingress scenarios,
  // but they must be absolute for cypress tests
  cy.window().then((win) => {
    ;(win as any).configuration = { rootUrl: '/' }
  })
  cy.mount(ModbusErrorComponent, {
    providers: [provideHttpClient(withInterceptorsFromDi()), provideRouter([])],
    autoDetectChanges: true,
    componentProperties: {
      modbusErrors: modbusErrors,
      currentDate: currentDate,
    },
  })
}
describe('Modbus Error Component tests', () => {
  it('can mount 30 seconds after last error', () => {
    mount(date + 30 * 1000)
    cy.get('mat-panel-description:first').should('contain', '30 seconds ago')
  })

  it('can mount 90 seconds after last error', () => {
    mount(date + 90 * 1000)
    cy.get('mat-panel-description:first').should('contain', '1:30 minutes ago')
  })
})
