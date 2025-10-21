import { Inject, Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Observable, Subject } from "rxjs";
import { catchError, first, map } from "rxjs/operators";
//we've defined our base url here in the env
import {
  ImodbusSpecification,
  ImodbusEntity,
  IimageAndDocumentUrl,
  HttpErrorsEnum,
  Ispecification,
  SpecificationFileUsage,
  editableConverters,
  Imessage,
  IimportMessages,
  Converters,
} from "../../../specification.shared";
import { SessionStorage } from "./SessionStorage";
import { ActivatedRoute, Router } from "@angular/router";
import { I18nService } from "./i18n.service";
import { ImodbusEntityWithName } from "./specificationInterface";
import {
  apiUri,
  Iconfiguration,
  IUserAuthenticationStatus,
  IBus,
  Islave,
  IidentificationSpecification,
  IModbusConnection,
} from "../../../server.shared";
import { APP_BASE_HREF } from "@angular/common";

@Injectable({
  providedIn: "root",
})
export class ApiService {
  converterCache: Converters[] | undefined = undefined;
  private rootUrl = ".";
  constructor(
    private httpClient: HttpClient,
    private router: Router,
    private activeatedRoute: ActivatedRoute,
  ) {
    this.errorHandler = (err: HttpErrorResponse) => {
      if (
        [HttpErrorsEnum.ErrUnauthorized, HttpErrorsEnum.ErrForbidden].includes(
          err.status,
        )
      ) {
        new SessionStorage().removeAuthToken();
        this.router.navigate(["login"], { queryParams: { toUrl: router.url } });
      } else {
        let msg = "";
        if (err.error)
          if (err.error.error) msg += err.error.error + "\n";
          else msg += err.error + "\n";
        msg += err.statusText;
        if (!err.error && !err.statusText && err.message) msg = err.message;
        alert(msg);
      }
    };
    if ((window as any).configuration && (window as any).configuration.rootUrl)
      this.rootUrl = (window as any).configuration.rootUrl;
  }
  private getFullUri(uri: apiUri): string {
    return this.rootUrl + uri;
  }

  loadingError$ = new Subject<boolean>();

  errorHandler: (err: HttpErrorResponse) => any;
  getSpecification(
    specification: string | undefined = undefined
  ): Observable<Ispecification> {
    if (!specification) throw new Error("spec is a required parameter");

    let f: string =
      this.getFullUri(apiUri.specfication) + `?spec=${specification}`;
    return this.httpClient.get<Ispecification>(f); // No error Handling!!!
  }

