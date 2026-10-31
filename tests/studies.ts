// Extra configurations for the cost studies, beyond "every effect at its defaults and at each
// preset", which `tests/study.test.ts` runs anyway. Keyed by epic. Use these for sweeps that
// answer a research question (how cost grows with a parameter).

export interface StudyConfig {
  effect: string;
  /** Shown in the report, e.g. "count=220". */
  name: string;
  preset?: string;
  params?: Readonly<Record<string, unknown>>;
  /** What `ctx.gamut` says (story 3.3). Default sRGB. */
  gamut?: 'srgb' | 'p3';
}

export const STUDY_SWEEPS: Readonly<Record<string, readonly StudyConfig[]>> = {
  // Story 2.6: the smoke at three resolutions, in the finale, when it is thickest; and the
  // display with no smoke and no river, to see what the layers cost.
  '3': [
    {
      effect: 'display',
      name: 'finale, smoke at an eighth',
      params: { finale: true, smokeScale: 'eighth' },
    },
    {
      effect: 'display',
      name: 'finale, smoke at a quarter',
      params: { finale: true, smokeScale: 'quarter' },
    },
    {
      effect: 'display',
      name: 'finale, smoke at a half',
      params: { finale: true, smokeScale: 'half' },
    },
    { effect: 'display', name: 'no smoke, no river', params: { smoke: 0, river: false } },
  ],
};
