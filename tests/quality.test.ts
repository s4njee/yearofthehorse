import { describe, expect, it } from 'vitest';
import { adaptQuality, EFFECT_RUNGS, qualityLadder, type QualityHost } from '../src/lib/quality.ts';
import { defaultParams } from '../src/effects/types.ts';
import { loaders } from '../src/effects/registry.generated.ts';

// Story 7.2: the quality ladder steps down while over budget, back up once there is room, restores
// the page's own values, and falls back past its last rung.

function fakeHost(id: string, params: Record<string, unknown>) {
  const scales: number[] = [];
  const host: QualityHost = {
    loaded: { effect: { meta: { id } }, params } as unknown as QualityHost['loaded'],
    setResolutionScale: (scale) => scales.push(scale),
    onStats: () => () => {},
  };
  return { host, scales };
}

describe('adaptive quality', () => {
  it('walks down and back up, restoring the page values', () => {
    // An effect with no rungs of its own walks the shared ones.
    const params = { mirrors: 'rosette', bloom: 0.4 };
    const { host, scales } = fakeHost('hello', params);
    let fellBack = false;
    const governor = adaptQuality(host, {
      budgetMs: 4,
      downAfter: 2,
      upAfter: 3,
      onFallback: () => (fellBack = true),
    });
    const frames = (ms: number, n: number) => {
      for (let i = 0; i < n; i++) governor.observe(ms);
    };
    frames(6, 2);
    expect(governor.rung.label).toBe('three-quarter resolution');
    expect(scales.at(-1)).toBe(0.75);
    frames(6, 2);
    expect(params.bloom).toBe(0);
    frames(6, 2);
    expect(scales.at(-1)).toBe(0.5);
    // Room again: one rung up at a time, each after a stretch under 60% of the budget.
    frames(1, 3);
    expect(scales.at(-1)).toBe(0.75);
    expect(params.bloom).toBe(0);
    frames(1, 6);
    expect(governor.index).toBe(0);
    expect(params).toEqual({ mirrors: 'rosette', bloom: 0.4 });
    expect(scales.at(-1)).toBe(1);
    // Over budget all the way down and past the end.
    frames(9, 2 * qualityLadder('hello').length);
    expect(fellBack).toBe(true);
    governor.destroy();
  });

  it('a near miss resets the count', () => {
    const { host } = fakeHost('hello', { bloom: 0.6 });
    const governor = adaptQuality(host, { budgetMs: 4, downAfter: 3 });
    for (let i = 0; i < 10; i++) {
      governor.observe(5);
      governor.observe(5);
      governor.observe(3);
    }
    expect(governor.index).toBe(0);
  });

  it("every rung names its effect's own parameters", async () => {
    for (const id of Object.keys(EFFECT_RUNGS)) {
      const module = await loaders[id]!();
      const known = defaultParams(module.params);
      for (const rung of qualityLadder(id)) {
        for (const key of Object.keys(rung.params ?? {}))
          expect(known, `${id}: ${key}`).toHaveProperty(key);
      }
    }
  });
});
