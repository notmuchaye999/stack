import { describe, it, expect } from 'vitest';
import { loadPrototype } from './helpers/prototype.js';

describe('prototype harness', () => {
  it('loads the prototype and runs its sample data', () => {
    const P = loadPrototype();
    P.run('loadSample()');
    const S = P.getState();
    expect(S.v).toBe(4);
    expect(S.moves.some(m => m.type === 'pay')).toBe(true);
    const r = P.run('project()');
    expect(r.real).toBe(true);
    P.close();
  });
});
