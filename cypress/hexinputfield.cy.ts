import { HexinputfieldComponent } from '../src/angular/app/specification/hexinputfield/hexinputfield.test.component'

function mount(startValue: number, displayHex: boolean) {
  cy.mount(HexinputfieldComponent, {
    autoDetectChanges: true,
    componentProperties: {
      displayHex: displayHex,
      startValue: startValue,
    },
  })
}
const inputField = 'input[formControlName="testHex"]'
describe('Hexinputfield Component tests', () => {
  it('Show decimal', () => {
    mount(0x1234, false)
    cy.get(inputField).should('have.value', '4660')
    cy.get(inputField).clear().type('1234').should('have.value', '1234')
    cy.get(inputField).clear().type('0x1234').blur().should('have.value', '4660')
  })
  it('Show Hex', () => {
    mount(0x1234, true)
    cy.get(inputField).should('have.value', '0x1234')
    cy.get(inputField).clear().type('4660').blur().should('have.value', '0x1234')
    cy.get(inputField).clear().type('0x1234').blur().should('have.value', '0x1234')
  })
})
