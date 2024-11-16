
let prefix = ''
let defaultm2mPort = 3005
let mqttAuthorizedPort = 3001
let mqttUnAuthorizedPort = 3003

function runRegister(authentication, port) {
  cy.visit('http://localhost:' + port + '/' + prefix)
  if (authentication) {
    cy.get('[formcontrolname="username"]').type('test')
    cy.get('[formcontrolname="password"]').type('test')
    cy.get('button[value="authentication"]').click()
  } else cy.get('button[value="noAuthentication"]').click()
  cy.url().should('contain', prefix + '/configure')
}
function runConfig(authentication) {
  let port = authentication ? mqttAuthorizedPort : mqttUnAuthorizedPort
  cy.get('[formcontrolname="mqttserverurl"]').type('mqtt://localhost:' + port, { force: true })
  cy.get('[formcontrolname="mqttserverurl"]').trigger('change')
  if (authentication) {
    cy.get('[formcontrolname="mqttuser"]').type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').trigger('change')
  }
  cy.get('div.saveCancel button:first').click()
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

function runSlaves() {
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="slaveId"]').type('3{enter}', { force: true })
  // Show specification third header button on first card
  cy.get('div.card-header-buttons:first button').eq(2).click()
  cy.url().should('contain', prefix + '/specification')
}


describe('End to End Tests', () => {
  it('register->mqtt->busses->slaves->specification with authentication',{
    retries: {
      runMode: 3,
      openMode: 1,
    },
  }, () => {
    cy.exec('npm run e2e:reset')
    runRegister(true, defaultm2mPort)
    runConfig(true)
    runBusses()
    runSlaves()
  })
  it('register->mqtt with no authentication',{
      retries: {
        runMode: 3,
        openMode: 1,
      },
    }, () => {
    cy.exec('npm run e2e:reset')
    runRegister(false, defaultm2mPort)
    runConfig(false)
  })
  it('mqtt hassio addon',{
    retries: {
      runMode: 3,
      openMode: 1,
    },
  }, () => {
    cy.exec('npm run e2e:reset')
    prefix = 'modbus2mqtt'
    cy.visit('http://localhost:80/' + prefix)
    runBusses()
  })
})
