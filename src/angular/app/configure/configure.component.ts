import { OnInit, Component, EventEmitter, Output } from '@angular/core'
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  Validators,
  FormsModule,
  ReactiveFormsModule,
  ValidatorFn,
  ValidationErrors,
} from '@angular/forms'
import { ApiService } from '../services/api-service'
import { Iconfiguration, IUserAuthenticationStatus } from '../../../server.shared'
import { Observable, Subscription } from 'rxjs'
import { ActivatedRoute, Router } from '@angular/router'
import { MatOption } from '@angular/material/core'
import { MatSelect } from '@angular/material/select'
import { NgIf, NgFor, NgClass } from '@angular/common'
import { MatInput } from '@angular/material/input'
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field'
import { MatStepLabel } from '@angular/material/stepper'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'

@Component({
  selector: 'app-configure',
  templateUrl: './configure.component.html',
  styleUrls: ['./configure.component.css'],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    FormsModule,
    ReactiveFormsModule,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatStepLabel,
    MatFormField,
    MatLabel,
    MatInput,
    NgIf,
    MatError,
    MatSelect,
    NgFor,
    MatOption,
    NgClass,
  ],
  standalone: true,
})
export class ConfigureComponent implements OnInit {
  config: Iconfiguration
  @Output() isMqttConfiguredEvent = new EventEmitter<boolean>()

  constructor(
    private _formBuilder: FormBuilder,
    private entityApiService: ApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.ghPersonalAccessToken = _formBuilder.control([''])
    this.debugComponentsFormControl = _formBuilder.control([''])
  }
  private requiredInNonAddonScenario: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    {
      if (this.authStatus && !this.authStatus.hassiotoken) return Validators.required(control)
      else return null
    }
  }
  saveDisabled() {
    // connected or empty serverurl value

    return (
      (this.mqttConnectIcon != 'cast_connected' && this.authStatus && !this.authStatus.hassiotoken) ||
      (this.configureMqttFormGroup.pristine &&
        this.ghPersonalAccessToken.pristine &&
        this.debugComponentsFormControl.pristine &&
        this.discoveryLanguageFormControl.pristine)
    )
  }
  configObservable = this.entityApiService.getConfiguration()
  sslFiles: string[] = []
  sub: Subscription
  mqttConnectIcon: string = 'cast'
  mqttConnectClass: string = 'redIcon'
  mqttConnectMessage: string = 'unknown'
  authStatus: IUserAuthenticationStatus | undefined = undefined
  configureMqttFormGroup = this._formBuilder.group({
    mqttserverurl: [null as string | null, this.requiredInNonAddonScenario],
    mqttuser: [null as string | null],
    mqttpassword: [null as string | null],
    mqttkeyfile: [null as string | null],
    mqttcafile: [null as string | null],
  })
  ghPersonalAccessToken: FormControl
  debugComponentsFormControl: FormControl
  discoveryLanguageFormControl = new FormControl<string | null>(null)
  connectMessage: string = ''
  ngOnInit(): void {
    this.configObservable.subscribe((config) => {
      this.config = config
      if (config.mqttconnect.mqttserverurl) {
        this.configureMqttFormGroup.get('mqttserverurl')!.setValue(config.mqttconnect.mqttserverurl)
      }
      if (config.mqttconnect.username) {
        this.configureMqttFormGroup.get('mqttuser')!.setValue(config.mqttconnect.username)
      }
      if (config.mqttconnect.password) {
        this.configureMqttFormGroup.get('mqttpassword')!.setValue(config.mqttconnect.password as string)
      }
      if (config.mqttdiscoverylanguage) {
        this.discoveryLanguageFormControl!.setValue(config.mqttdiscoverylanguage)
      }
      if (config.debugComponents) {
        this.debugComponentsFormControl!.setValue(config.debugComponents)
      }

      this.entityApiService.getSslFiles().subscribe((rc) => {
        this.sslFiles = rc
      })
      this.entityApiService.getUserAuthenticationStatus().subscribe((authStatus) => {
        this.authStatus = authStatus
        this.mqttValidate()
        if (config.githubPersonalToken) this.ghPersonalAccessToken.setValue(config.githubPersonalToken)
      })
    })
  }
  form2Config(form: AbstractControl, config: Iconfiguration) {
    let mqttserverurl = form.get('mqttserverurl')
    let mqttuser = form.get('mqttuser')
    let mqttpassword = form.get('mqttpassword')
    let mqttkeyfile = form.get('mqttkeyfile')
    let mqttcafile = form.get('mqttcafile')
    // Save changes to Config and Device
    if (config && mqttserverurl && mqttuser && mqttpassword && mqttserverurl.value) {
      {
        if (!config.mqttconnect) config.mqttconnect = {}
        config.mqttconnect.mqttserverurl = mqttserverurl.value!
        config.mqttconnect.username = mqttuser.value!
        config.mqttconnect.password = mqttpassword.value!
        if (this.discoveryLanguageFormControl && this.discoveryLanguageFormControl.value!)
          config.mqttdiscoverylanguage = this.discoveryLanguageFormControl.value!
        if (mqttcafile) config.mqttcaFile = mqttcafile.value ? mqttcafile.value : undefined
        else delete this.config.mqttcaFile
        if (mqttkeyfile) config.mqttcertFile = mqttkeyfile.value ? mqttkeyfile.value : undefined
        else delete config.mqttcertFile
        if (config.debugComponents) config.debugComponents = this.debugComponentsFormControl!.value
      }
    }
  }

  onChangekMqttConfig() {
    this.mqttValidate()
  }
  onChangeGithubToken() {}
  getSslFiles(): Observable<string[]> {
    return this.entityApiService.getSslFiles()
  }

  save() {
    this.form2Config(this.configureMqttFormGroup, this.config)
    if (this.ghPersonalAccessToken && this.ghPersonalAccessToken.value.length > 0)
      this.config.githubPersonalToken = this.ghPersonalAccessToken.value
    if (this.debugComponentsFormControl && this.debugComponentsFormControl.value.length > 0)
      this.config.debugComponents = this.debugComponentsFormControl.value
    this.entityApiService.postConfiguration(this.config).subscribe(() => {
      this.close()
    })
    this.close()
  }

  close() {
    this.router.navigate(['/'])
  }

  hasConfigChanges(): boolean {
    return !this.configureMqttFormGroup.pristine || !this.configureMqttFormGroup.pristine
  }
  isMqttConfigComplete(): boolean {
    this.configureMqttFormGroup.updateValueAndValidity()
    return this.configureMqttFormGroup.valid
  }
  mqttValidate(): void {
    let config: Iconfiguration = {} as unknown as Iconfiguration
    this.form2Config(this.configureMqttFormGroup, config)
    this.entityApiService.postValidateMqtt(config).subscribe((result) => {
      let hassio = this.authStatus != undefined && this.authStatus.hassiotoken
      if (result && result.valid) {
        this.mqttConnectIcon = 'cast_connected'
        this.mqttConnectClass = 'greenIcon'
        this.mqttConnectMessage = 'connected'
      } else {
        this.mqttConnectIcon = 'cast'
        this.mqttConnectClass = hassio ? 'greenIcon' : 'redIcon'
        let message = result.message
        if (hassio) message = message + '\nModbus <=> MQTT uses Home Assistants MQTT connection parameters'
        this.mqttConnectMessage = !result || !result.message ? 'error' : message
      }
    })
  }
}
