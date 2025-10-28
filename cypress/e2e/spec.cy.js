let prefix = ''

function runRegister(authentication, port) {
  if( prefix.length )
    cy.visit('http://localhost:' + Cypress.env('nginxAddonHttpPort') +'/' + prefix)
  else
    if(port != undefined )
        cy.visit('http://localhost:' + port )
    else
        cy.visit('http://localhost:' + Cypress.env('modbus2mqttE2eHttpPort'))
  if (authentication) {
    cy.get('[formcontrolname="username"]').type('test')
    cy.get('[formcontrolname="password"]').type('test')
    cy.get('button[value="authentication"]').click()
  } else cy.get('button[value="noAuthentication"]').click()
  cy.url().should('contain', prefix + '/configure')
}
function runConfig(authentication) {
  let port = authentication ? Cypress.env('mosquittoAuthMqttPort') : Cypress.env('mosquittoNoAuthMqttPort')
  cy.get('[formcontrolname="mqttserverurl"]').type('mqtt://localhost:' + port, { force: true })
  cy.get('[formcontrolname="mqttserverurl"]').trigger('change')
  if (authentication) {
    cy.get('[formcontrolname="mqttuser"]').type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').trigger('change')
  }
  cy.get('div.saveCancel button:first').click({ force: true })
  cy.url().should('contain', prefix + '/busses')
}

function runBusses() {
  cy.url().should('contain', prefix + '/busses')
  cy.get('[role="tab"] ').eq(1).click()
  cy.get('[formcontrolname="host"]').type('localhost', { force: true })
  cy.get('[formcontrolname="port"]').type('{backspace}{backspace}{backspace}3002', { force: true })
  cy.get('[formcontrolname="timeout"]').eq(0).type('{backspace}{backspace}{backspace}500', { force: true })
  cy.get('[formcontrolname="host"]').trigger('change')
  cy.get('div.card-header-buttons button:first').click()
  // List slaves second header button on first card
  cy.get('div.card-header-buttons:first button').eq(1).click()
}

function addSlave(willLog) {
  let logSetting = { log: willLog }
  cy.log('Add Slave ')
  cy.task('log','Add Slave' )
  cy.url().then((url)=>{
  cy.task('log',url )

  })
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="detectSpec"]', logSetting).click(logSetting)
  cy.get('[formcontrolname="slaveId"]', logSetting).type('3{enter}', { force: true, log: willLog })
  cy.get('app-select-slave:first mat-expansion-panel-header[aria-expanded=false]', logSetting).then((elements) => {
    if (elements.length >= 1) {
      elements[0].click(logSetting)
    }
    if (elements.length >= 2) {
      elements[1].click(logSetting)
    }
  })

  cy.get('app-select-slave:first mat-select[formControlName="pollMode"]', logSetting)
    .click()
    .get('mat-option')
    .contains('No polling')
    .click(logSetting)
  cy.get('div.card-header-buttons:first button:contains("check_circle")', logSetting).eq(0, logSetting).click(logSetting)
  // Show specification third header button on first card
  cy.get('div.card-header-buttons:first button:contains("add_box")', logSetting).eq(0, logSetting).click(logSetting)

  cy.url().should('contain', prefix + '/specification')
}
describe('End to End Tests', () => {
  before(() => {
    let logSetting = { log: false }
  })
  after(() => {
    let logSetting = { log: false }
    // wait for all tests then 
  })

  it(
    'register->mqtt->busses->slaves->specification with authentication',
    {
      retries: {
        runMode: 3,
        openMode: 1,
      },
    },
    () => {

      runRegister(true)
      runConfig(true)
      runBusses()
      addSlave(true)
    }
  )
  it(
    'register->mqtt with no authentication',
    {
      retries: {
        runMode: 3,
        openMode: 1,
      },
    },
    () => {
      runRegister(false, Cypress.env('modbus2mqttMqttNoAuthPort'))
      runConfig(false)
    }
  )
  it(
    'mqtt hassio addon',
    {
      retries: {
        runMode: 3,
        openMode: 1,
      },
    },
    () => {
      prefix = 'ingress'
      cy.visit('http://localhost:' + Cypress.env('nginxAddonHttpPort') +'/' + prefix)
      runBusses()
    }
  )
})
