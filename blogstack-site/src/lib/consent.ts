export type CookieChoice = "essential" | "analytics";
export const CONSENT_KEY = "blogstack-cookie-choice-v1";
const LIFETIME = 180 * 86400000;
export interface ConsentOptions {
  measurementId: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  privacyRequested: boolean;
  apply: (enabled: boolean) => void;
  now?: () => number;
}
export class CookiePreferences {
  choice: CookieChoice | null = null;
  enabled = false;
  private now: () => number;
  constructor(private options: ConsentOptions) {
    this.now = options.now || Date.now;
    try {
      const saved = JSON.parse(options.storage.getItem(CONSENT_KEY) || "null");
      if (
        saved &&
        ["essential", "analytics"].includes(saved.choice) &&
        typeof saved.expiresAt === "number" &&
        saved.expiresAt > this.now() &&
        saved.expiresAt <= this.now() + LIFETIME
      )
        this.choice = saved.choice;
    } catch {
      /* A blocked storage API must never enable analytics. */
    }
    this.update();
  }
  choose(choice: CookieChoice) {
    this.choice = choice;
    try {
      this.options.storage.setItem(
        CONSENT_KEY,
        JSON.stringify({ choice, expiresAt: this.now() + LIFETIME }),
      );
    } catch {
      /* The current page still respects the choice. */
    }
    this.update();
  }
  private update() {
    this.enabled =
      this.choice === "analytics" &&
      !this.options.privacyRequested &&
      /^G-[A-Z0-9]{6,20}$/.test(this.options.measurementId);
    this.options.apply(this.enabled);
  }
}
