import { describe, expect, it } from 'vitest';

import {
  createGame,
  levelFromAscii,
  move,
  remainingMowable,
  type GameState,
  type InputDirection,
} from '../../../src/model/index.ts';

/** Drive a sequence of inputs, returning the final result. */
function play(state: GameState, inputs: InputDirection[]) {
  let current = state;
  let last = { state: current, outcome: 'moved' as const } as ReturnType<typeof move>;
  for (const input of inputs) {
    last = move(current, input);
    current = last.state;
  }
  return last;
}

describe('createGame', () => {
  it('starts the mower on the start cell and mows it', () => {
    const level = levelFromAscii(['S.', '..'].join('\n'));
    const state = createGame(level);
    expect(state.position).toBe('0,0');
    expect(state.status).toBe('playing');
    expect(state.mowed.has('0,0')).toBe(true);
    expect(state.totalMowable).toBe(4);
  });

  it('rejects a start on an impassable cell', () => {
    // Hand-build an invalid level: start pinned to an obstacle.
    const level = levelFromAscii('#.\n.S');
    const broken = { ...level, start: '0,0' };
    expect(() => createGame(broken)).toThrow(/not passable/);
  });
});

describe('move — winning', () => {
  it('drives a hardcoded level to a win by mowing every mowable tile once', () => {
    // 2x2 all grass. A Hamiltonian path exists: (0,0)->(1,0)->(1,1)->(0,1).
    const level = levelFromAscii('S.\n..');
    const start = createGame(level);

    const result = play(start, ['right', 'down', 'left']);

    expect(result.outcome).toBe('won');
    expect(result.state.status).toBe('won');
    expect(remainingMowable(result.state)).toEqual([]);
    expect(result.state.mowed.size).toBe(4);
  });

  it('reports won on exactly the final mowing move, not before', () => {
    const level = levelFromAscii('S.\n..');
    let state = createGame(level);

    expect(move(state, 'right').outcome).toBe('moved');
    state = move(state, 'right').state;
    expect(move(state, 'down').outcome).toBe('moved');
    state = move(state, 'down').state;
    expect(move(state, 'left').outcome).toBe('won');
  });
});

describe('move — hard fail on revisiting a mowable tile', () => {
  it('loses when re-entering an already-mowed grass tile', () => {
    const level = levelFromAscii('S.\n..');
    const start = createGame(level);

    // right mows (1,0); left returns to the already-mowed start (0,0) → hard fail.
    const afterRight = move(start, 'right');
    expect(afterRight.outcome).toBe('moved');

    const back = move(afterRight.state, 'left');
    expect(back.outcome).toBe('lost');
    expect(back.state.status).toBe('lost');
    // Mower is moved onto the revisited cell so the UI can point at it.
    expect(back.state.position).toBe('0,0');
  });

  it('ignores further input once lost', () => {
    const level = levelFromAscii('S.\n..');
    const start = createGame(level);
    const lost = play(start, ['right', 'left']); // fail
    expect(lost.state.status).toBe('lost');

    const after = move(lost.state, 'down');
    expect(after.outcome).toBe('blocked');
    expect(after.state).toBe(lost.state);
  });
});

describe('move — blocked (no state change, no fail)', () => {
  it('blocks moving off the board edge', () => {
    const level = levelFromAscii('S.\n..');
    const start = createGame(level);
    const result = move(start, 'up'); // (0,0) has no north neighbor
    expect(result.outcome).toBe('blocked');
    expect(result.state).toBe(start);
  });

  it('blocks moving into an obstacle without failing', () => {
    // S at (0,0), obstacle at (1,0).
    const level = levelFromAscii('S#\n..');
    const start = createGame(level);
    const result = move(start, 'right');
    expect(result.outcome).toBe('blocked');
    expect(result.state.status).toBe('playing');
    expect(result.state.position).toBe('0,0');
  });
});

describe('routing around obstacles', () => {
  it('mows a level with a hole in it', () => {
    // 3x3 with a central obstacle; perimeter is a mowable cycle from the corner.
    const level = levelFromAscii(['S..', '.#.', '...'].join('\n'));
    const start = createGame(level);
    expect(start.totalMowable).toBe(8);

    // Walk the perimeter clockwise, mowing all 8 grass tiles.
    const result = play(start, ['right', 'right', 'down', 'down', 'left', 'left', 'up']);
    expect(result.outcome).toBe('won');
    expect(result.state.mowed.size).toBe(8);
  });
});

describe('forward-compat: passable-but-not-mowable tile', () => {
  it('lets the mower cross path tiles repeatedly without failing (locks the trait split)', () => {
    // Row: S(0,0) grass, P(1,0) path, P(2,0) path, .(3,0) grass.
    // Only the two grass cells are mowable; the path tiles must be crossable any
    // number of times, because the revisit fail is scoped to `mowable`, not "any
    // visited tile". If the rule ever regressed to "visited", the back-and-forth
    // below would (wrongly) fail.
    const level = levelFromAscii('SPP.');
    const start = createGame(level);
    expect(start.totalMowable).toBe(2); // only the two grass cells count
    expect(start.status).toBe('playing'); // last grass still unmowed

    // Cross both paths, then walk back over one path, then forward again.
    const wander = play(start, ['right', 'right', 'left']);
    expect(wander.outcome).toBe('moved');
    expect(wander.state.status).toBe('playing'); // no fail despite re-entering (1,0)
    expect(wander.state.position).toBe('1,0');

    // Continue across the paths to mow the far grass and win.
    const finish = play(wander.state, ['right', 'right']);
    expect(finish.outcome).toBe('won');
    expect(finish.state.mowed.size).toBe(2);
  });

  it('still hard-fails on re-entering a mowed grass tile (rule is not "never fail")', () => {
    const level = levelFromAscii('SP.');
    const start = createGame(level);
    const onPath = move(start, 'right'); // enter path (1,0)
    expect(onPath.outcome).toBe('moved');
    const backToStart = move(onPath.state, 'left'); // back onto mowed grass (0,0)
    expect(backToStart.outcome).toBe('lost');
  });
});
