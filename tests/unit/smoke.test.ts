import { describe, expect, it } from 'vitest';

import { greeting } from '../../src/main.ts';

describe('scaffold smoke test', () => {
  it('exposes a greeting', () => {
    expect(greeting()).toContain('Lawnmower');
  });
});
