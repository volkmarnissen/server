import { HttpEvent, HttpEventType, HttpResponse } from "@angular/common/http";
import {
  OnChanges,
  Component,
  Input,
  ViewChild,
  Output,
  EventEmitter,
  OnInit,
} from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { GalleryItem, ImageItem, GalleryComponent } from "ng-gallery";
import {
  IimageAndDocumentUrl,
  IbaseSpecification,
  SpecificationFileUsage,
  ImodbusSpecification,
  FileLocation,
  SpecificationStatus,
} from "../../../../specification.shared";
import { ApiService } from "../../services/api-service";
import { MatIconButton } from "@angular/material/button";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { DragndropDirective } from "../dragndrop/dragndrop.directive";
import { NgClass, NgIf, NgFor } from "@angular/common";
import {
  MatAccordion,
  MatExpansionPanel,
  MatExpansionPanelHeader,
  MatExpansionPanelTitle,
  MatExpansionPanelDescription,
} from "@angular/material/expansion";

@Component({
  selector: "app-upload-files",
  templateUrl: "./upload-files.component.html",
  styleUrl: "./upload-files.component.css",
  standalone: true,
  imports: [
    MatAccordion,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatExpansionPanelTitle,
    NgClass,
    MatExpansionPanelDescription,
    DragndropDirective,
    NgIf,
    NgFor,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    ReactiveFormsModule,
    GalleryComponent,
  ],
})
export class UploadFilesComponent implements OnInit, OnChanges {
  constructor(
    private entityApiService: ApiService,
    private fb: FormBuilder,
  ) {}
  @Input("specification") currentSpecification: ImodbusSpecification | null;
  uploadFilesForm: FormGroup;
  urlDocumentControl: FormControl<string | null>;
  urlImageControl: FormControl<string | null>;
  @Output()
  updateDocumentation = new EventEmitter<IimageAndDocumentUrl[]>();

  @ViewChild("addImageUrlButton")
  addImageUrlButton: MatIconButton;
  @ViewChild("addDocumentUrlButton")
  addDocumentUrlButton: MatIconButton;
  galleryItems: GalleryItem[] = [];
  imageUrls: IimageAndDocumentUrl[] = [];
  documentUrls: IimageAndDocumentUrl[] = [];
  ngOnChanges(): void {
    this.generateDocumentUrls();
    this.generateImageGalleryItems();
    if (this.addImageUrlButton) this.addImageUrlButton.disabled = true;
    if (this.addDocumentUrlButton) this.addDocumentUrlButton.disabled = true;
  }
  ngOnInit(): void {
    this.uploadFilesForm = this.fb.group({
      urlDocument: [null as string | null],
      urlImage: [null as string | null],
    });
    this.urlDocumentControl = this.uploadFilesForm.get(
      "urlDocument",
    ) as FormControl;
    this.urlImageControl = this.uploadFilesForm.get("urlImage") as FormControl;
    this.generateDocumentUrls();
  }
  private fileBrowseHandler(
    input: EventTarget | null,
    usage: SpecificationFileUsage,
  ) {
    if (input && (input as HTMLInputElement).files !== null)
      if (usage == SpecificationFileUsage.documentation)
        this.onDocumentationDropped((input as HTMLInputElement).files!);
      else this.onImageDropped((input as HTMLInputElement).files!);
  }
  imageBrowseHandler(input: EventTarget | null) {
    this.fileBrowseHandler(input, SpecificationFileUsage.img);
  }
  documenationBrowseHandler(input: EventTarget | null) {
    this.fileBrowseHandler(input, SpecificationFileUsage.documentation);
  }

