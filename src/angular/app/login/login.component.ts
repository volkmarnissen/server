import { AfterViewInit, Component, OnInit } from "@angular/core";
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from "@angular/forms";
import { ApiService } from "../services/api-service";
import { SessionStorage } from "../services/SessionStorage";
import { ActivatedRoute, Router } from "@angular/router";
import { Subscription } from "rxjs";
import { MatButton } from "@angular/material/button";
import { MatCardActions } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";
import { NgIf } from "@angular/common";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatError,
  MatSuffix,
} from "@angular/material/form-field";
import { MatDialogTitle } from "@angular/material/dialog";
@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogTitle,
    MatFormField,
    MatLabel,
    MatInput,
    NgIf,
    MatError,
    MatIcon,
    MatSuffix,
    MatCardActions,
    MatButton,
  ],
})
export class LoginComponent implements OnInit, AfterViewInit {
  hide: boolean = true;
  isRegisterMode = false;
  form: FormGroup;
  sub: Subscription;
  toUrl: string | number;
  constructor(
    private _formBuilder: FormBuilder,
    private api: ApiService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}
  ngAfterViewInit(): void {
    this.sub = this.route.paramMap.subscribe((params) => {
      this.toUrl = params.get("toUrl") || "";
    });
  }

  ngOnInit(): void {
    let posRegister = this.router.url.indexOf("register");
    // If the url part of the URL and not the parameter contains register, we are in register mode
    this.isRegisterMode = posRegister >= 0;
    this.form = this._formBuilder.group({
      username: ["", this.usernamePasswordRequired],
      password: ["", this.usernamePasswordRequired],
    });
  }
  private login(username: string, password: string, toUrl: string) {
    this.api.getUserLogin(username, password).subscribe((token) => {
      new SessionStorage().setAuthToken(token);
      this.router.navigate([toUrl], {
        queryParams: { tokenWasExpired: true },
      });
    });
  }
  onSubmit(event: SubmitEvent) {
    let username = this.form.get("username")!.value;
    let password = this.form.get("password")!.value;
    if (this.isRegisterMode) {
      let noAuthentication =
        (event.submitter as HTMLButtonElement).value == "noAuthentication";
      if (!noAuthentication && !username) alert("Please enter a username");
      else if (!noAuthentication && !password) alert("Please enter a password");
      else
        this.api
          .postUserRegister(username, password, noAuthentication)
          .subscribe(() => {
            if (!noAuthentication) this.login(username, password, "/");
            else this.router.navigate(["/"], {});
          });
    } else this.login(username, password, "/");
  }
  usernamePasswordRequired(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!this.isRegisterMode) return Validators.required(control);
      else {
        return null;
      }
    };
  }
}
