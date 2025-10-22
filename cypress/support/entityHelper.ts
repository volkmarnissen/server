import {
  provideHttpClient,
  withInterceptorsFromDi,
} from "@angular/common/http";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import {
  IdentifiedStates,
  ImodbusData,
  ImodbusEntity,
  Iselect,
} from "../../src/specification.shared";
import { ISpecificationMethods } from "../../src/angular/app/services/specificationInterface";
import { EntityComponent } from "../../src/angular/app/specification/entity/entity.component";
import { Observable, Subject } from "rxjs";

import { mount } from 'cypress/angular'

/**
 * specification methods
 */
export let specificationMethods: ISpecificationMethods = {
  getCurrentMessage: () => {
    return { type: 0, category: 0 };
  },
  getMqttLanguageName: () => {
    return "english";
  },
  getUom: (entity_id: number): string => {
    return "cm";
  },
  getNonVariableNumberEntities: () => {
    return [{ id: 4, name: "ent 4" }];
  },
  getMqttNames: () => {
    return [];
  },
  getSaveObservable: () => {
    return new Subject<void>();
  },
  postModbusEntity: () => {
    return new Subject<ImodbusData>();
  },
  postModbusWriteMqtt: () => {
    return new Subject<string>();
  },
  hasDuplicateVariableConfigurations: () => {
    return false;
  },
  canEditEntity: () => {
    return true;
  },
  setEntitiesTouched: () => {},
  addEntity: () => {},
  deleteEntity: () => {},
  copy2Translation: () => {},
};
/**
 * Sets a function to be called after value change of any name or variable field
 *
 * Can be used to validate the current entity
 *
 * Make sure to reset the function after validation, because it will be called with other changes as well
 *
 * @param valFunc: No argument will reset the function to do nothing
 * @param valFunc: The new validation function
 */
export function setOnEntityNameOrVariableFieldsChangeFunc(
  valFunc?: (entity: ImodbusEntity) => void,
) {
  if (valFunc) specificationMethods.copy2Translation = valFunc;
  else specificationMethods.copy2Translation = () => {};
}
export function setOnPostModbusEntityFunc(
  valFunc?: (entity: ImodbusEntity|undefined) => Observable<ImodbusData>
) {
  if (valFunc) specificationMethods.postModbusEntity = valFunc;
  else specificationMethods.postModbusEntity = () => {return new Subject<ImodbusData>()};
}


let selectEntity: ImodbusEntity = {
  id: 1,
  modbusValue: [4, 1, 1, 1],
  mqttValue: "ent 4",
  identified: IdentifiedStates.identified,
  converter: "select",
  readonly: false,
  registerType: 3,
  modbusAddress: 4,
  converterParameters: {} as Iselect,
};
/**
 * mounts the specification-entity-component and opens all expansion panels
 *
 * The entity values must be changed in the UI using cypress methods
 *
 * The Modbus Value is a 32 bit array. It can be changed in specificationMethods.postModbusEntity if required
 *
 * If other initial values are required, a new test file is required
 */
export function mountEntityComponent(displayHex:boolean) {
  cy.intercept("GET", "**/converters", {
    fixture: "converters.json",
  });
  // This configures the rootUrl for /api... calls
  // they need to be relative in ingress scenarios,
  // but they must be absolute for cypress tests
  cy.window().then((win) => {
    (win as any).configuration = { rootUrl: "/" };
  });
  cy.mount(EntityComponent, {
    imports: [NoopAnimationsModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideRouter([])],
    componentProperties: {
      specificationMethods: specificationMethods,
      entity: selectEntity,
      disabled: false,
      displayHex:displayHex
    },
  });
  cy.openAllExpansionPanels();
}

export function beforeEachHelper() {
  mountEntityComponent(false);
}
/**
 * resets the function set by setOnEntityNameOrVariableFieldsChangeFunc
 *
 */
export function afterEachEntityHelper() {
  // reset specificationMethods
  setOnEntityNameOrVariableFieldsChangeFunc();
  setOnPostModbusEntityFunc();
}
