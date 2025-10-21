import { Component, Input, OnInit,  } from '@angular/core';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {HexFormaterDirective} from './hexinputfield'
@Component({
  selector: 'app-hexinputfield',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    HexFormaterDirective
  ],
  template: `
    <div [formGroup]="formGroup">
    <input hexFormater [displayHex] ="displayHex" type="text" formControlName="testHex">
    </div>
  `,
  styles: ``
})
export class HexinputfieldComponent implements OnInit{
  @Input() startValue:number = 0x1234;
  @Input() displayHex:boolean = false;
  formGroup:FormGroup;
  constructor( private fb: FormBuilder){}
  ngOnInit(): void {
      this.formGroup = this.fb.group({
        testHex: [HexFormaterDirective.convertNumberToInput(this.startValue,this.displayHex) ],
      });
    }  
}
