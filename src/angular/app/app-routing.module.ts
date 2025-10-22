import { Routes } from "@angular/router";
import { SpecificationComponent } from "./specification/specification/specification.component";
import { LoginComponent } from "./login/login.component";
import { AuthGuardService } from "./services/auth-guard.service";
import { SelectModbusComponent } from "./select-modbus/select-modbus.component";
import { SelectSlaveComponent } from "./select-slave/select-slave.component";
import { RootRoutingComponent } from "./root-routing/root-routing.component";
import { SpecificationsComponent } from "./specifications/specifications.component";
import { RoutingNames } from "../../server.shared";
export const APP_ROUTES: Routes = [
  { path: "", component: RootRoutingComponent, pathMatch: "full" },
  { path: RoutingNames.login, component: LoginComponent },
  { path: RoutingNames.register, component: LoginComponent },
  {
    path: RoutingNames.configure,
    loadComponent: () =>
      import("./configure/configure.component").then(
        (m) => m.ConfigureComponent,
      ),
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.busses,
    component: SelectModbusComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.specifications,
    component: SpecificationsComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.slaves + "/:busid",
    component: SelectSlaveComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.specification + "/:busid/:slaveid/:disabled",
    canActivate: [AuthGuardService],
    loadComponent: () =>
      import("./specification/specification/specification.component").then(
        (m) => m.SpecificationComponent,
      ),
    canDeactivate: [
      (component: SpecificationComponent) => !component.canDeactivate(),
    ],
  },
];
// bootstrapApplication(AppComponent,{
//   providers:[provideRouter(routes, withComponentInputBinding())]
// })
