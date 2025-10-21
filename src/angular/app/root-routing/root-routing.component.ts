import { AfterViewInit, Component } from "@angular/core";
import { ApiService } from "../services/api-service";
import { Router } from "@angular/router";
import { IUserAuthenticationStatus } from "../../../server.shared";

@Component({
  selector: "app-root-routing",
  template: "",
  standalone: true,
})
export class RootRoutingComponent implements AfterViewInit {
  constructor(
    public api: ApiService,
    public router: Router,
  ) {}
  ngAfterViewInit(): void {
    this.api.getUserAuthenticationStatus().subscribe((userAuthStatus) => {
      this.redirect(userAuthStatus);
    });
  }
  private redirect(userAuthStatus: IUserAuthenticationStatus) {
    if (!userAuthStatus.mqttConfigured && !userAuthStatus.hassiotoken) {
      this.router.navigate(["/configure"]);
      return;
    }
    if (userAuthStatus.preSelectedBusId) {
      this.router.navigate(["/slaves", userAuthStatus.preSelectedBusId]);
      return;
    }
    this.router.navigate(["busses"]);
  }
}
