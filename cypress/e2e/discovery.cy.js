let prefix = ''
let defaultm2mPort = 3005
let mqttAuthorizedPort = 3001
let mqttUnAuthorizedPort = 3003

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
function setUrls(){
  cy.get('app-upload-files:first mat-expansion-panel-header').eq(0).click()
  cy.get('app-upload-files:first input[type!="file"]').eq(0).focus().type('http://localhost/test.pdf{enter}', { force: true })
  cy.get('app-upload-files:first button mat-icon:contains("add")').eq(0).click({ force: true })

  cy.get('app-upload-files:first mat-expansion-panel-header').eq(1).click()
  cy.get('app-upload-files:first input[type!="file"]').eq(1).focus().type('http://localhost/test.png{enter}', { force: true })
  cy.get('app-upload-files:first button mat-icon:contains("add")').eq(1).click({ force: true })
}
function addEntity(){
  cy.get('app-entity:first mat-expansion-panel-header').eq(0).click()
  cy.get('app-entity:first [formcontrolname="name"]').type('the entity{enter}', { force: true })
  cy.get('app-entity:first [formcontrolname="modbusAddress"]').type('{backspace}1{enter}', { force: true })
  cy.get('app-entity:first mat-select[formControlName="converter"]').click().get('mat-option').contains('number').click();
  cy.get('app-entity:first mat-expansion-panel-header').eq(1).click()
  cy.get('app-entity:first [formcontrolname="min"]').type('0', { force: true })
  cy.get('app-entity:first [formcontrolname="max"]').type('100', { force: true })
  cy.get('app-entity:first mat-select[formControlName="registerType"]').click().get('mat-option').contains('Holding').click();
  cy.get('app-entity mat-card mat-card-header button:has(mat-icon:contains("add_circle"))').click({ force: true })
  //body > app-root > app-specification > div.flexrowsWrapWhenSmall > div > div > app-entity > mat-card > mat-card-header > div > mat-card-title > div > div
  cy.get('div.saveCancel:first button').eq(0).should("not.is.disabled")

  cy.get('div.saveCancel:first button').eq(0).trigger("click").trigger("click")
  
}
function addSlave() {
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="slaveId"]').type('10{enter}', { force: true })
  // Show specification third header button on first card
  cy.get('[formcontrolname="detectSpec"]').click()
  cy.get('div.card-header-buttons:first button:contains("add_box")').eq(0).click()
  cy.url().should('contain', prefix + '/specification')
}
function validateMqtt(){
  return new Promise((resolve)=>{
    cy.task('mqttResetTopicAndPayloads').then(()=>{
      cy.task('mqttGetTopicAndPayloads').then((tAndP) => {
        cy.log('tAndP ' + JSON.stringify(tAndP))
      })})
  })
}
describe('MQTT Discovery Tests', () => {
  it(
    'mqtt hassio addon',
    {
      retries: {
        runMode: 3,
        openMode: 1,
      },
    },
    () => {
      cy.exec('npm run e2e:reset')
      prefix = 'modbus2mqtt'
      cy.visit('http://localhost:80/' + prefix)
      // monitor discovery topics
      let mqttConnect = Cypress.env('mqttconnect')
      assert(mqttConnect != undefined)
      cy.task('mqttConnect', mqttConnect).then(() => {
        cy.task('mqttSubscribe', 'homeassistant/#').then((tAndP) => {
          cy.log('connected')
          runBusses()
          addSlave()
          cy.get('#specForm [formcontrolname="name"]').type('the spec{enter}', { force: true })

          setUrls()
          addEntity()
        
//          cy.task('mqttGetTopicAndPayloads').then((tAndP) => {
//            cy.log('tAndP ' + JSON.stringify(tAndP))
//          })
      })
    })
    }
  )
})
