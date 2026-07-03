import { describe, expect, it } from 'vitest';

import {
  HexGrid,
  createGame,
  hexCellId,
  levelFromAscii,
  move,
  moveTo,
  remainingMowable,
  type CellId,
  type CellTraits,
  type GameState,
  type InputDirection,
  type Level,
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

describe('moveTo — cell-driven moves (click/tap-to-move)', () => {
  const level = levelFromAscii(['S..', '...', '...'].join('\n'));

  it('enters an adjacent cell, applying the same rules as move', () => {
    const start = createGame(level);
    const result = moveTo(start, '1,0'); // east neighbour of the start
    expect(result.outcome).toBe('moved');
    expect(result.state.position).toBe('1,0');
    expect(result.state.mowed.has('1,0')).toBe(true);
  });

  it('rejects a non-neighbour target as blocked, with no state change', () => {
    const start = createGame(level);
    const result = moveTo(start, '2,2'); // far corner, not adjacent
    expect(result.outcome).toBe('blocked');
    expect(result.state).toBe(start);
  });

  it('rejects the mower’s own cell (a stray tap can’t re-mow in place)', () => {
    const start = createGame(level);
    const result = moveTo(start, start.position);
    expect(result.outcome).toBe('blocked');
    expect(result.state).toBe(start);
  });

  it('hard-fails when the neighbour is an already-mowed grass tile', () => {
    const start = createGame(level);
    const east = moveTo(start, '1,0'); // mow (1,0)
    const back = moveTo(east.state, '0,0'); // back onto the mowed start → fail
    expect(back.outcome).toBe('lost');
    expect(back.state.status).toBe('lost');
  });

  it('does nothing once the game is finished', () => {
    const start = createGame(level);
    const lost = moveTo(moveTo(start, '1,0').state, '0,0');
    expect(lost.state.status).toBe('lost');
    const after = moveTo(lost.state, '2,0');
    expect(after.outcome).toBe('blocked');
    expect(after.state).toBe(lost.state);
  });
});

describe('hex level through the unchanged core (via moveTo)', () => {
  // A 2×2 flat-top hex, all grass. Adjacency (odd-q offset packing) admits the
  // Hamiltonian path (0,0)→(1,0)→(1,1)→(0,1), and (0,0) is a neighbour of (1,0).
  const GRASS: CellTraits = { passable: true, mowable: true };
  function hexLevel(): Level {
    const topology = new HexGrid(2, 2);
    const traits = new Map<CellId, CellTraits>();
    for (const cell of topology.cells) traits.set(cell, GRASS);
    return { topology, traits, start: hexCellId(0, 0) };
  }

  it('drives a hardcoded hex level to a win by mowing every tile once', () => {
    let state = createGame(hexLevel());
    expect(state.totalMowable).toBe(4);
    for (const target of [hexCellId(1, 0), hexCellId(1, 1), hexCellId(0, 1)]) {
      const result = moveTo(state, target);
      expect(result.outcome === 'moved' || result.outcome === 'won').toBe(true);
      state = result.state;
    }
    expect(state.status).toBe('won');
    expect(remainingMowable(state)).toEqual([]);
  });

  it('hard-fails on the same core rule when it revisits a mowed hex tile', () => {
    let state = createGame(hexLevel());
    state = moveTo(state, hexCellId(1, 0)).state; // mow (1,0)
    const back = moveTo(state, hexCellId(0, 0)); // back onto the mowed start
    expect(back.outcome).toBe('lost');
    expect(back.state.status).toBe('lost');
    expect(back.state.position).toBe(hexCellId(0, 0));
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
