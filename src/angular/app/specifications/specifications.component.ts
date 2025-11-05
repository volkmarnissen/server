import { Component, OnInit } from '@angular/core'
import { ApiService } from '../services/api-service'
import { FormBuilder } from '@angular/forms'
import { Router } from '@angular/router'
import { Observable, Subject, catchError, first, forkJoin, map } from 'rxjs'
import {
  IbaseSpecification,
  IimageAndDocumentUrl,
  Imessage,
  ImodbusSpecification,
  SpecificationFileUsage,
  SpecificationStatus,
  getSpecificationI18nName,
} from '../../../specification.shared'
import { SpecificationServices } from '../services/specificationServices'
import { Iconfiguration, IUserAuthenticationStatus } from '../../../server.shared'
import { GalleryItem, ImageItem } from 'ng-gallery'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { NgClass, NgFor, NgIf } from '@angular/common'
import { MatButton, MatIconButton } from '@angular/material/button'
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card'
import { SessionStorage } from '../services/SessionStorage'
import { InfoboxComponent } from '../infobox/infobox.component'
import { BrowserModule } from '@angular/platform-browser'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'

interface ImodbusSpecificationWithMessages extends ImodbusSpecification {
  messages: Imessage[]
}

@Component({
  selector: 'app-specifications',
  templateUrl: './specifications.component.html',
  styleUrl: './specifications.component.css',
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatButton,
    NgFor,
    MatTooltip,
    MatIcon,
    MatIconButton,
    NgIf,
    NgClass,
    InfoboxComponent,
  ],
})
export class SpecificationsComponent implements OnInit {
  config: Iconfiguration
  private specServices: SpecificationServices | undefined
  private authStatus: IUserAuthenticationStatus | undefined = undefined
  specifications: ImodbusSpecificationWithMessages[]
  galleryItems: Map<string, GalleryItem[]>
  message: Subject<string> = new Subject<string>()
  constructor(
    private apiService: ApiService,
    private fb: FormBuilder,
    private router: Router
  ) {}
  contributing: boolean = false
  fillSpecifications(specs: ImodbusSpecification[]) {
    let a: any = {}
    this.galleryItems = new Map<string, GalleryItem[]>()

    specs.forEach((spec) => {
      // Specifications Component doesn't change a Specification
      // for validation of identification, it's better to use the Filespecification
      // This happens in getForSpecificationValidation
      let ox = this.apiService.getForSpecificationValidation(spec.filename, this.config.mqttdiscoverylanguage)
      a[spec.filename] = ox
      this.generateImageGalleryItems(spec)
    })
    forkJoin(a).subscribe((o: any) => {
      Object.entries(o).forEach(([key, value]) => {
        let s: any = specs.find((spec) => spec.filename == key)
        if (s) (s as ImodbusSpecificationWithMessages).messages = value as any
      })
      this.specifications = specs as ImodbusSpecificationWithMessages[]
    })
  }
  ngOnInit(): void {
    this.apiService.getConfiguration().subscribe((config) => {
      this.config = config
      this.apiService.getUserAuthenticationStatus().subscribe((authStatus) => {
        this.authStatus = authStatus
        this.specServices = new SpecificationServices(config.mqttdiscoverylanguage, this.apiService)
        this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
      })
    })
  }

  importSpecification() {
    throw new Error('Method not implemented.')
  }
  exportSpecification(_spec: ImodbusSpecification) {
    throw new Error('Method not implemented.')
  }
  deleteSpecification(spec: ImodbusSpecification) {
    if ([SpecificationStatus.added, SpecificationStatus.new, SpecificationStatus.cloned].includes(spec.status)) {
      if (confirm('Are you sure to delete ' + this.getTranslatedSpecName(spec))) {
        this.apiService.deleteSpecification(spec.filename).subscribe(() => {
          this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
          alert(this.getTranslatedSpecName(spec) + ' has been deleted')
        })
      }
    } else {
      alert(this.getTranslatedSpecName(spec) + ' is not local. Only local specifications can be deleted')
    }
  }
  getTranslatedSpecName(spec: IbaseSpecification): string | null {
    if (this.config && this.config.mqttdiscoverylanguage && spec)
      return getSpecificationI18nName(spec!, this.config.mqttdiscoverylanguage)
    return null
  }
  contributeSpecification(spec: ImodbusSpecification) {
    this.contributing = true
    this.apiService
      .postSpecificationContribution(spec.filename, 'My test note')
      .pipe(
        catchError((err) => {
          this.contributing = false
          this.apiService.errorHandler(err)
          return new Observable<number>()
        })
      )
      .subscribe((_issue) => {
        this.apiService.getSpecifications().subscribe(this.fillSpecifications.bind(this))
        this.message.next('Successfully contributed. Created pull Request #' + _issue)
        this.contributing = false
      })
  }

  canContribute(spec: ImodbusSpecification): Observable<boolean> {
    let rc = ![SpecificationStatus.published, SpecificationStatus.contributed].includes(spec.status)
    if (!rc) {
      let s = new Subject<boolean>()
      setTimeout(() => {
        s.next(false)
      }, 1)
      return s.pipe(first())
    }
    // Specifications Component doesn't change a Specification
    // for validation of identification, it's better to use the Filespecification
    // This happens in getForSpecificationValidation
    return this.apiService.getForSpecificationValidation(spec.filename, this.config.mqttdiscoverylanguage).pipe(
      map((messages) => {
        return messages.length == 0
      })
    )
  }

  getValidationMessage(spec: IbaseSpecification, message: Imessage): string {
    if (this.specServices) return this.specServices.getValidationMessage(spec, message)
    else return 'unknown message'
  }

  getStatusIcon(status: SpecificationStatus): string {
    return SpecificationServices.getStatusIcon(status)
  }
  getStatusText(status: SpecificationStatus): string {
    return SpecificationServices.getStatusText(status)
  }
  fetchPublic() {
    this.apiService.getSpecificationFetchPublic().subscribe(() => {
      this.ngOnInit()
      this.message.next('Public directory updated')
    })
  }
  generateImageGalleryItems(spec: ImodbusSpecification): void {
    let rc: GalleryItem[] = []
    spec.files.forEach((img) => {
      if (img.usage == SpecificationFileUsage.img) {
        rc.push(new ImageItem({ src: img.url, thumb: img.url }))
      }
    })
    this.galleryItems.set(spec.filename, rc)
  }
  getImage(fn: string) {
    let d = this.galleryItems.get(fn)
    if (d && d.length > 0 && d[0].data && d[0].data.src) return d[0].data.src as string
    return ''
  }
  onZipDropped(files: FileList) {
    var fd = new FormData()
    Array.prototype.forEach.call(files, (element: File) => {
      fd.append('zips', element, element.name)
    })
    this.apiService.postZip(fd).subscribe((errors) => {
      let msg = 'Specification imported'
      if (errors.warnings) msg = msg + '\n\n' + errors.warnings
      this.message.next(msg)
    })
  }
  zipBrowseHandler(input: EventTarget | null) {
    if (input && (input as HTMLInputElement).files !== null) this.onZipDropped((input as HTMLInputElement).files!)
  }
  generateDownloadLink(what: string): string {
    let url = 'download/' + what
    if (!this.authStatus || this.authStatus.hassiotoken == undefined) {
      let authToken = new SessionStorage().getAuthToken()
      if (authToken) return authToken + '/' + url
    }
    return url
  }
}
