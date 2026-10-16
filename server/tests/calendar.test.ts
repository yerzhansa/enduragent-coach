import { describe, expect, it } from "vitest";
import { parseCalendarDay, parseTimeZone, readApiKey, todayIn } from "../src/calendar.js";
import { PINNED_NOW } from "./support/valid-args.js";

describe("readApiKey", () => {
  it.each([undefined, "", "   ", "${INTERVALS_API_KEY}", " ${user_config.key} "])(
    "treats %j as not configured",
    (raw) => {
      expect(readApiKey(raw)).toBeUndefined();
    },
  );

  it("trims a real key", () => {
    expect(readApiKey("  abc123  ")).toBe("abc123");
  });
});

describe("calendar days", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-1-01", "20261021"])("rejects %j", (raw) => {
    expect(parseCalendarDay(raw)).toBeUndefined();
  });

  it("accepts a leap day", () => {
    expect(parseCalendarDay("2028-02-29")).toBe("2028-02-29");
  });

  it("computes today in the athlete's zone, not the server's", () => {
    const losAngeles = parseTimeZone("America/Los_Angeles");
    const almaty = parseTimeZone("Asia/Almaty");
    if (losAngeles === undefined || almaty === undefined) throw new Error("zones must parse");
    expect(todayIn(losAngeles, PINNED_NOW)).toBe("2026-10-19");
    expect(todayIn(almaty, PINNED_NOW)).toBe("2026-10-20");
  });
});
