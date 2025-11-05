import { beforeEachHelper, slaveAdded } from './support/modbusSlaveHelper'
import { apiUri } from '../src/server.shared'
describe('Select Slave tests', () => {
  beforeEach(beforeEachHelper) // mounts entity and opens all expansion panels

  //afterEach(afterEachEntityHelper);
  it('mount', () => {
    cy.intercept('POST', 'http://api/slave?busid=1', (req) => {
      //expect(req.body).to.include('Acme Company')
      switch (req.body.slaveid) {
        case 1:
          console.log(JSON.stringify(req.body))
          expect(req.body.pollMode).to.equal(0)
          expect(req.body.specificationid).to.equal('second')
          break
      }

      req.reply(req.body)
    })
    cy.intercept('GET', '**/' + apiUri.slaves.replace('/api/', '') + '*', {
      fixture: 'slaves.json',
    })
    cy.intercept('DELETE', 'http://api/slave?busid=1&slaveid=1', (req) => {
      req.reply({})
    })
    cy.get('mat-select[formControlName="specificationid"]')
      .click({ force: true })
      .get('mat-option')
      .contains('AdditionalTxt')
      .should('not.be.null')

    cy.get('mat-select[formControlName="specificationid"]')
      .click({ force: true })
      .get('mat-option')
      .contains('Second')
      .click({ force: true })
    cy.get('mat-selection-list[formControlName="discoverEntitiesList"]').get('mat-option:contains(entity1)').should('not.be.null')
    cy.get('mat-select[formControlName="pollMode"]')
      .click({ force: true })
      .get('mat-option')
      .contains('Interval')
      .click({ force: true })
    cy.get('div.card-header-buttons button.save-button').click({ force: true })

    cy.get('div.card-header-buttons button.delete-button:first').click({
      force: true,
    })
  })
  it('add slave', () => {
    cy.intercept('POST', 'http://api/slave?busid=1', (req) => {
      //expect(req.body).to.include('Acme Company')
      switch (req.body.slaveid) {
        case 1:
          console.log(JSON.stringify(req.body))
          expect(req.body.pollMode).to.equal(0)
          expect(req.body.specificationid).to.equal('second')
          break
        case 2:
          slaveAdded()
          break
      }

      req.reply(req.body)
    })
    cy.get('input[name="slaveId"]').type('2', { force: true })
    cy.get('div.card-header-buttons button[mattooltip="Add Modbus Slave"]').click({ force: true })
    cy.get('mat-select[formControlName="specificationid"]')
      .click({ force: true })
      .get('mat-option')
      .contains('Second')
      .should('not.be.null')
  })
})
