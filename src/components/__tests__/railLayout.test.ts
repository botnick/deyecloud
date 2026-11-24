import { describe, expect, it } from "vitest";
import { railLayout, type Box } from "../HouseScene";

const GAP = 10, EDGE = 6;
const right = (l: number, b: Box) => l + b.w;
const ok = (a: Box, b: Box, W: number) => {
  const [la, lb] = railLayout(a, b, W) as [number, number];
  const [L, R] = a.x <= b.x ? [[la, a], [lb, b]] as const : [[lb, b], [la, a]] as const;
  expect(right(L[0], L[1]) + GAP).toBeLessThanOrEqual(R[0] + 0.01);
  for (const [l, bx] of [[la, a], [lb, b]] as const) { expect(l).toBeGreaterThanOrEqual(EDGE); expect(right(l, bx)).toBeLessThanOrEqual(W - EDGE + 0.01); }
};

describe("railLayout", () => {
  it("separates PV and grid kW readings on a 328px poster (codex repro)", () => {
    ok({ x: 0.44 * 328, w: 84 }, { x: 0.83 * 328, w: 84 }, 328);
  });
  it("separates them on 360px and when the leaders nearly meet during rotation", () => {
    ok({ x: 0.44 * 360, w: 84 }, { x: 0.83 * 360, w: 84 }, 360);
    ok({ x: 180, w: 84 }, { x: 186, w: 84 }, 360);
    ok({ x: 200, w: 84 }, { x: 150, w: 84 }, 328); // order flipped by the camera
  });
  it("keeps a lone reading beside its leader, inside the card", () => {
    expect(railLayout({ x: 100, w: 80 }, null, 328)).toEqual([107, null]);
    const [, l] = railLayout(null, { x: 310, w: 80 }, 328);
    expect(l).toBe(310 - 7 - 80);
  });
  it("leaves room-to-spare pairs untouched", () => {
    expect(railLayout({ x: 80, w: 70 }, { x: 220, w: 70 }, 393)).toEqual([87, 227]);
  });
});
