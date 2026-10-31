import { describe, expect, it } from 'vitest';
import {
  burnTime,
  burstRadius,
  flight,
  flightRk4,
  integrateStar,
  linearDrag,
  placeStar,
  STAR_CLASSES,
  STAR_KINDS,
  starTable,
} from '../src/gpu/shells/star.ts';

// Story 2.1: the star model, and the stateless ways a shader can place a star.

const directions = Array.from({ length: 24 }, (_, i) => {
  const a = ((i * 15 + 7) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)] as const;
});

describe('star model', () => {
  it("has hello's closed form right for drag proportional to speed", () => {
    const [k, g, speed, dt] = [2, 9.81, 60, 1e-4];
    for (const [dx, dy] of directions.slice(0, 6)) {
      let [x, y, vx, vy] = [0, 0, dx * speed, dy * speed];
      for (let i = 0; i < 15000; i++) {
        vx -= k * vx * dt;
        vy -= (g + k * vy) * dt;
        x += vx * dt;
        y += vy * dt;
      }
      const c = linearDrag(speed, k, g, dx, dy, 1.5);
      expect(Math.hypot(c.x - x, c.y - y)).toBeLessThan(0.05);
    }
  });

  it('converges as its steps shrink', () => {
    const c = STAR_CLASSES.medium;
    const a = integrateStar(c, 0.6, 0.8, 1.5, 4e-4);
    const b = integrateStar(c, 0.6, 0.8, 1.5, 1e-4);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.05);
  });

  it('keeps spreading until it burns out, and falls slowly', () => {
    for (const c of Object.values(STAR_CLASSES)) {
      const end = integrateStar(c, 1, 0, burnTime(c) * 0.999);
      const at1 = integrateStar(c, 1, 0, 1).x;
      // A real burst is still growing a second after the break.
      expect(at1 / end.x).toBeGreaterThan(0.5);
      expect(at1 / end.x).toBeLessThan(0.8);
      // At burn-out it falls at a sixteenth to a fifth of the burst's radius a second.
      expect(-end.vy / end.x).toBeGreaterThan(0.06);
      expect(-end.vy / end.x).toBeLessThan(0.2);
    }
  });

  it('is placed from its table within 1% of the burst radius, in every direction', () => {
    for (const c of Object.values(STAR_KINDS)) {
      const table = starTable(c);
      const radius = burstRadius(table);
      let worst = 0;
      for (const [dx, dy] of directions) {
        for (let t = 0.03; t < burnTime(c); t += burnTime(c) / 13) {
          const e = integrateStar(c, dx, dy, t, 2e-4);
          const s = placeStar(table, dx, dy, t);
          worst = Math.max(worst, Math.hypot(e.x - s.x, e.y - s.y) / radius);
        }
      }
      expect(worst).toBeLessThan(0.01);
    }
  });

  it('is placed from its table far better than by the best constant linear drag', () => {
    const c = STAR_CLASSES.medium;
    const table = starTable(c);
    const radius = burstRadius(table);
    const T = burnTime(c);
    const error = (place: (dx: number, dy: number, t: number) => { x: number; y: number }) => {
      let worst = 0;
      for (const [dx, dy] of directions.filter((_, i) => i % 3 === 0)) {
        for (let t = 0.1; t < T; t += T / 8) {
          const e = integrateStar(c, dx, dy, t, 5e-4);
          const s = place(dx, dy, t);
          worst = Math.max(worst, Math.hypot(e.x - s.x, e.y - s.y) / radius);
        }
      }
      return worst;
    };
    let linear = Infinity;
    for (let k = 0.5; k <= 3; k += 0.05) {
      linear = Math.min(
        linear,
        error((dx, dy, t) => linearDrag(radius * k, k, 9.81, dx, dy, t)),
      );
    }
    const tabled = error((dx, dy, t) => placeStar(table, dx, dy, t));
    expect(linear).toBeGreaterThan(0.05);
    expect(tabled * 5).toBeLessThan(linear);
  });

  it('places stars thrown slower or faster from the speeds it tabulates, within 1% of the burst', () => {
    // Pistils, petals, a crossette's pieces, a shape's inner stars and a canister's fastest. A
    // slower star placed as the full-speed one at a scaled time missed by up to 41% of its travel.
    for (const c of [STAR_KINDS.medium, STAR_KINDS.piece, STAR_KINDS.willow]) {
      const table = starTable(c);
      const radius = burstRadius(table);
      let worst = 0;
      for (const share of [0.12, 0.38, 0.68, 1.1, 1.4]) {
        const thrown = { ...c, speed: c.speed * share };
        for (const [dx, dy] of directions.filter((_, i) => i % 2 === 0)) {
          const times = Array.from({ length: 12 }, (_, i) => ((i + 0.5) / 12) * burnTime(c));
          flight(thrown, dx, dy, times, 2e-4).forEach((e, i) => {
            const s = placeStar(table, dx, dy, times[i]!, share);
            worst = Math.max(worst, Math.hypot(e.x - s.x, e.y - s.y) / radius);
          });
        }
      }
      expect(worst).toBeLessThan(0.01);
    }
  });

  it('is tabulated by Runge-Kutta as the small-step reference has it', () => {
    const c = STAR_KINDS.willow;
    const times = [0.5, 1.5, 3, 4.9];
    const reference = flight(c, 0.6, 0.8, times, 1e-4);
    const quick = flightRk4(c, 0.6, 0.8, times);
    quick.forEach((q, i) => {
      expect(Math.hypot(q.x - reference[i]!.x, q.y - reference[i]!.y)).toBeLessThan(0.05);
    });
  });
});
