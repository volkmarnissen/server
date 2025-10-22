import { Component, Input, OnDestroy, OnInit } from "@angular/core";
import {
  trigger,
  transition,
  state,
  animate,
  style,
  AnimationEvent,
} from "@angular/animations";
import { Observable } from "rxjs";
import { NgIf } from "@angular/common";
const animationDuration = 1250;
@Component({
  selector: "app-infobox",
  host: {
    "[@showMessage]": "newAnimationState",
    "(@showMessage.done)": "captureDoneEvent($event)",
  },
  animations: [
    trigger("showMessage", [
      // ...
      state(
        "open",
        style({
          opacity: 1,
        }),
      ),
      state(
        "close",
        style({
          height: "20px",
          opacity: 0.1,
        }),
      ),
      transition("open => close", [
        animate((animationDuration / 1000).toFixed(1) + "s"),
      ]),
      transition("close => open", [
        animate((animationDuration / 1000).toFixed(1) + "s"),
      ]),
    ]),
  ],
  imports: [NgIf],
  templateUrl: "./infobox.component.html",
  styleUrl: "./infobox.component.css",
})
export class InfoboxComponent implements OnInit, OnDestroy {
  messages: { endOfLive: number; message: string }[] = [];
  currentDisplay: string = "";
  showInfoBox: boolean = false;
  newAnimationState = "close";
  intervalTimer: any = undefined;
  @Input({ required: true })
  message: Observable<string>;
  messageSubscription: any = undefined;

  constructor() {}
  ngOnInit(): void {
    this.messageSubscription = this.message.subscribe((newMessage) => {
      this.messages.push({
        endOfLive: Date.now() + 2 * animationDuration + 1000,
        message: newMessage,
      });
      if (this.messages.length > 0) {
        if (this.intervalTimer == undefined) {
          this.intervalTimer = setInterval(() => {
            this.currentDisplay = "";

            // Remove outdated messages
            let now = Date.now();
            // The messages are ordered by lifetime (oldest first)
            // The valid messages are at the end
            // Just remove the first entries until an entry has a lifetime longer  than now
            while (this.messages.length && this.messages[0].endOfLive < now) {
              this.messages.shift();
            }
            var cnt = this.messages.find(
              (m) => m.endOfLive - now > animationDuration,
            );
            if (!cnt) this.newAnimationState = "close";
            else this.newAnimationState = "open";

            if (this.messages.length == 0) {
              clearInterval(this.intervalTimer);
              this.intervalTimer = undefined;
            } else {
              this.showInfoBox = true;

              this.messages.forEach((msg) => {
                this.currentDisplay = this.currentDisplay + msg.message + "\n";
              });
            }
          }, 100);
        }
      } else {
        // No more messages
        if (this.intervalTimer != undefined) {
          clearInterval(this.intervalTimer);
          this.intervalTimer = undefined;
        }
      }
    });
  }
  ngOnDestroy(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.messageSubscription) this.messageSubscription.unsubscribe();
    this.intervalTimer = undefined;
    this.messageSubscription = undefined;
  }
  onAnimationEvent(event: AnimationEvent) {
    // openClose is trigger name in this example
    console.warn(`Animation Trigger: ${event.triggerName}`);
    // phaseName is "start" or "done"
    console.warn(`Phase: ${event.phaseName}`);
    // in our example, totalTime is 1000 (number of milliseconds in a second)
    console.warn(`Total time: ${event.totalTime}`);
    // in our example, fromState is either "open" or "close"
    console.warn(`From: ${event.fromState}`);
    // in our example, toState either "open" or "close"
    console.warn(`To: ${event.toState}`);
    // the HTML element itself, the button in this case
    console.warn(`Element: ${event.element}`);
  }

  captureDoneEvent(event: AnimationEvent) {
    if (event.toState == "close") this.showInfoBox = false;
  }
}
