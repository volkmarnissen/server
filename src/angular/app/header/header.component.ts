import { Component } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { MatIcon } from "@angular/material/icon";
import { MatMenuTrigger, MatMenu } from "@angular/material/menu";
import { MatTooltip } from "@angular/material/tooltip";
import { MatIconButton, MatButton } from "@angular/material/button";

@Component({
  selector: "app-header",
  templateUrl: "./header.component.html",
  styleUrls: ["./header.component.css"],
  imports: [
    MatIconButton,
    MatTooltip,
    MatMenuTrigger,
    MatIcon,
    MatMenu,
    RouterLink,
    MatButton,
  ],
})
export class HeaderComponent {
  constructor(private router: Router) {}
  getActiveRoute() {
    return this.router.url;
  }
}
