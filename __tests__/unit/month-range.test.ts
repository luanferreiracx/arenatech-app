import { describe, it, expect } from "vitest";
import { monthRange } from "@/lib/commission/month-range";

describe("monthRange", () => {
  it("starts at midnight of the 1st", () => {
    const { start } = monthRange(2026, 6);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // junho (0-indexed)
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("ends inclusively at 23:59:59.999 of the last day (BUG-3)", () => {
    const { end } = monthRange(2026, 6); // junho tem 30 dias
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("a fact at 14:30 on the last day falls within the range", () => {
    const { start, end } = monthRange(2026, 6);
    const lastDayAfternoon = new Date(2026, 5, 30, 14, 30, 0, 0);
    expect(lastDayAfternoon >= start && lastDayAfternoon <= end).toBe(true);
  });

  it("handles February and December boundaries", () => {
    expect(monthRange(2026, 2).end.getDate()).toBe(28); // 2026 nao e bissexto
    const dec = monthRange(2026, 12);
    expect(dec.end.getMonth()).toBe(11);
    expect(dec.end.getDate()).toBe(31);
  });
});
