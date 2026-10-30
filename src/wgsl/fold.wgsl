// fold.wgsl -- folds the plane into a symmetry group's fundamental domain (The Hero's Journey's story 4.1).
// TypeScript twin, with the reasoning and the coordinate conventions: src/gpu/symmetry/fold.ts.
// tests/fold-gpu.test.ts checks this against it.
//
//   fold_point(group, p, order) -> Fold     group: an index into SYMMETRY_GROUPS (fold.ts):
//     0 p1, 1 p2, 2 pm, 3 pg, 4 cm, 5 pmm, 6 pmg, 7 pgg, 8 cmm, 9 p4, 10 p4m, 11 p4g,
//     12 p3, 13 p3m1, 14 p31m, 15 p6, 16 p6m, 17 Cn, 18 Dn (rosettes, n = order)
//   Fold.p   the point in the domain, in lattice units
//   Fold.j   the linear part of the isometry applied: sample textures with
//            textureSampleGrad(t, s, uv, f.j * dpdx(p), f.j * dpdy(p)) so translation wraps and
//            turns leave no grey line (mirrors are fine either way; fold.ts has the numbers)
//   Fold.n   reflections and rotations applied, for colouring by depth of reflection
//
// Cost: a handful of comparisons and at most one sin/cos pair per step; a hexagonal group adds a
// four-candidate nearest lattice point. Close to free next to anything drawn in the domain.

struct Fold {
  p: vec2f,
  j: mat2x2f,
  n: u32,
}

const FOLD_SQRT3 = 1.7320508075688772;
const FOLD_PI = 3.141592653589793;

fn fold_apply(f: ptr<function, Fold>, m: mat2x2f, t: vec2f) {
  (*f).p = m * (*f).p + t;
  (*f).j = m * (*f).j;
  (*f).n += 1u;
}

fn fold_wrap_square(f: ptr<function, Fold>) {
  (*f).p = (*f).p - floor((*f).p);
}

fn fold_wrap_hex(f: ptr<function, Fold>) {
  let p = (*f).p;
  let v = 2.0 * p.y / FOLD_SQRT3;
  let u = p.x - 0.5 * v;
  var best = 1e30;
  var shift = vec2f(0.0);
  for (var du = 0; du < 2; du++) {
    for (var dv = 0; dv < 2; dv++) {
      let lu = floor(u) + f32(du);
      let lv = floor(v) + f32(dv);
      let l = vec2f(lu + 0.5 * lv, lv * FOLD_SQRT3 * 0.5);
      let d = dot(p - l, p - l);
      if (d < best) {
        best = d;
        shift = l;
      }
    }
  }
  (*f).p = p - shift;
}

fn fold_mirror_x(f: ptr<function, Fold>, c: f32) {
  if ((*f).p.x > c) {
    fold_apply(f, mat2x2f(-1.0, 0.0, 0.0, 1.0), vec2f(2.0 * c, 0.0));
  }
}

fn fold_mirror_y(f: ptr<function, Fold>, c: f32) {
  if ((*f).p.y > c) {
    fold_apply(f, mat2x2f(1.0, 0.0, 0.0, -1.0), vec2f(0.0, 2.0 * c));
  }
}

fn fold_sector(f: ptr<function, Fold>, start: f32, width: f32) {
  let count = round(2.0 * FOLD_PI / width);
  let a = atan2((*f).p.y, (*f).p.x);
  let k = floor((a - start) / width);
  let turns = k - count * floor(k / count);
  if (turns == 0.0) {
    return;
  }
  let r = -turns * width;
  fold_apply(f, mat2x2f(cos(r), sin(r), -sin(r), cos(r)), vec2f(0.0));
}

fn fold_mirror_angle(f: ptr<function, Fold>, phi: f32) {
  let normal = vec2f(-sin(phi), cos(phi));
  if (dot((*f).p, normal) <= 0.0) {
    return;
  }
  let c = cos(2.0 * phi);
  let s = sin(2.0 * phi);
  fold_apply(f, mat2x2f(c, s, s, -c), vec2f(0.0));
}

