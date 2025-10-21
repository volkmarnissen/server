import { Component } from "@angular/core";
import { HeaderComponent } from "./header/header.component";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
  imports: [HeaderComponent, RouterModule],
})
export class AppComponent {
  title = "modbus2mqtt";
}
