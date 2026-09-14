import { describe, expect, it } from "vitest";
import {
  decideDirection,
  isEarlyLeave,
  isLate,
  parseWorkDays,
  timeToMinutes,
  type TimeWindows,
} from "./attendance-rules";

const settings: TimeWindows = {
  checkin_start: "06:00:00",
  checkin_end: "10:00:00",
  checkout_start: "14:00:00",
  checkout_end: "19:00:00",
  late_after: "08:00:00",
  late_grace_minutes: 5,
  early_leave_before: "15:00:00",
  work_days: "1,2,3,4,5",
  block_non_work_days: true,
};

const at = (t: string) => timeToMinutes(t);

describe("timeToMinutes", () => {
  it("parses both HH:mm and HH:mm:ss", () => {
    expect(at("00:00")).toBe(0);
    expect(at("08:30:00")).toBe(510);
    expect(at("23:59")).toBe(1439);
  });
});

describe("parseWorkDays", () => {
  it("parses a list and falls back to Mon–Fri", () => {
    expect(parseWorkDays("1,2,3")).toEqual([1, 2, 3]);
    expect(parseWorkDays("")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkDays(null)).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkDays("9,x")).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("decideDirection", () => {
  it("records check-in inside the check-in window", () => {
    expect(decideDirection(settings, at("07:00"), null, 1)).toEqual({
      allowed: true,
      direction: "in",
    });
  });

  it("records check-out inside the check-out window", () => {
    expect(decideDirection(settings, at("16:00"), null, 3)).toEqual({
      allowed: true,
      direction: "out",
    });
  });

  it("rejects scans between the two windows", () => {
    const result = decideDirection(settings, at("12:26"), null, 1);
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ reason: "out_of_window" });
  });

  it("rejects scans before and after the whole day", () => {
    expect(decideDirection(settings, at("05:30"), null, 1).allowed).toBe(false);
    expect(decideDirection(settings, at("20:30"), null, 1).allowed).toBe(false);
  });

  it("never turns a mid-day scan into a check-out", () => {
    const result = decideDirection(settings, at("12:26"), null, 1);
    expect(result.allowed).toBe(false);
  });

  it("honours an explicit direction only when its window is open", () => {
    expect(decideDirection(settings, at("07:00"), "out", 1).allowed).toBe(false);
    expect(decideDirection(settings, at("16:00"), "out", 1).allowed).toBe(true);
    expect(decideDirection(settings, at("16:00"), "in", 1).allowed).toBe(false);
  });

  it("accepts the window boundaries", () => {
    expect(decideDirection(settings, at("06:00"), null, 1).allowed).toBe(true);
    expect(decideDirection(settings, at("10:00"), null, 1).allowed).toBe(true);
    expect(decideDirection(settings, at("19:00"), null, 1).allowed).toBe(true);
  });

  it("blocks non-working days when configured", () => {
    expect(decideDirection(settings, at("07:00"), null, 0)).toMatchObject({
      allowed: false,
      reason: "non_work_day",
    });
    const open = { ...settings, block_non_work_days: false };
    expect(decideDirection(open, at("07:00"), null, 0).allowed).toBe(true);
  });
});

describe("late and early leave", () => {
  it("applies the grace period", () => {
    expect(isLate(settings, at("08:03"), "in")).toBe(false);
    expect(isLate(settings, at("08:06"), "in")).toBe(true);
    expect(isLate(settings, at("16:00"), "out")).toBe(false);
  });

  it("flags leaving before the earliest leave time", () => {
    expect(isEarlyLeave(settings, at("14:30"), "out")).toBe(true);
    expect(isEarlyLeave(settings, at("16:00"), "out")).toBe(false);
    expect(isEarlyLeave(settings, at("07:00"), "in")).toBe(false);
    expect(isEarlyLeave({ ...settings, early_leave_before: null }, at("14:30"), "out")).toBe(false);
  });
});
