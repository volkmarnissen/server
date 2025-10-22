import { ImodbusEntityWithName } from "../src/angular/app/services/specificationInterface";
import {
  afterEachEntityHelper,
  beforeEachHelper as beforeEachEntityHelper,
  mountEntityComponent,
  setOnEntityNameOrVariableFieldsChangeFunc,
  setOnPostModbusEntityFunc
} from "./support/entityHelper";
import { ImodbusData, Inumber, Itext } from "../src/specification.shared";
import { Subject } from "rxjs";

describe("Entity Component tests", () => {
  beforeEach(beforeEachEntityHelper); // mounts entity and opens all expansion panels
  afterEach(afterEachEntityHelper);
  it("Set Variable Type and Entity", () => {
    cy.get('mat-select[formControlName="variableType"]')
      .click()
      .get("mat-option")
      .contains("Unit of Measurement")
      .click()
      .then(() => {
        // Validation will be called after value change of any name or variable field
        // onVariableEntityValueChange or onEntityNameValueChange
        setOnEntityNameOrVariableFieldsChangeFunc((entity) => {
          expect(entity.variableConfiguration).not.to.be.undefined;
          expect(entity.variableConfiguration?.entityId).not.to.be.undefined;
          expect(entity.variableConfiguration?.targetParameter).not.to.be
            .undefined;
          expect((entity as any).name).to.be.undefined;
        });
      });
    cy.get('mat-select[formControlName="variableEntity"]')
      .click()
      .get("mat-option")
      .contains("ent 4")
      .click();
    // This ensures, that EntityValidation was called because OnNameValueChange )
    cy.get('mat-select[formControlName="variableEntity"]').should(
      "not.be.null",
    );
    // append next line to any cy command to debug in chrome
    //  .then(()=>{debugger})
    cy.get('[formcontrolname="name"]').should("be.disabled");
  });
  it("No Variable Type => no variableConfiguration", () => {
    cy.get('mat-select[formControlName="variableType"]')
    .click()
    .get("mat-option")
    .first()
    .click()
    cy.get('input[formControlName="name"]').type("test")
    cy.get('input[formControlName="icon"]').click().then(()=>{setOnEntityNameOrVariableFieldsChangeFunc((entity) => {
        expect(entity.variableConfiguration).to.be.undefined;
        expect((entity as ImodbusEntityWithName).name).to.be.equal('test');
        })})
      cy.get('mat-select[formControlName="variableEntity"]').invoke('val')
      .then(val=>{    
        const myVal = val;      
        expect(myVal).to.equal('');
      })
    
      //cy.get('input[formControlName="name"]').should(
      //  "not.be.null");

      });
   it("Set Byte Order for Number", () => {
    cy.get('mat-select[formControlName="converter"]')
      .click()
      .get("mat-option")
      .first()
      .click().then(() => {
        // Validation will be called after value change of any name or variable field
        // onVariableEntityValueChange or onEntityNameValueChange
        setOnPostModbusEntityFunc((entity) => {
          expect((entity!.converterParameters! as Inumber).swapBytes).to.be.true;
          return new Subject<ImodbusData>();
        });
      });;
    cy.openAllExpansionPanels()
    cy.get('mat-slide-toggle[formControlName="swapBytes"]')
    .click()
      
  });
   it("Set Byte Order for Text", () => {
    cy.get('mat-select[formControlName="converter"]')
      .click()
      .get("mat-option")
      .eq(2)
      .click().then(() => {
        // Validation will be called after value change of any name or variable field
        // onVariableEntityValueChange or onEntityNameValueChange
        setOnPostModbusEntityFunc((entity) => {
          expect((entity!.converterParameters! as Itext).swapBytes, "swapBytes is not defined").not.to.be.undefined;
          expect((entity!.converterParameters! as Itext).swapBytes).to.be.true;
          return new Subject<ImodbusData>();
        });
  
      });;
    cy.openAllExpansionPanels()
      cy.get('[formControlName= "textSwapBytes"]')
      .click()
      
  });
});
// describe("Test for Modbus Address", () => {
//   beforeEach(()=>{mountEntityComponent(true)}); // mounts entity and opens all expansion panels
//   afterEach(afterEachEntityHelper);
//   it("Modbus address in hex", () => {
//     const inputField='input[formControlName="modbusAddress"]'
//     const matField='mat-form-field input[formControlName="modbusAddress"]'
//     cy.get(inputField).should('have.value', '0x4');
//     cy.get(inputField).clear().type('1234').blur().should('have.value', '0x4d2');
//     cy.get(inputField).clear().type('0X12s32').blur().should('have.value', '0x1232');
//     cy.get(inputField).clear().type('0xx7')
//     cy.get(inputField).parent().get( "mat-error").should('contain', 'dec or hex')
//   })
// });