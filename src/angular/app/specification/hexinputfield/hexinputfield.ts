import { Directive, HostListener, ElementRef, OnInit, Input } from '@angular/core';

import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'hexFormaterPipe' })
export class HexFormaterPipe implements PipeTransform {
  transform(value: number, hexFormat:boolean): string {
    if( hexFormat)
      return "0x" + value.toString(16);
    else
      return value.toString();
  }
}

@Directive({ 
    selector: '[hexFormater]', 
})
export class HexFormaterDirective implements OnInit {
    private el: HTMLInputElement;
  @Input() displayHex:boolean;
  constructor(
    private elementRef: ElementRef,
  ) {
    this.el = this.elementRef.nativeElement;
  }

  static convertHexInput(value:string):number| undefined{
    if(value=="")
        return undefined;
    var nv =  (value.startsWith("0x")||value.startsWith("0X")? parseInt(value.substring(2),16):parseInt(value))
    if( Number.isNaN(nv))
      return undefined;
    return nv;
  }
  static convertNumberToInput(value:number| undefined, displayHex:boolean):string| undefined{
    if( value == undefined|| Number.isNaN(value))
      return undefined
    return (displayHex? "0x" + value.toString(16):value.toString())
  }

  ngOnInit() {
    this.onFocus(this.el.value);
  }

  @HostListener("focus", ["$event.target.value"])
  @HostListener("blur", ["$event.target.value"])
  onFocus(value:string) {
    var numValue = HexFormaterDirective.convertHexInput(value)
    if( numValue != undefined)
      this.el.value = HexFormaterDirective.convertNumberToInput(numValue,this.displayHex) as string
  }
}
