// The single hardcoded level M2 ships so a human can play start→win in the
// browser. Authored in ASCII long-form (see model/ascii.ts); the seeded generator
// (M3) will produce the same Level shape, at which point this becomes a fallback /
// tutorial map. It has a perfect mow — verified solvable by unit test — with a few
// scattered obstacles so the routing is a real (if gentle) puzzle.
//
//   S . . . . .
//   . . . # . .
//   . . . . . #
//   . . # . . .
//   . . . . . .
export const DEMO_LEVEL_MAP = ['S.....', '...#..', '.....#', '..#...', '......'].join('\n');
