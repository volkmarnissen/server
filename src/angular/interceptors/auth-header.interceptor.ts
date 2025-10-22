import { Injectable } from "@angular/core";
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from "@angular/common/http";
import { Observable } from "rxjs";
import { SessionStorage } from "../app/services/SessionStorage";

@Injectable()
export class AuthHeaderInterceptor implements HttpInterceptor {
  constructor() {}
  intercept(
    request: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    let token = new SessionStorage().getAuthToken();
    if (token) {
      const authReq = request.clone({
        headers: request.headers.set("Authorization", "Bearer " + token),
      });
      return next.handle(authReq);
    } else return next.handle(request);
  }
}
