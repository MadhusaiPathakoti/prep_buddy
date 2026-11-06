// Exhaustive CSP solver for the mains arrangement engine (variables = attribute*n + value, domain = positions,
// all-different per attribute). Derived from the prelims solver in ../arrange.ts with stronger propagation for
// constraints of arity 3-4 (conditional / exclusive-or / neither-nor / equal-gap clues) and MRV + degree branching.
import type { Constraint, SolveResult } from '../arrange'

const POP = new Uint8Array(1 << 11)
for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1)

const TABLES = new WeakMap<Constraint, Uint8Array | null>()
export const NODES = { n: 0, revise: 0 }
export function solveStrong(nAttrs: number, n: number, cons: Constraint[], limit: number, anchor?: { v: number; mask: number }, maxNodes = Infinity): SolveResult {
  const nv = nAttrs * n
  const consOf: number[][] = Array.from({ length: nv }, () => [])
  cons.forEach((c, i) => c.vars.forEach((v) => consOf[v].push(i)))
  const degree = consOf.map((l) => l.length)
  const sols: number[][] = []
  let nodes = 0
  let aborted = false
  const full = (1 << n) - 1
  const buf = new Array<number>(8).fill(0)

  // truth tables for constraints over <= 3 variables (built lazily), indexed by buf[0] + n*(buf[1] + n*buf[2])
  const tabOf = (ci: number): Uint8Array | null => {
    const c = cons[ci]
    const t = TABLES.get(c)
    if (t !== undefined) return t
    const k = c.vars.length
    if (k > 3) {
      TABLES.set(c, null)
      return null
    }
    const size = n ** k
    const tb = new Uint8Array(size)
    const tmp = [0, 0, 0]
    for (let idx = 0; idx < size; idx++) {
      tmp[0] = idx % n
      tmp[1] = Math.floor(idx / n) % n
      tmp[2] = Math.floor(idx / (n * n))
      tb[idx] = c.test(tmp) ? 1 : 0
    }
    TABLES.set(c, tb)
    return tb
  }
  const fi = [0, 0, 0]
  const sup = [0, 0, 0]
  /** Removes unsupported values of every free variable of constraint c. Returns false on wipe-out. */
  const reviseAll = (ci: number, dom: Int32Array, val: Int8Array, assign: (u: number) => void, touch: (u: number) => void): boolean => {
    NODES.revise++
    const c = cons[ci]
    const tb = tabOf(ci)
    const vars = c.vars
    const k = vars.length
    let f = 0
    for (let i = 0; i < k; i++) {
      const w = vars[i]
      if (val[w] >= 0) buf[i] = val[w]
      else {
        if (f < 3) fi[f] = i
        f++
      }
    }
    if (f === 0) return (tb ? tb[k === 1 ? buf[0] : k === 2 ? buf[0] + n * buf[1] : buf[0] + n * (buf[1] + n * buf[2])] === 1 : c.test(buf))
    if (f > 3) return true
    const i0 = fi[0]
    const u0 = vars[i0]
    const d0 = dom[u0]
    if (f === 1) {
      let nd = d0
      let m = d0
      while (m) {
        const low = m & -m
        m ^= low
        buf[i0] = 31 - Math.clz32(low)
        if (!(tb ? tb[k === 1 ? buf[0] : k === 2 ? buf[0] + n * buf[1] : buf[0] + n * (buf[1] + n * buf[2])] === 1 : c.test(buf))) nd &= ~low
      }
      if (nd !== d0) {
        if (nd === 0) return false
        dom[u0] = nd
        touch(u0)
        if (POP[nd] === 1) assign(u0)
      }
      return true
    }
    const i1 = fi[1]
    const u1 = vars[i1]
    const d1 = dom[u1]
    const same01 = ((u0 / n) | 0) === ((u1 / n) | 0)
    let s0 = 0
    let s1 = 0
    let s2 = 0
    if (f === 2) {
      if (POP[d0] * POP[d1] > 256) return true
      let m0 = d0
      while (m0) {
        const l0 = m0 & -m0
        m0 ^= l0
        const a0 = 31 - Math.clz32(l0)
        buf[i0] = a0
        let m1 = same01 ? d1 & ~l0 : d1
        while (m1) {
          const l1 = m1 & -m1
          m1 ^= l1
          buf[i1] = 31 - Math.clz32(l1)
          if ((tb ? tb[k === 1 ? buf[0] : k === 2 ? buf[0] + n * buf[1] : buf[0] + n * (buf[1] + n * buf[2])] === 1 : c.test(buf))) {
            s0 |= l0
            s1 |= l1
          }
        }
      }
    } else {
      const i2 = fi[2]
      const u2 = vars[i2]
      const d2 = dom[u2]
      if (POP[d0] * POP[d1] * POP[d2] > 600) return true
      const same02 = ((u0 / n) | 0) === ((u2 / n) | 0)
      const same12 = ((u1 / n) | 0) === ((u2 / n) | 0)
      let m0 = d0
      while (m0) {
        const l0 = m0 & -m0
        m0 ^= l0
        buf[i0] = 31 - Math.clz32(l0)
        let m1 = same01 ? d1 & ~l0 : d1
        while (m1) {
          const l1 = m1 & -m1
          m1 ^= l1
          buf[i1] = 31 - Math.clz32(l1)
          let m2 = d2
          if (same02) m2 &= ~l0
          if (same12) m2 &= ~l1
          while (m2) {
            const l2 = m2 & -m2
            m2 ^= l2
            buf[i2] = 31 - Math.clz32(l2)
            if ((tb ? tb[k === 1 ? buf[0] : k === 2 ? buf[0] + n * buf[1] : buf[0] + n * (buf[1] + n * buf[2])] === 1 : c.test(buf))) {
              s0 |= l0
              s1 |= l1
              s2 |= l2
            }
          }
        }
      }
    }
    sup[0] = s0
    sup[1] = s1
    sup[2] = s2
    for (let t = 0; t < f; t++) {
      const u = vars[fi[t]]
      const nd = dom[u] & sup[t]
      if (nd !== dom[u]) {
        if (nd === 0) return false
        dom[u] = nd
        touch(u)
        if (POP[nd] === 1) assign(u)
      }
    }
    return true
  }

  const inQ = new Uint8Array(cons.length)
  const propagate = (dom: Int32Array, val: Int8Array, queue: number[], allCons = false): boolean => {
    const cq: number[] = []
    inQ.fill(0)
    if (allCons) for (let i = 0; i < cons.length; i++) if (cons[i].vars.length > 1) { cq.push(i); inQ[i] = 1 }
    let cur = -1
    const touch = (u: number): void => {
      for (const ci of consOf[u]) {
        if (ci !== cur && !inQ[ci]) {
          inQ[ci] = 1
          cq.push(ci)
        }
      }
    }
    const assign = (u: number): void => {
      val[u] = 31 - Math.clz32(dom[u])
      queue.push(u)
    }
    for (;;) {
      while (queue.length) {
        const v = queue.pop() as number
        const bit = 1 << val[v]
        const a = (v / n) | 0
        for (let u = a * n; u < a * n + n; u++) {
          if (u === v) continue
          if (val[u] >= 0) {
            if (val[u] === val[v]) return false
            continue
          }
          if (dom[u] & bit) {
            dom[u] &= ~bit
            if (dom[u] === 0) return false
            touch(u)
            if (POP[dom[u]] === 1) assign(u)
          }
        }
        for (const ci of consOf[v]) {
          if (!inQ[ci]) {
            inQ[ci] = 1
            cq.push(ci)
          }
        }
      }
      if (!cq.length) break
      const ci = cq.pop() as number
      inQ[ci] = 0
      cur = ci
      if (!reviseAll(ci, dom, val, assign, touch)) return false
      cur = -1
    }
    return true
  }

  const dfs = (dom: Int32Array, val: Int8Array): void => {
    if (sols.length >= limit || aborted) return
    NODES.n++
    if (++nodes > maxNodes) {
      aborted = true
      return
    }
    let best = -1
    let bs = 99
    let bd = -1
    for (let v = 0; v < nv; v++) {
      if (val[v] < 0) {
        const s = POP[dom[v]]
        if (s < bs || (s === bs && degree[v] > bd)) {
          bs = s
          bd = degree[v]
          best = v
        }
      }
    }
    if (best < 0) {
      sols.push(Array.from(val))
      return
    }
    let m = dom[best]
    while (m) {
      const low = m & -m
      m ^= low
      const d2 = dom.slice()
      const v2 = val.slice()
      d2[best] = low
      v2[best] = 31 - Math.clz32(low)
      if (propagate(d2, v2, [best])) dfs(d2, v2)
      if (sols.length >= limit || aborted) return
    }
  }

  const dom0 = new Int32Array(nv).fill(full)
  const val0 = new Int8Array(nv).fill(-1)
  if (anchor) dom0[anchor.v] &= anchor.mask
  for (const c of cons) {
    if (c.vars.length === 1) {
      const v = c.vars[0]
      let m = dom0[v]
      let nd = m
      while (m) {
        const low = m & -m
        m ^= low
        if (!c.test([31 - Math.clz32(low)])) nd &= ~low
      }
      dom0[v] = nd
    }
  }
  if (dom0.some((d) => d === 0)) return { sols, complete: true }
  const q: number[] = []
  for (let v = 0; v < nv; v++) {
    if (POP[dom0[v]] === 1) {
      val0[v] = 31 - Math.clz32(dom0[v])
      q.push(v)
    }
  }
  if (!propagate(dom0, val0, q, true)) return { sols, complete: true }
  dfs(dom0, val0)
  return { sols, complete: !aborted }
}
