import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common'
import { Component, Input, OnInit } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'
import { MatOption } from '@angular/material/core'
import { MatFormField, MatLabel } from '@angular/material/form-field'
import { MatIcon, MatIconModule } from '@angular/material/icon'
import { MatInput } from '@angular/material/input'
import { MatSelect } from '@angular/material/select'
import { MatTabGroup, MatTab } from '@angular/material/tabs'
import { MatTooltip } from '@angular/material/tooltip'
import {
  Iconfiguration,
  ImodbusErrorsForSlave,
  ImodbusStatusForSlave,
  ModbusErrorStates,
  ModbusTasks,
} from '../../../server.shared'
import { ApiService } from '../services/api-service'
import { MatExpansionModule, MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion'
import { ModbusRegisterType } from '../../../specification.shared'
const oneMinuteInMs = 60 * 1000
@Component({
  selector: 'app-modbus-error-component',
  imports: [MatIconModule, NgFor, NgTemplateOutlet, MatExpansionModule],
  standalone: true,
  templateUrl: './modbus-error.component.html',
  styleUrl: './modbus-error.component.css',
})
export class ModbusErrorComponent implements OnInit {
  config: Iconfiguration
  @Input({ required: true }) modbusErrors: ImodbusStatusForSlave | undefined
  @Input({ required: false }) currentDate: number | undefined = undefined

  tasksToCount: ModbusTasks[] = [ModbusTasks.poll, ModbusTasks.specification]

  tasksToLog: ModbusTasks[] = [ModbusTasks.poll, ModbusTasks.specification]
  constructor(private entityApiService: ApiService) {}
  ngOnInit(): void {
    setInterval(() => {
      this.currentDate = Date.now()
    }, 60 * 1000)
  }
  getTaskName(task: ModbusTasks): string {
    switch (task) {
      case ModbusTasks.deviceDetection:
        return 'Device Detection'
      case ModbusTasks.specification:
        return 'Specification'
      case ModbusTasks.entity:
        return 'Entity'
      case ModbusTasks.writeEntity:
        return 'Write Entity'
      case ModbusTasks.poll:
        return 'Poll'
      case ModbusTasks.initialConnect:
        return 'Initial Connect'
      default:
        return 'unknown'
    }
  }
  getRegisterTypeName(reg: ModbusRegisterType): string {
    switch (reg) {
      case ModbusRegisterType.AnalogInputs:
        return 'Analog Input'
      case ModbusRegisterType.Coils:
        return 'Coils'
      case ModbusRegisterType.DiscreteInputs:
        return 'Discrete Inputs'
      case ModbusRegisterType.HoldingRegister:
        return 'Holding Registers'
      default:
        return 'Unknown'
    }
  }
  getCurrentDate(): number {
    if (this.currentDate == undefined) return Date.now()
    return this.currentDate
  }
  getMinAgo(mins: number): Date {
    let date = new Date(this.getCurrentDate())

    let dt = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      -mins + date.getMinutes(),
      date.getSeconds()
    )
    return dt
  }

  getErrorStateName(task: ModbusErrorStates): string {
    switch (task) {
      case ModbusErrorStates.crc:
        return 'CRC Error'
      case ModbusErrorStates.illegaladdress:
        return 'Illegal Address'
      case ModbusErrorStates.illegalfunctioncode:
        return 'Illegal Function Code'
      case ModbusErrorStates.timeout:
        return 'Timeout'
      case ModbusErrorStates.other:
        return 'Other'
      case ModbusErrorStates.initialConnect:
        return 'Initial Connect'
      default:
        return 'unknown'
    }
  }

  filterLast(inValue: ImodbusErrorsForSlave[]): ImodbusErrorsForSlave[] {
    if (inValue == undefined || inValue.length == 0) return []
    let last: ImodbusErrorsForSlave = inValue[0]
    inValue.forEach((e) => {
      if (e.date > last.date) last = e
    })
    return [last]
  }
  filterNewerThan(inValue: ImodbusErrorsForSlave[], compareDate: Date): ImodbusErrorsForSlave[] {
    if (inValue == undefined || inValue.length == 0) return []
    let last: ImodbusErrorsForSlave = inValue[0]
    return inValue.filter((e) => e.date > compareDate.getTime())
  }
  filterTask(inValue: ImodbusErrorsForSlave[], compareTask: ModbusTasks): ImodbusErrorsForSlave[] {
    if (inValue == undefined || inValue.length == 0) return []
    return inValue.filter((e) => e.task == compareTask)
  }
  filterErrorState(inValue: ImodbusErrorsForSlave[], compareState: ModbusErrorStates): ImodbusErrorsForSlave[] {
    if (inValue == undefined || inValue.length == 0) return []
    return inValue.filter((e) => e.state == compareState)
  }
  getErrorStates(inValue: ImodbusErrorsForSlave[]): ModbusErrorStates[] {
    if (inValue == undefined || inValue.length == 0) return []
    let states: ModbusErrorStates[] = []
    inValue.forEach((e) => {
      if (!states.includes(e.state)) states.push(e.state)
    })
    return states
  }
  getErrors(inValue: ImodbusErrorsForSlave[]): string[] {
    let rc: {
      registerType: ModbusRegisterType
      addresses: { address: number; count: number }[]
    }[] = []
    let previous: ImodbusErrorsForSlave = {
      address: { address: -1, registerType: ModbusRegisterType.AnalogInputs },
      task: ModbusTasks.initialConnect,
      state: ModbusErrorStates.noerror,
      date: 0,
    }
    if (inValue != undefined)
      inValue.forEach((v) => {
        if (v.address.address != previous.address.address || v.address.registerType != previous.address.registerType) {
          let foundRgType = rc.find((rcv) => v.address.registerType == rcv.registerType)
          if (foundRgType) {
            let foundAddr = foundRgType.addresses.find((a) => v.address.address == a.address)
            if (foundAddr) foundAddr.count++
            else
              foundRgType.addresses.push({
                address: v.address.address,
                count: 1,
              })
          } else
            rc.push({
              registerType: v.address.registerType,
              addresses: [{ address: v.address.address, count: 1 }],
            })
        }
      })
    let rcs: string[] = []
    rc.forEach((v) => {
      let r: string = this.getRegisterTypeName(v.registerType) + ': ['
      let addr: string[] = []
      v.addresses.forEach((a) => {
        addr.push(a.address + ': ' + a.count)
      })
      r += addr.join(', ') + ']\n'
      rcs.push(r)
    })
    return rcs
  }
  getSinceTimeString(errorList: ImodbusErrorsForSlave[]): string {
    if (errorList == undefined) return 'XX'
    let delta = this.getCurrentDate() - errorList[errorList.length - 1].date
    let minutes = Math.floor(delta / oneMinuteInMs)
    let seconds = Math.floor((delta / 1000) % 60)
    if (delta > oneMinuteInMs) return '' + minutes + ':' + seconds + ' minutes ago'
    else return '' + seconds + ' seconds ago'
  }
}
