import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { EventEmitter } from '@angular/core'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { apiUri } from '../../src/server.shared'
import { SelectSlaveComponent } from '../../src/angular/app/select-slave/select-slave.component'
import { from } from 'rxjs'
let ev = new EventEmitter<number | undefined>()
// entityApiService.getConfiguration {mqttbasetopic rootUrl apiUri.configuration
// entityApiService.getBus  bus.connectionData, bus.busId apiUri.bus
// entityApiService.getSlaves Islave[] apiUri.slaves
// getSpecsForSlave IidentificationSpecification[] apiUri.specsDetection
// not implemented yet deleteSlave
// not implemented yet postSlave

var _slaveAdded = false
export function slaveAdded() {
  _slaveAdded = true
}

function buildReply(): any {
  if (_slaveAdded)
    return {
      statusCode: 202,
      delay: 100,
      body: [
        {
          filename: 's2',
          name: 'Slave 2',
          status: 0,
          entities: [
            {
              id: 1,
              name: 'entity1',
              readonly: true,
              mqttname: 'e1',
            },
          ],
          identified: 1,
        },
        {
          filename: 's2second',
          name: 'S2 Second',
          status: 0,
          entities: [
            {
              id: 1,
              name: 's2.second.entity1',
              readonly: true,
              mqttname: 's2e1',
            },
          ],
          identified: 1,
        },
      ],
    }
  else
    return {
      statusCode: 202,
      delay: 100,
      body: [
        {
          filename: 'dimplexpco5',
          name: 'Dimplex Heat Pump',
          status: 0,
          entities: [
            {
              id: 1,
              name: 'entity1',
              readonly: true,
              mqttname: 'e1',
            },
          ],
          identified: 1,
        },
        {
          filename: 'second',
          name: 'Second',
          status: 0,
          entities: [
            {
              id: 1,
              name: 'second.entity1',
              readonly: true,
              mqttname: 'se1',
            },
          ],
          identified: 1,
        },
      ],
    }
}
/**
 * mounts the specification-entity-component and opens all expansion panels
 *
 * The entity values must be changed in the UI using cypress methods
 *
 * The Modbus Value is a 32 bit array. It can be changed in specificationMethods.postModbusEntity if required
 *
 * If other initial values are required, a new test file is required
 */
export function beforeEachHelper() {
  let detection: any = undefined
  cy.intercept('GET', '**/' + apiUri.specsDetection.replace('/api/', '') + '*', (req) => {
    req.alias = 'detection'

    req.reply(buildReply())
  })
  cy.intercept('GET', '**/' + apiUri.configuration.replace('/api/', ''), {
    fixture: 'configuration.json',
  })
  cy.intercept('GET', '**/' + apiUri.bus.replace('/api/', '') + '*', {
    fixture: 'bus.json',
  })
  cy.intercept('GET', '**/' + apiUri.specifications.replace('/api/', '') + '*', {
    fixture: 'specifications.json',
  })
  // This configures the rootUrl for /api... calls
  // they need to be relative in ingress scenarios,
  // but they must be absolute for cypress tests
  cy.window().then((win) => {
    ;(win as any).configuration = { rootUrl: '/' }
  })
  cy.mount(SelectSlaveComponent, {
    imports: [NoopAnimationsModule],
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          params: from([{ busid: 1 }]),
        },
      },
    ],
    componentProperties: {
      slaveidEventEmitter: ev,
    },
  })
}
