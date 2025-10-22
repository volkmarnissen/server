import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ModbusErrorComponentComponent } from "./modbus-error-component.component";

describe("ModbusErrorComponentComponent", () => {
  let component: ModbusErrorComponentComponent;
  let fixture: ComponentFixture<ModbusErrorComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModbusErrorComponentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ModbusErrorComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