  getEventMessage(
    event: IimageAndDocumentUrl[] | HttpEvent<IimageAndDocumentUrl[]>,
  ): any {
    switch ((event as HttpEvent<IimageAndDocumentUrl[]>).type) {
      case HttpEventType.UploadProgress:
        break;
      case HttpEventType.Response:
        return (event as HttpResponse<IimageAndDocumentUrl[]>).body;
      default:
        return `Upload event: ${(event as HttpEvent<IbaseSpecification>).type}.`;
    }
  }
  getBaseFilename(filename: string): string {
    let idx = filename.lastIndexOf("/");
    if (idx >= 0) return filename.substring(idx + 1);
    return filename;
  }
  onFileDropped(files: FileList, usage: SpecificationFileUsage) {
    var fd = new FormData();
    if (this.currentSpecification) {
      Array.prototype.forEach.call(files, (element: File) => {
        var specFiles = this.currentSpecification!.files;
        let found = specFiles.find(
          (u) => u.url.endsWith(element.name) && u.usage == usage,
        );
        if (!found) {
          fd.append("documents", element);
        }
      });
      this.entityApiService
        .postFile(this.currentSpecification.filename, usage, fd)
        .subscribe((event) => {
          this.currentSpecification!.files = event;
          if (usage == SpecificationFileUsage.img)
            this.generateImageGalleryItems();
          else this.generateDocumentUrls();
          this.updateDocumentation.next(event);
        });
    }
  }
  onImageDropped(event: FileList) {
    this.onFileDropped(event, SpecificationFileUsage.img);
  }
  onDocumentationDropped(event: FileList) {
    this.onFileDropped(event, SpecificationFileUsage.documentation);
  }

  private addDocument(control: FormControl, usage: SpecificationFileUsage) {
    let url = control.value;
    if (url && this.currentSpecification) {
      let found = this.currentSpecification.files.find((f) => f.url == url);
      if (!found) {
        this.entityApiService
          .postAddFilesUrl(
            this.currentSpecification.status == SpecificationStatus.new
              ? "_new"
              : this.currentSpecification.filename,
            {
              url: url,
              fileLocation: FileLocation.Global,
              usage: usage,
            },
          )
          .subscribe((files) => {
            this.currentSpecification!.files = files as IimageAndDocumentUrl[];
            if (usage == SpecificationFileUsage.img)
              this.generateImageGalleryItems();
            else this.generateDocumentUrls();
            this.updateDocumentation.next(files);
          });
      }
    }
  }
  addDocumentUrl() {
    this.urlDocumentControl.updateValueAndValidity();
    this.addDocument(
      this.urlDocumentControl,
      SpecificationFileUsage.documentation,
    );
  }
  addImageUrl() {
    this.urlImageControl.updateValueAndValidity();
    this.addDocument(this.urlImageControl, SpecificationFileUsage.img);
  }
  enableAddButton(event: Event, btn: MatIconButton) {
    btn.disabled =
      !event.target ||
      (event.target as any).value == null ||
      (event.target as any).value == "";
  }

  generateDocumentUrls() {
    let rc: IimageAndDocumentUrl[] = [];
    if (this.currentSpecification && this.currentSpecification.files)
      for (let i = 0; i < this.currentSpecification.files.length; i++) {
        let doc = this.currentSpecification.files[i];
        if (doc.usage == SpecificationFileUsage.documentation) rc.push(doc);
      }
    if (rc.length != this.documentUrls.length) this.documentUrls = rc;
  }
  generateImageGalleryItems(): void {
    let rc: GalleryItem[] = [];
    let rd: IimageAndDocumentUrl[] = [];
    this.currentSpecification?.files.forEach((img) => {
      if (img.usage == SpecificationFileUsage.img) {
        rc.push(new ImageItem({ src: img.url, thumb: img.url }));
        rd.push(img);
      }
    });
    this.imageUrls = rd;
    this.galleryItems = rc;
  }
  deleteFile(uploadedFile: IimageAndDocumentUrl) {
    if (this.currentSpecification)
      this.entityApiService
        .deleteUploadedFile(
          this.currentSpecification.filename,
          uploadedFile.url,
          uploadedFile.usage,
        )
        .subscribe((files) => {
          this.currentSpecification!.files = files;
          if (uploadedFile.usage == SpecificationFileUsage.img)
            this.generateImageGalleryItems();
          else this.generateDocumentUrls();
        });
  }
}
