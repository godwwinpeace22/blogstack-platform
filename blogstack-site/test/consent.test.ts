import { expect, test } from "bun:test";
import { CookiePreferences, CONSENT_KEY } from "../src/lib/consent";
function fixture(
  initial: string | null = null,
  privacyRequested = false,
  measurementId = "G-TEST123456",
) {
  const values = new Map<string, string>();
  if (initial) values.set(CONSENT_KEY, initial);
  const transitions: boolean[] = [];
  const options = {
    measurementId,
    privacyRequested,
    storage: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
    apply: (value: boolean) => transitions.push(value),
    now: () => 1000,
  };
  return { options, transitions, values };
}
test("optional analytics stays off until a valid explicit choice and can be withdrawn", () => {
  const f = fixture(),
    consent = new CookiePreferences(f.options);
  expect(f.transitions).toEqual([false]);
  expect(consent.choice).toBeNull();
  consent.choose("analytics");
  expect(consent.enabled).toBe(true);
  consent.choose("essential");
  expect(consent.enabled).toBe(false);
  expect(f.transitions).toEqual([false, true, false]);
  expect(new CookiePreferences(f.options).enabled).toBe(false);
});
test("remembered consent expires and malformed storage never enables analytics", () => {
  for (const saved of [
    "not-json",
    JSON.stringify({ choice: "analytics", expiresAt: 999 }),
    JSON.stringify({ choice: "invalid", expiresAt: 2000 }),
    JSON.stringify({ choice: "analytics", expiresAt: "never" }),
  ]) {
    const f = fixture(saved);
    expect(new CookiePreferences(f.options).enabled).toBe(false);
  }
  const f = fixture(JSON.stringify({ choice: "analytics", expiresAt: 2000 }));
  expect(new CookiePreferences(f.options).enabled).toBe(true);
});
test("privacy signals override saved consent and an unconfigured property never loads", () => {
  const saved = JSON.stringify({ choice: "analytics", expiresAt: 2000 });
  expect(new CookiePreferences(fixture(saved, true).options).enabled).toBe(
    false,
  );
  for (const id of ["", "G-", "injected-script", "G-INVALID?url=external"]) {
    expect(
      new CookiePreferences(fixture(saved, false, id).options).enabled,
    ).toBe(false);
  }
});
test("storage denial does not break essential-only consent", () => {
  const transitions: boolean[] = [];
  const consent = new CookiePreferences({
    measurementId: "G-TEST123456",
    privacyRequested: false,
    storage: {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
    },
    apply: (enabled) => transitions.push(enabled),
  });
  expect(consent.enabled).toBe(false);
  expect(() => consent.choose("essential")).not.toThrow();
  expect(transitions).toEqual([false, false]);
});