fn fold_point(group_id: u32, p: vec2f, order: f32) -> Fold {
  var f = Fold(p, mat2x2f(1.0, 0.0, 0.0, 1.0), 0u);
  let flip_y = mat2x2f(1.0, 0.0, 0.0, -1.0);
  let flip_x = mat2x2f(-1.0, 0.0, 0.0, 1.0);
  switch group_id {
    case 0u: {
      fold_wrap_square(&f);
    }
    case 1u: {
      fold_wrap_square(&f);
      if (f.p.y >= 0.5) {
        fold_apply(&f, mat2x2f(-1.0, 0.0, 0.0, -1.0), vec2f(1.0, 1.0));
      }
    }
    case 2u: {
      fold_wrap_square(&f);
      fold_mirror_x(&f, 0.5);
    }
    case 3u: {
      fold_wrap_square(&f);
      if (f.p.x >= 0.5) {
        fold_apply(&f, flip_x, vec2f(1.0, 0.5));
        f.p.y -= floor(f.p.y);
      }
    }
    case 4u, 8u: {
      fold_wrap_square(&f);
      if (f.p.y >= 0.5) {
        f.p -= vec2f(0.5);
        f.p.x -= floor(f.p.x);
      }
      fold_mirror_x(&f, 0.5);
      if (group_id == 8u && f.p.y > 0.25) {
        fold_apply(&f, flip_y, vec2f(0.5, 0.5));
        f.p.x -= floor(f.p.x);
        fold_mirror_x(&f, 0.5);
      }
    }
    case 5u: {
      fold_wrap_square(&f);
      fold_mirror_x(&f, 0.5);
      fold_mirror_y(&f, 0.5);
    }
    case 6u: {
      fold_wrap_square(&f);
      if (f.p.x >= 0.5) {
        fold_apply(&f, flip_y, vec2f(-0.5, 1.0));
        f.p.y -= floor(f.p.y);
      }
      fold_mirror_x(&f, 0.25);
    }
    case 7u: {
      fold_wrap_square(&f);
      if (f.p.x >= 0.5) {
        fold_apply(&f, flip_y, vec2f(-0.5, 0.5));
        f.p.y -= floor(f.p.y);
      }
      if (f.p.y >= 0.5) {
        fold_apply(&f, flip_x, vec2f(0.5, -0.5));
      }
    }
    case 9u, 10u, 11u: {
      fold_wrap_square(&f);
      f.p -= vec2f(0.5);
      // A quarter turn the other way, (x, y) -> (y, -x), until the point is in the first quadrant.
      for (var i = 0; i < 3; i++) {
        if (f.p.x >= 0.0 && f.p.y >= 0.0) {
          break;
        }
        fold_apply(&f, mat2x2f(0.0, -1.0, 1.0, 0.0), vec2f(0.0));
      }
      if (group_id == 10u && f.p.y > f.p.x) {
        fold_apply(&f, mat2x2f(0.0, 1.0, 1.0, 0.0), vec2f(0.0));
      }
      if (group_id == 11u && f.p.x + f.p.y > 0.5) {
        fold_apply(&f, mat2x2f(0.0, -1.0, -1.0, 0.0), vec2f(0.5, 0.5));
      }
      f.p += vec2f(0.5);
    }
    case 12u: {
      fold_wrap_hex(&f);
      fold_sector(&f, 0.0, 2.0 * FOLD_PI / 3.0);
    }
    case 13u: {
      fold_wrap_hex(&f);
      fold_sector(&f, -FOLD_PI / 6.0, 2.0 * FOLD_PI / 3.0);
      fold_mirror_angle(&f, FOLD_PI / 6.0);
    }
    case 14u: {
      fold_wrap_hex(&f);
      fold_sector(&f, 0.0, 2.0 * FOLD_PI / 3.0);
      fold_mirror_angle(&f, FOLD_PI / 3.0);
    }
    case 15u, 16u: {
      fold_wrap_hex(&f);
      fold_sector(&f, 0.0, FOLD_PI / 3.0);
      if (group_id == 16u) {
        fold_mirror_angle(&f, FOLD_PI / 6.0);
      }
    }
    default: {
      let n = max(1.0, round(order));
      fold_sector(&f, 0.0, 2.0 * FOLD_PI / n);
      if (group_id == 18u) {
        fold_mirror_angle(&f, FOLD_PI / n);
      }
    }
  }
  return f;
}