  getModbusSpecification(
    busid: number,
    slaveid: number,
    specification: string | undefined = undefined,
    deviceDetection:boolean| undefined = undefined
  ): Observable<ImodbusSpecification> {
    let deviceDetectionStr :string = ''
    if(deviceDetection)
      deviceDetectionStr = '&deviceDetection=1'

    let f: string =
      this.getFullUri(apiUri.modbusSpecification) +
      `?busid=${busid}&slaveid=${slaveid}`;
    if (specification) f = f + `&spec=${specification}${deviceDetectionStr}`;
    return this.httpClient.get<ImodbusSpecification>(f).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<ImodbusSpecification>();
      }),
    );
  }
  getConverters(): Observable<Converters[]> {
    if (this.converterCache != undefined) {
      let sub = new Subject<Converters[]>();
      sub.pipe(first());
      setTimeout(() => {
        sub.next(this.converterCache!);
      }, 1);
      return sub;
    }

    let url = this.getFullUri(apiUri.converters);
    return this.httpClient.get<Converters[]>(url).pipe(
      map((cnv) => {
        this.converterCache = cnv as Converters[];
        return cnv;
      }),
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<Converters[]>();
      }),
    );
  }
  postValidateMqtt(
    config: Iconfiguration,
  ): Observable<{ valid: boolean; message: string }> {
    let url = this.getFullUri(apiUri.validateMqtt);
    return this.httpClient
      .post<{ valid: boolean; message: string }>(url, config)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<{ valid: boolean; message: string }>();
        }),
      );
  }
  getSslFiles(): Observable<string[]> {
    let url = this.getFullUri(apiUri.sslFiles);
    return this.httpClient.get<string[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<string[]>();
      }),
    );
  }
  getSerialDevices(): Observable<string[]> {
    let url = this.getFullUri(apiUri.serialDevices);
    return this.httpClient.get<string[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<string[]>();
      }),
    );
  }
  getUserAuthenticationStatus(): Observable<IUserAuthenticationStatus> {
    let url = this.getFullUri(apiUri.userAuthenticationStatus);
    return this.httpClient.get<IUserAuthenticationStatus>(url).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<IUserAuthenticationStatus>();
      }),
    );
  }
  getBusses(): Observable<IBus[]> {
    let url = this.getFullUri(apiUri.busses);
    return this.httpClient.get<IBus[]>(url).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<IBus[]>();
      }),
    );
  }
  getBus(busid: number): Observable<IBus> {
    let url = this.getFullUri(apiUri.bus) + `?busid=${busid}`;
    return this.httpClient.get<IBus>(url).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<IBus>();
      }),
    );
  }
  getSlave(busid: number, slaveid: number): Observable<Islave> {
    return this.httpClient
      .get<Islave>(
        this.getFullUri(apiUri.slave) + `?busid=${busid}&slaveid=${slaveid}`,
      )
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Islave>();
        }),
      );
  }
  getSlaves(busid: number): Observable<Islave[]> {
    return this.httpClient
      .get<Islave[]>(this.getFullUri(apiUri.slaves) + `?busid=${busid}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Islave[]>();
        }),
      );
  }
  getUserLogin(username: string, password: string): Observable<string> {
    return this.httpClient
      .get<any>(
        this.getFullUri(apiUri.userLogin) +
          `?name=${username}&password=${password}`,
      )
      .pipe(
        map((value) => {
          return value.token;
        }),
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<string>();
        }),
      );
  }
  postUserRegister(
    username: string | undefined,
    password: string | undefined,
    noAuthentication: boolean,
  ): Observable<void> {
    return this.httpClient
      .post<void>(this.getFullUri(apiUri.userRegister), {
        username: username,
        password: password,
        noAuthentication: noAuthentication,
      })
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }

  getSpecsDetection(
    busid: number,
    specificSlaveId: number,
    showAllPublicSpecs: boolean,
    language: string,
  ): Observable<IidentificationSpecification[]> {
    let p1 = specificSlaveId ? "&slaveid=" + specificSlaveId : "";
    let param = "?busid=" + busid + p1 + "&language=" + language;
    if (showAllPublicSpecs) param = param + "&showAllPublicSpecs=true";
    return this.httpClient
      .get<
        IidentificationSpecification[]
      >(this.getFullUri(apiUri.specsDetection) + `${param}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<IidentificationSpecification[]>();
        }),
      );
  }
  getSpecifications(): Observable<ImodbusSpecification[]> {
    return this.httpClient
      .get<ImodbusSpecification[]>(this.getFullUri(apiUri.specifications))
      .pipe(
        catchError((err): Observable<ImodbusSpecification[]> => {
          this.loadingError$.next(true);
          this.errorHandler(err);
          return new Observable<ImodbusSpecification[]>();
        }),
      );
  }

  postBus(
    connection: IModbusConnection,
    busid?: number,
  ): Observable<{ busid: number }> {
    let url = this.getFullUri(apiUri.bus);
    if (busid != undefined) url = `${url}?busid=${busid}`;
    return this.httpClient.post<{ busid: number }>(url, connection).pipe(
      catchError((err): Observable<{ busid: number }> => {
        this.errorHandler(err);
        return new Observable<{ busid: number }>();
      }),
    );
  }
  postTranslate(
    originalLanguage: string,
    translationLanguage: string,
    text: string[],
    errorHandler?: (err: HttpErrorResponse) => boolean,
  ): Observable<string[]> {
    const httpOptions = {
      headers: {
        "Content-Type": "application/json",
      },
    };
    const request = {
      contents: text,
      mimeType: "text/plain",
      sourceLanguageCode: originalLanguage,
      targetLanguageCode: translationLanguage,
    };

    return this.httpClient
      .post<string[]>(this.getFullUri(apiUri.translate), request, httpOptions)
      .pipe(
        catchError((err): Observable<string[]> => {
          if (errorHandler == undefined || !errorHandler(err))
            this.errorHandler(err);
          return new Observable<string[]>();
        }),
      );
  }

  postSpecification(
    specification: ImodbusSpecification,
    busid: number,
    slaveid: number,
    originalFilename: string | null = null,
  ): Observable<ImodbusSpecification> {
    const httpOptions = {
      headers: {
        "Content-Type": "application/json",
      },
    };
    return this.httpClient
      .post<ImodbusSpecification>(
        this.getFullUri(apiUri.specfication) +
          `?busid=${busid}&slaveid=${slaveid}&originalFilename=${originalFilename}`,
        specification,
        httpOptions,
      )
      .pipe(
        catchError((err): Observable<ImodbusSpecification> => {
          this.errorHandler(err);
          return new Observable<ImodbusSpecification>();
        }),
      );
  }

  postSlave(busid: number, device: Islave): Observable<Islave> {
    const httpOptions = {
      headers: {
        "Content-Type": "application/json",
      },
    };
    let f = this.getFullUri(apiUri.slave) + `?busid=${busid}`;
    return this.httpClient.post<Islave>(f, device, httpOptions).pipe(
      catchError((err) => {
        this.errorHandler(err);
        return new Observable<Islave>();
      }),
    );
  }
  getConfiguration(): Observable<Iconfiguration> {
    return this.httpClient
      .get<Iconfiguration>(this.getFullUri(apiUri.configuration))
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Iconfiguration>();
        }),
      );
  }
  postConfiguration(config: Iconfiguration): Observable<Iconfiguration> {
    return this.httpClient
      .post<Iconfiguration>(this.getFullUri(apiUri.configuration), config)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Iconfiguration>();
        }),
      );
  }
  postModbusEntity(
    spec: ImodbusSpecification,
    changedEntity: ImodbusEntity,
    busid: number,
    slaveid: number,
    language: string,
  ): Observable<ImodbusEntityWithName> {
    return this.httpClient
      .post<ImodbusEntity>(
        this.getFullUri(apiUri.modbusEntity) +
          `?busid=${busid}&slaveid=${slaveid}&entityid=${changedEntity.id}`,
        spec,
      )
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<ImodbusEntityWithName>();
        }),
      );
  }
  deleteNewSpecfiles() {
    return this.httpClient
      .delete<void>(this.getFullUri(apiUri.newSpecificationfiles))
      .pipe(
        catchError((err): Observable<void> => {
          this.loadingError$.next(true);
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }
  postModbusWriteMqtt(
    spec: ImodbusSpecification,
    entityid: number,
    busid: number,
    slaveid: number,
    language: string,
    mqttValue: string,
  ): Observable<string> {
    let lSpec: ImodbusSpecification = structuredClone(spec);
    let entity = lSpec.entities.find((e) => e.id == entityid);
    if (entity && editableConverters.includes(entity.converter)) {
      switch (entity.converter) {
        case "select":
          I18nService.specificationTextsToTranslation(lSpec, language, entity);
          return this.httpClient
            .post<string>(
              this.getFullUri(apiUri.writeEntity) +
                `?busid=${busid}&slaveid=${slaveid}&entityid=${entityid}&mqttValue=${mqttValue}&language=${language}`,
              lSpec,
            )
            .pipe(
              catchError((err) => {
                this.errorHandler(err);
                return new Observable<string>();
              }),
            );
        default:
          return this.httpClient
            .post<string>(
              this.getFullUri(apiUri.writeEntity) +
                `?busid=${busid}&slaveid=${slaveid}&entityid=${entityid}&mqttValue=${mqttValue}&language=${language}`,
              lSpec,
            )
            .pipe(
              catchError((err) => {
                this.errorHandler(err);
                return new Observable<string>();
              }),
            );
      }
    } else throw new Error("entityid " + entityid + " not found ");
  }
  postZip(formData: FormData): Observable<IimportMessages> {
    return this.httpClient
      .post<IimportMessages>(this.getFullUri(apiUri.uploadSpec), formData)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<IimportMessages>();
        }),
      );
  }
  postFile(
    specification: string,
    usage: SpecificationFileUsage,
    formData: FormData,
  ): Observable<IimageAndDocumentUrl[]> {
    return this.httpClient
      .post<
        IimageAndDocumentUrl[]
      >(this.getFullUri(apiUri.upload) + `?specification=${specification}&usage=${usage}`, formData)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<IimageAndDocumentUrl[]>();
        }),
      );
  }
  postAddFilesUrl(
    specification: string,
    url: IimageAndDocumentUrl,
  ): Observable<IimageAndDocumentUrl[]> {
    return this.httpClient
      .post<
        IimageAndDocumentUrl[]
      >(this.getFullUri(apiUri.addFilesUrl) + `?specification=${specification}`, url)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<IimageAndDocumentUrl[]>();
        }),
      );
  }
  postSpecificationContribution(
    spec: string,
    note: string,
  ): Observable<number> {
    return this.httpClient.post<number>(
      this.getFullUri(apiUri.specficationContribute) + `?spec=${spec}`,
      {
        note: note,
      },
    );
  }
  getForSpecificationValidation(
    specfilename: string,
    language: string,
  ): Observable<Imessage[]> {
    return this.httpClient
      .get<
        Imessage[]
      >(this.getFullUri(apiUri.specificationValidate) + `?language=${language}&spec=${specfilename}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Imessage[]>();
        }),
      );
  }
  getSpecificationFetchPublic(): Observable<void> {
    return this.httpClient
      .get<void>(this.getFullUri(apiUri.specificationFetchPublic))
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }

  postForSpecificationValidation(
    spec: ImodbusSpecification,
    language: string,
  ): Observable<Imessage[]> {
    return this.httpClient
      .post<
        Imessage[]
      >(this.getFullUri(apiUri.specificationValidate) + `?language=${language}`, spec)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<Imessage[]>();
        }),
      );
  }
  deleteBus(busid: number): Observable<void> {
    return this.httpClient
      .delete<void>(this.getFullUri(apiUri.bus) + `?busid=${busid}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }
  deleteSlave(busid: number, slaveid: number): Observable<void> {
    return this.httpClient
      .delete<void>(
        this.getFullUri(apiUri.slave) + `?busid=${busid}&slaveid=${slaveid}`,
      )
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }
  deleteSpecification(specFilename: string): Observable<void> {
    return this.httpClient
      .delete<void>(
        this.getFullUri(apiUri.specfication) + `?spec=${specFilename}`,
      )
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<void>();
        }),
      );
  }
  deleteUploadedFile(
    specfileName: string,
    url: string,
    usage: SpecificationFileUsage,
  ): Observable<IimageAndDocumentUrl[]> {
    return this.httpClient
      .delete<
        IimageAndDocumentUrl[]
      >(this.getFullUri(apiUri.upload) + `?specification=${specfileName}&url=${url}&usage=${usage}`)
      .pipe(
        catchError((err) => {
          this.errorHandler(err);
          return new Observable<IimageAndDocumentUrl[]>();
        }),
      );
  }
}
