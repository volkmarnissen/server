import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, Router } from '@angular/router'
import { ApiService } from './api-service'
import { Observable, map, tap } from 'rxjs'
import { SessionStorage } from './SessionStorage'
import { IUserAuthenticationStatus } from '../../../server.shared'

@Injectable({
  providedIn: 'root',
})
export class AuthGuardService {
  constructor(
    public api: ApiService,
    public router: Router
  ) {}
  private getForwardUrl(defaultRoute: string) {
    let url = this.router.parseUrl(this.router.url)
    let forwardUrl = url.queryParamMap.get('toUrl')
    if (!forwardUrl) return defaultRoute
    return forwardUrl
  }
  //forward to mqtt configuration if it is not configured yet
  private afterAuthentication(userAuthStatus: IUserAuthenticationStatus, noRedirect: boolean): boolean {
    if (noRedirect) return true
    if (!userAuthStatus.mqttConfigured) {
      this.router.navigate(['mqtt'], {
        queryParams: { toUrl: this.getForwardUrl('/') },
      })
      return false
    }

    if (userAuthStatus.preSelectedBusId) {
      this.router.navigate(['slaves', userAuthStatus.preSelectedBusId], {
        queryParams: { toUrl: this.getForwardUrl('/') },
      })
      return false
    }
    return true
  }

  canActivate(_route: ActivatedRouteSnapshot): Observable<boolean> {
    return this.api.getUserAuthenticationStatus().pipe(
      map((userAuthStatus) => {
        if (userAuthStatus.hassiotoken || userAuthStatus.noAuthentication)
          return true // NO authentication needed
        else if (!userAuthStatus.registered) {
          this.router.navigate(['register'])
          return false
        } else {
          let token = new SessionStorage().getAuthToken()
          if (!token || userAuthStatus.authTokenExpired) {
            this.router.navigate(['login'], {
              queryParams: { toUrl: this.getForwardUrl('/') },
            })
            return false
          }
          return true
        }
      }),
      tap((_x) => {})
    )
  }
}
