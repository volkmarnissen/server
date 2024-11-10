describe('End to End Test', () => {
  before(() => {
    // reset and seed the database prior to every test
    cy.exec('npm run e2e:reset')
  })
  it('register->mqtt->busses->slaves->specification', () => {
    cy.visit('http://localhost:3000/')
    cy.get('[formcontrolname="username"]').type("test");
    cy.get('[formcontrolname="password"]').type("test");
    cy.get("form").submit();
    cy.url().should('contain', '/configure')
    cy.get('[formcontrolname="mqttserverurl"]').type("mqtt://localhost:3001",{force:true});
    cy.get('[formcontrolname="mqttuser"]').type("homeassistant",{force:true});
    cy.get('[formcontrolname="mqttpassword"]').type("homeassistant",{force:true});
    cy.get('[formcontrolname="mqttpassword"]').trigger('change')
    cy.get('div.saveCancel button:first').click();
    cy.url().should('contain', '/busses')
    cy.get('[role="tab"] ').eq(1).click();
    cy.get('[formcontrolname="host"]').type("localhost",{force:true});
    cy.get('[formcontrolname="port"]').type("{backspace}{backspace}{backspace}3002",{force:true});
    cy.get('[formcontrolname="timeout"]').eq(0).type("{backspace}{backspace}{backspace}500",{force:true});
    cy.get('[formcontrolname="host"]').trigger('change')
    cy.get('div.card-header-buttons button:first').click();    
    // List slaves second header button on first card
    cy.get('div.card-header-buttons:first button').eq(1).click();    
    cy.url().should('contain', '/slaves')
    cy.get('[formcontrolname="slaveId"]').type("3{enter}",{force:true})
    // Show specification third header button on first card
    cy.get('div.card-header-buttons:first button').eq(2).click();    
    cy.url().should('contain', '/specification')
  })
})