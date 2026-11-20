// Exact solver and worked-solution writer for "two equations I and II: find the relation between x and y" questions.
//
// Plain JS with no Node-only imports, because the browser (live preview while typing) and the server (the answer that gets
// stored) must give the same result: the server never trusts a solution sent by a browser, it recomputes it with this file.
//
// Numbers are exact. A coefficient or root is a "surd": a sum of rational multiples of square roots of distinct squarefree
// integers (5√6 is one term, (5√6 + 3√2)/12 is two). Square roots of distinct squarefree integers are linearly independent
// over the rationals, so two surds are equal exactly when every coefficient of their difference is zero, and the sign of a
// non-zero difference is read safely from a high-precision evaluation. No decimal rounding ever decides an answer.
//
// What it understands: one variable per equation, any mix of + − × ( ) ^2 ² √n and plain decimals/fractions of numbers, both
// sides of "=", up to degree 2. Coefficients may be rational or one rational multiple of a single √ (the bank-exam style
// 6x² − 5√6x + 4 = 0); the discriminant must then come out a plain number. Anything else is refused with a clear message.

export class QuadraticError extends Error {
  constructor(message) {
    super(message)
    this.name = 'QuadraticError'
  }
}
const fail = (message) => {
  throw new QuadraticError(message)
}

// ---------------------------------------------------------------------------------------------- fractions (BigInt)

const abs = (x) => (x < 0n ? -x : x)
function gcd(a, b) {
  a = abs(a)
  b = abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}
function frac(n, d = 1n) {
  n = BigInt(n)
  d = BigInt(d)
  if (d === 0n) fail('Division by zero in the equation.')
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = gcd(n, d)
  return g > 1n ? { n: n / g, d: d / g } : { n, d }
}
const fAdd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d)
const fMul = (a, b) => frac(a.n * b.n, a.d * b.d)
const fNeg = (a) => ({ n: -a.n, d: a.d })
const fSign = (a) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0)
const fIsZero = (a) => a.n === 0n
const fIsInt = (a) => a.d === 1n
const ONE = frac(1n)
const fNum = (a) => Number(a.n) / Number(a.d)

const MAX_SQUARE_ARG = 10n ** 13n

/** n = s² · r with r squarefree. */
function squareSplit(n) {
  if (n > MAX_SQUARE_ARG) fail('A number in the equation is too large for this solver.')
  let m = Number(n)
  let s = 1
  let r = 1
  for (let p = 2; p * p <= m; p++) {
    if (m % p !== 0) continue
    let e = 0
    while (m % p === 0) {
      m /= p
      e++
    }
    s *= p ** (e >> 1)
    if (e & 1) r *= p
  }
  r *= m
  return { s: BigInt(s), r: BigInt(r) }
}

function isqrt(n) {
  if (n < 2n) return n
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1) // a power of two at or above √n
  for (;;) {
    const y = (x + n / x) >> 1n
    if (y >= x) return x
    x = y
  }
}

// -------------------------------------------------------------------------------------------------------- surds
// A surd is a Map: squarefree BigInt r -> Frac c, meaning the sum of c·√r (r = 1 is the plain rational part).

const sZero = () => new Map()
const sRat = (f) => (fIsZero(f) ? new Map() : new Map([[1n, f]]))
const sTerm = (c, r) => (fIsZero(c) ? new Map() : new Map([[r, c]]))
function sAdd(a, b) {
  const out = new Map(a)
  for (const [r, c] of b) {
    const sum = out.has(r) ? fAdd(out.get(r), c) : c
    if (fIsZero(sum)) out.delete(r)
    else out.set(r, sum)
  }
  return out
}
const sNeg = (a) => new Map([...a].map(([r, c]) => [r, fNeg(c)]))
const sSub = (a, b) => sAdd(a, sNeg(b))
function sMul(a, b) {
  let out = new Map()
  for (const [r1, c1] of a) {
    for (const [r2, c2] of b) {
      const g = gcd(r1, r2)
      out = sAdd(out, new Map([[(r1 / g) * (r2 / g), fMul(fMul(c1, c2), frac(g))]]))
    }
  }
  return out
}
const sIsZero = (a) => a.size === 0
const sIsRational = (a) => a.size === 0 || (a.size === 1 && a.has(1n))
const sRatPart = (a) => a.get(1n) ?? frac(0n)
/** [r, c] when the surd is exactly one term, else null. */
const sSingle = (a) => (a.size === 1 ? [...a][0] : null)
function sInvSingle(a) {
  const one = sSingle(a)
  if (!one) fail('This equation divides by a number that is not a single square root.')
  const [r, c] = one
  // 1/(c√r) = √r / (c·r)
  return new Map([[r, frac(c.d, c.n * r)]])
}
const sScale = (a, f) => (fIsZero(f) ? new Map() : new Map([...a].map(([r, c]) => [r, fMul(c, f)])))
const sNum = (a) => [...a].reduce((t, [r, c]) => t + fNum(c) * Math.sqrt(Number(r)), 0)

const PREC = 10n ** 60n
/** Sign (−1, 0, 1) of a surd. Zero only when it is exactly zero; otherwise decided by a 60-digit evaluation. */
function sSign(a) {
  if (a.size === 0) return 0
  if (a.size === 1) return fSign([...a][0][1])
  let total = 0n
  for (const [r, c] of a) {
    const root = r === 1n ? PREC : isqrt(r * PREC * PREC)
    total += (c.n * root) / c.d
  }
  const slack = BigInt(a.size + 1)
  if (total > slack) return 1
  if (total < -slack) return -1
  fail('Two roots are too close to compare.')
}
const sCmp = (a, b) => sSign(sSub(a, b))

/** √(n/d) as a surd. */
function sqrtFrac(f) {
  if (fSign(f) < 0) fail('The equation has the square root of a negative number.')
  if (fIsZero(f)) return sZero()
  const { s, r } = squareSplit(f.n * f.d)
  return sTerm(frac(s, f.d), r)
}

// --------------------------------------------------------------------------------------------------- polynomials
// Index = power; each coefficient is a surd. Degree is capped so a typo cannot make a huge expression.

const MAX_DEGREE = 4
const pTrim = (p) => {
  const out = [...p]
  while (out.length > 0 && sIsZero(out[out.length - 1])) out.pop()
  return out
}
const pConst = (s) => pTrim([s])
function pAdd(p, q) {
  const n = Math.max(p.length, q.length)
  return pTrim(Array.from({ length: n }, (_, i) => sAdd(p[i] ?? sZero(), q[i] ?? sZero())))
}
const pNeg = (p) => p.map(sNeg)
const pSub = (p, q) => pAdd(p, pNeg(q))
function pMul(p, q) {
  if (p.length === 0 || q.length === 0) return []
  const out = Array.from({ length: p.length + q.length - 1 }, () => sZero())
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) out[i + j] = sAdd(out[i + j], sMul(p[i], q[j]))
  const trimmed = pTrim(out)
  if (trimmed.length - 1 > MAX_DEGREE) fail('The equation has a power higher than 2 in it. This solver handles equations up to degree 2.')
  return trimmed
}
const pDegree = (p) => p.length - 1

// ------------------------------------------------------------------------------------------------------- parsing

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }

/** What a person typed or pasted, made into plain text the tokenizer can read (no spaces at all). */
function normalizeMath(text) {
  return String(text ?? '')
    .replace(/[⁰¹²³⁴-⁹]+/g, (run) => `^${[...run].map((c) => SUP[c]).join('')}`)
    .normalize('NFKC')
    .replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    .replace(/[−–—‒﹣－]/g, '-')
    .replace(/[×✕⨯·∗]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '')
}

function tokenize(src) {
  const toks = []
  for (let i = 0; i < src.length; ) {
    const ch = src[i]
    if (/\d/.test(ch)) {
      let j = i
      while (j < src.length && /\d/.test(src[j])) j++
      if (src[j] === '.' && /\d/.test(src[j + 1] ?? '')) {
        j++
        while (j < src.length && /\d/.test(src[j])) j++
      }
      const lit = src.slice(i, j)
      if (lit.replace('.', '').length > 7) fail('A number in the equation has too many digits.')
      const [whole, decimals = ''] = lit.split('.')
      toks.push({ t: 'num', v: frac(BigInt(whole + decimals), 10n ** BigInt(decimals.length)) })
      i = j
    } else if ('+-*/^()=√'.includes(ch)) {
      toks.push({ t: ch })
      i++
    } else if (/[A-Za-z]/.test(ch)) {
      toks.push({ t: 'var', v: ch })
      i++
    } else {
      fail(`The character "${ch}" is not understood in an equation.`)
    }
  }
  return toks
}

/** Parses one equation "lhs = rhs" into lhs − rhs as a polynomial, and says which letter is the variable. */
function parseEquation(text) {
  const toks = tokenize(normalizeMath(text))
  if (toks.filter((t) => t.t === '=').length !== 1) fail('Each equation needs exactly one "=" sign.')
  let i = 0
  let variable = null
  const peek = () => toks[i]
  const take = () => toks[i++]
  const startsAtom = (t) => t.t === 'num' || t.t === 'var' || t.t === '(' || t.t === '√'

  function parseExpr() {
    let v = parseTerm()
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = take().t
      const r = parseTerm()
      v = op === '+' ? pAdd(v, r) : pSub(v, r)
    }
    return v
  }
  function parseTerm() {
    let v = parseUnary()
    for (;;) {
      const t = peek()
      if (!t) break
      if (t.t === '*') {
        take()
        v = pMul(v, parseUnary())
      } else if (t.t === '/') {
        take()
        const d = parseUnary()
        if (pDegree(d) !== 0) fail('Dividing by an expression with the variable in it is not supported.')
        v = pMul(v, pConst(sInvSingle(d[0])))
      } else if (startsAtom(t)) {
        v = pMul(v, parseUnary())
      } else break
    }
    return v
  }
  function parseUnary() {
    const t = peek()
    if (t && (t.t === '+' || t.t === '-')) {
      take()
      const v = parseUnary()
      return t.t === '-' ? pNeg(v) : v
    }
    return parsePower()
  }
  function parsePower() {
    const base = parseAtom()
    if (peek()?.t !== '^') return base
    take()
    const e = take()
    if (e?.t !== 'num' || !fIsInt(e.v) || e.v.n > 4n) fail('Only whole-number powers up to 4 are understood.')
    let out = pConst(sRat(ONE))
    for (let k = 0n; k < e.v.n; k++) out = pMul(out, base)
    return out
  }
  function parseAtom() {
    const t = take()
    if (!t) fail('The equation ends too early.')
    if (t.t === 'num') return pConst(sRat(t.v))
    if (t.t === 'var') {
      if (variable === null) variable = t.v
      else if (variable !== t.v) fail(`An equation can have only one variable (found both "${variable}" and "${t.v}").`)
      return [sZero(), sRat(ONE)]
    }
    if (t.t === '(') {
      const v = parseExpr()
      if (take()?.t !== ')') fail('A bracket is not closed.')
      return v
    }
    if (t.t === '√') {
      const next = peek()
      let inner
      if (next?.t === 'num') {
        take()
        inner = next.v
      } else if (next?.t === '(') {
        take()
        const v = parseExpr()
        if (take()?.t !== ')') fail('A bracket is not closed.')
        if (!(pDegree(v) <= 0 && sIsRational(v[0] ?? sZero()))) fail('Only the square root of a plain number is understood.')
        inner = sRatPart(v[0] ?? sZero())
      } else fail('A √ must be followed by a number.')
      return pConst(sqrtFrac(inner))
    }
    return fail(`Unexpected "${t.t === 'num' ? 'number' : t.t}" in the equation.`)
  }

  const left = parseExpr()
  if (take()?.t !== '=') fail('Each equation needs a left side, "=", and a right side.')
  const right = parseExpr()
  if (i < toks.length) fail('Something is left over at the end of the equation.')
  if (variable === null) fail('Each equation needs a variable such as x or y.')
  const poly = pSub(left, right)
  if (pDegree(poly) < 1) fail('After simplifying, the variable disappears from the equation.')
  if (pDegree(poly) > 2) fail('The equation has a power higher than 2 in it. This solver handles equations up to degree 2.')
  return { variable, poly }
}

// ------------------------------------------------------------------------------------------------------ printing

const MINUS = '−'
const SUB = ['₀', '₁', '₂', '₃', '₄']
const sup2 = '²'
const fmtFrac = (f) => `${f.n < 0n ? MINUS : ''}${abs(f.n)}${f.d === 1n ? '' : `/${f.d}`}`

/** c·√r with a tidy coefficient: 5√6, −√2, 3√7/4, 5/6, 12. */
function fmtTerm(c, r) {
  if (r === 1n) return fmtFrac(c)
  const neg = c.n < 0n ? MINUS : ''
  const n = abs(c.n)
  const lead = n === 1n ? '' : `${n}`
  return `${neg}${lead}√${r}${c.d === 1n ? '' : `/${c.d}`}`
}

/** A surd as one expression over a common denominator: 2√6/3, (5√6 + 3√2)/12, −7, 0. */
function fmtSurd(a) {
  if (a.size === 0) return '0'
  const terms = [...a].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
  if (terms.length === 1) return fmtTerm(terms[0][1], terms[0][0])
  let lcm = 1n
  for (const [, c] of terms) lcm = (lcm / gcd(lcm, c.d)) * c.d
  let ints = terms.map(([r, c]) => [r, (c.n * lcm) / c.d])
  let g = lcm
  for (const [, n] of ints) g = gcd(g, n)
  ints = ints.map(([r, n]) => [r, n / g])
  const den = lcm / g
  const num = ints
    .map(([r, n], idx) => {
      const body = fmtTerm(frac(abs(n)), r)
      return idx === 0 ? `${n < 0n ? MINUS : ''}${body}` : ` ${n < 0n ? MINUS : '+'} ${body}`
    })
    .join('')
  return den === 1n ? num : `(${num})/${den}`
}

/** 1.633 style, without useless trailing zeros. */
function fmtApprox(a) {
  const x = sNum(a)
  return (Math.abs(x) < 5e-10 ? 0 : x).toFixed(3).replace(/\.?0+$/, '').replace('-', MINUS)
}
const isPlainFraction = (a) => sIsRational(a) && !fIsInt(sRatPart(a))

/** "2√6/3 ≈ 1.633": the approximation only where the exact value is not a whole number. */
const withApprox = (a) => (sIsRational(a) && !isPlainFraction(a) ? fmtSurd(a) : `${fmtSurd(a)} ≈ ${fmtApprox(a)}`)

const paren = (text) => (/^[−-]/.test(text) || /√/.test(text) ? `(${text})` : text)
const radText = (f) => (fIsInt(f) ? `√${f.n}` : `√(${fmtFrac(f)})`)
const wrapIfSum = (text) => (/\s[+−]\s/.test(text) ? `(${text})` : text)

/** The equation in standard form, e.g. "6x² − 5√6x + 4 = 0". `coefs` run from the constant up; each is zero or a single term. */
function standardForm(coefs, v) {
  const parts = []
  for (let k = coefs.length - 1; k >= 0; k--) {
    const a = coefs[k]
    if (sIsZero(a)) continue
    const [r, c] = sSingle(a)
    const mag = frac(abs(c.n), c.d)
    const sym = k === 0 ? '' : k === 1 ? v : `${v}${sup2}`
    let body
    if (k === 0) body = fmtTerm(mag, r)
    else if (r === 1n && mag.n === 1n && mag.d === 1n) body = sym
    else {
      const t = fmtTerm(mag, r)
      body = `${mag.d !== 1n ? `(${t})` : t}${sym}`
    }
    parts.push(parts.length === 0 ? `${c.n < 0n ? MINUS : ''}${body}` : `${c.n < 0n ? MINUS : '+'} ${body}`)
  }
  return `${parts.join(' ')} = 0`
}

// ----------------------------------------------------------------------------------------------- solving one equation

/**
 * Solves one parsed equation and writes its steps. Returns { lines, roots (distinct, ascending), real, surd, final }.
 * `roots` is empty when there are no real roots.
 */
function solveEquation(v, poly, typed) {
  const lines = []
  const coefs = [0, 1, 2].map((k) => poly[k] ?? sZero())
  for (const c of coefs) {
    if (c.size > 1) fail('A coefficient with two different square roots in it is not supported. Each coefficient should be a number or a number times one √.')
  }
  const standard = standardForm(coefs.slice(0, pDegree(poly) + 1), v)
  const squash = (t) => t.replace(/\s+/g, '').replace(/[−-]/g, '-').toLowerCase()
  lines.push(typed)
  if (squash(typed) !== squash(standard)) lines.push(`Standard form: ${standard}`)

  const [c0, b1, a2] = coefs // constant, linear, quadratic
  let surd = coefs.some((s) => !sIsRational(s))

  if (pDegree(poly) === 1) {
    const root = sMul(sNeg(c0), sInvSingle(b1))
    lines.push(`This is a linear equation, so ${v} = −c/b = −(${fmtSurd(c0)})/(${fmtSurd(b1)})`)
    lines.push(`${v} = ${fmtSurd(root)}`)
    if (!sIsRational(root)) surd = true
    return { lines, roots: [root], real: true, surd, final: `${v} = ${fmtSurd(root)}` }
  }

  const q = sMul(sNeg(c0), sInvSingle(a2)) // v² = q when there is no linear term
  if (sIsZero(b1) && sIsRational(q) && !sIsZero(c0)) {
    const qv = sRatPart(q)
    lines.push(`There is no ${v} term, so ${v}${sup2} = −c/a = ${fmtFrac(qv)}`)
    if (fSign(qv) < 0) {
      lines.push('A square cannot be negative, so there are no real roots.')
      return { lines, roots: [], real: false, surd, final: `${v} has no real roots` }
    }
    const root = sqrtFrac(qv)
    lines.push(`${v} = ±${radText(qv)} = ±${fmtSurd(root)}`)
    const roots = [sNeg(root), root].sort(sCmp)
    if (!sIsRational(root)) surd = true
    return { lines, roots, real: true, surd, final: `${v} = ${roots.map(fmtSurd).join(', ')}` }
  }

  // the quadratic formula
  const b2 = sMul(b1, b1)
  const ac4 = sScale(sMul(a2, c0), frac(4n))
  if (!sIsRational(b2) || !sIsRational(ac4)) {
    fail('The value under the square root (b² − 4ac) does not come out as a plain number, so the roots are too complicated for this solver.')
  }
  const b2v = sRatPart(b2)
  const ac4v = sRatPart(ac4)
  const disc = fAdd(b2v, fNeg(ac4v))
  const negB = sNeg(b1)
  const den = sScale(a2, frac(2n))
  const denP = paren(fmtSurd(den))
  const head = sIsZero(b1) ? '' : fmtSurd(negB)
  const over = (inner) => `(${inner}) / ${denP}`
  const pm = (rootTxt) => (head ? `${head} ± ${rootTxt}` : `±${rootTxt}`)

  lines.push(`Use the quadratic formula: ${v} = (−b ± √(b${sup2} − 4ac)) / 2a`)
  lines.push(`Compare with a${v}${sup2} + b${v} + c = 0:  a = ${fmtSurd(a2)},  b = ${fmtSurd(b1)},  c = ${fmtSurd(c0)}`)
  lines.push(`Substitute: ${v} = ${over(pm(`√(${paren(fmtSurd(b1))}${sup2} − 4(${fmtSurd(a2)})(${fmtSurd(c0)}))`))}`)
  const inside = `${fmtFrac(b2v)} ${fSign(ac4v) >= 0 ? MINUS : '+'} ${fmtFrac(frac(abs(ac4v.n), ac4v.d))}`
  lines.push(`Simplify inside the square root: = ${over(pm(`√(${inside})`))}`)
  lines.push(`= ${over(pm(radText(disc)))}`)

  if (fSign(disc) < 0) {
    lines.push(`The value under the square root is negative (${fmtFrac(disc)}), so there are no real roots.`)
    return { lines, roots: [], real: false, surd, final: `${v} has no real roots` }
  }
  const rootD = sqrtFrac(disc)
  if (sIsZero(rootD)) {
    const root = sMul(negB, sInvSingle(den))
    lines.push(`The value under the square root is 0, so both roots are equal: ${v} = ${head || '0'} / ${denP} = ${fmtSurd(root)}`)
    if (!sIsRational(root)) surd = true
    return { lines, roots: [root], real: true, surd, final: `${v} = ${fmtSurd(root)}` }
  }
  const rootTxt = fmtSurd(rootD)
  if (rootTxt !== radText(disc)) lines.push(`Remember: ${radText(disc)} = ${rootTxt}`)
  lines.push(`Therefore: ${v} = ${over(pm(rootTxt))}`)

  const inv = sInvSingle(den)
  const numerator = (sign) => sAdd(negB, sign < 0 ? sNeg(rootD) : rootD)
  const make = (sign) => sMul(numerator(sign), inv)
  for (const [name, sign] of [['First root', 1], ['Second root', -1]]) {
    const raw = head ? `${head} ${sign > 0 ? '+' : MINUS} ${rootTxt}` : `${sign > 0 ? '' : MINUS}${rootTxt}`
    const segs = [`${wrapIfSum(raw)} / ${denP}`]
    const combined = `${wrapIfSum(fmtSurd(numerator(sign)))} / ${denP}`
    if (combined !== segs[0]) segs.push(combined)
    const reduced = fmtSurd(make(sign))
    if (reduced !== segs[segs.length - 1]) segs.push(reduced)
    lines.push(`${name}: ${v} = ${segs.join(' = ')}`)
  }
  const roots = [make(1), make(-1)].sort(sCmp)
  if (roots.some((r) => !sIsRational(r))) surd = true
  return { lines, roots, real: true, surd, final: `${v} = ${roots.map(fmtSurd).join(', ')}` }
}

// --------------------------------------------------------------------------------------------------- comparing

const OPTION_TEXT = ['>', '≥', '<', '≤']

/** Index of the answer: 0 x>y, 1 x≥y, 2 x<y, 3 x≤y, 4 x=y or cannot be established. */
function relation(xs, ys) {
  const min = (r) => r.reduce((m, x) => (sCmp(x, m) < 0 ? x : m))
  const max = (r) => r.reduce((m, x) => (sCmp(x, m) > 0 ? x : m))
  const [minX, maxX, minY, maxY] = [min(xs), max(xs), min(ys), max(ys)]
  const same = (p, q) => sCmp(p, q) === 0
  if (same(minX, maxX) && same(minY, maxY) && same(minX, minY)) return 4
  if (sCmp(minX, maxY) > 0) return 0
  if (sCmp(maxX, minY) < 0) return 2
  if (same(minX, maxY)) return 1
  if (same(maxX, minY)) return 3
  return 4
}

function compareLines(vx, vy, X, Y, rel) {
  const lines = []
  if (!X.real || !Y.real) {
    const who = [!X.real ? vx : null, !Y.real ? vy : null].filter(Boolean).join(' and ')
    lines.push(`${who} has no real roots, so no relationship between ${vx} and ${vy} can be established.`)
    return lines
  }
  for (const [v, roots] of [[vx, X.roots], [vy, Y.roots]]) roots.forEach((r, i) => lines.push(`${v}${SUB[i + 1]} = ${withApprox(r)}`))
  const [minX, maxX] = [X.roots[0], X.roots[X.roots.length - 1]]
  const [minY, maxY] = [Y.roots[0], Y.roots[Y.roots.length - 1]]
  const ap = fmtApprox
  lines.push(`Smallest ${vx} = ${ap(minX)}, largest ${vx} = ${ap(maxX)}`)
  lines.push(`Smallest ${vy} = ${ap(minY)}, largest ${vy} = ${ap(maxY)}`)
  if (rel === 0) lines.push(`Even the smallest ${vx} (${ap(minX)}) is greater than the largest ${vy} (${ap(maxY)}), so every ${vx} is greater than every ${vy}.`)
  else if (rel === 2) lines.push(`Even the largest ${vx} (${ap(maxX)}) is smaller than the smallest ${vy} (${ap(minY)}), so every ${vx} is smaller than every ${vy}.`)
  else if (rel === 1) lines.push(`The smallest ${vx} equals the largest ${vy} (${ap(minX)}), and every other pair has ${vx} greater, so ${vx} ≥ ${vy}.`)
  else if (rel === 3) lines.push(`The largest ${vx} equals the smallest ${vy} (${ap(maxX)}), and every other pair has ${vx} smaller, so ${vx} ≤ ${vy}.`)
  else if (sCmp(minX, maxX) === 0 && sCmp(minY, maxY) === 0 && sCmp(minX, minY) === 0) lines.push(`${vx} and ${vy} always have the same value, so ${vx} = ${vy}.`)
  else lines.push(`The roots overlap: some pairs give ${vx} > ${vy} and some give ${vx} < ${vy}, so no single relationship always holds.`)
  return lines
}

// ------------------------------------------------------------------------------------- canonical form (duplicates)

/** The same equation however it was typed: divided by its leading coefficient when that is a single term. */
function canonicalEquation(poly) {
  let p = poly
  const lead = p[p.length - 1]
  if (lead.size === 1) {
    const inv = sInvSingle(lead)
    p = p.map((c) => sMul(c, inv))
  }
  return p
    .map(
      (c) =>
        [...c]
          .sort((x, y) => (x[0] < y[0] ? -1 : 1))
          .map(([r, f]) => `${r}:${f.n}/${f.d}`)
          .join('+') || '0',
    )
    .join('|')
}

// ------------------------------------------------------------------------------------------------- the public API

export const STEM_HEADER = 'Solve both equations and mark the most specific relationship between the two variables, considering all possible pairs of roots:'

/** "I. 6x² − 5√6x + 4 = 0 / II. …" in any reasonable paste, as two equation strings. */
export function parseQuadraticInput(text) {
  let lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // both on one line: split at the "II." label
  if (lines.length === 1) lines = lines[0].split(/\s(?=(?:II|ii)\s*[.):])/)
  const label = /^(?:Q?\s*\d{1,3}\s*\.?\s*\)|\(\s*(?:II|I|ii|i)\s*\)|(?:II|I|ii|i)\s*[.):])\s*/
  lines = lines.map((l) => {
    let s = l
    for (let k = 0; k < 3; k++) {
      const next = s.replace(label, '')
      if (next === s) break
      s = next
    }
    return s.trim()
  })
  lines = lines.filter(Boolean)
  if (lines.length !== 2) fail('Paste exactly two equations, one on each line (I. and II.).')
  return lines
}

/** The line as shown in the question: even spacing, a real minus sign, ² for ^2. */
function displayEquation(line) {
  const t = normalizeMath(line).replace(/\^2/g, sup2).replace(/\^3/g, '³')
  let out = ''
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    const prev = t[i - 1]
    const binary = (ch === '+' || ch === '-') && i > 0 && !'=(*/^√+-'.includes(prev)
    if (ch === '=') out += ' = '
    else if (binary) out += ` ${ch === '-' ? MINUS : '+'} `
    else if (ch === '-') out += MINUS
    else if (ch === '*') out += '×'
    else out += ch
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Everything about one pasted question: the question text, options, answer, the worked solution, and a canonical
 * form for duplicate detection. Throws QuadraticError (a message fit to show the person) when it cannot be solved.
 */
export function solveQuadraticPair(text) {
  const raw = parseQuadraticInput(text)
  const eqs = raw.map((line) => {
    if (line.length > 160) fail('An equation is too long.')
    return parseEquation(line)
  })
  const [e1, e2] = eqs
  if (e1.variable === e2.variable) fail(`The two equations must use different variables (for example x and y), but both use "${e1.variable}".`)
  const display = raw.map(displayEquation)

  const [X, Y] = eqs.map((e, i) => solveEquation(e.variable, e.poly, display[i]))
  const rel = X.real && Y.real ? relation(X.roots, Y.roots) : 4
  const [vx, vy] = [e1.variable, e2.variable]
  const options = [...OPTION_TEXT.map((o) => `${vx} ${o} ${vy}`), `${vx} = ${vy} or relationship cannot be established`]

  const steps = [
    { title: `Solve Equation I (${vx})`, lines: X.lines },
    { title: `Solve Equation II (${vy})`, lines: Y.lines },
    { title: `Compare ${vx} and ${vy}`, lines: [X.final, Y.final, ...compareLines(vx, vy, X, Y, rel)] },
  ]
  const solution = `${steps.map((s, i) => `Step ${i + 1}: ${s.title}\n${s.lines.join('\n')}`).join('\n')}\nCorrect answer: (${'ABCDE'[rel]}) ${options[rel]}`
  return {
    vars: [vx, vy],
    equations: display,
    stem: `${STEM_HEADER}\nI. ${display[0]}\nII. ${display[1]}`,
    options,
    answerIndex: rel,
    steps,
    solution,
    canonical: `quad|${canonicalEquation(e1.poly)}|${canonicalEquation(e2.poly)}`,
    difficulty: X.surd || Y.surd ? 'hard' : 'medium',
    roots: [X.roots.map(fmtSurd), Y.roots.map(fmtSurd)],
  }
}

/** Canonical form of a stored question stem ("…\nI. …\nII. …"), or null when it is not an equation pair this solver reads. */
export function canonicalOfStem(stem) {
  try {
    const lines = String(stem).split('\n')
    const at = lines.findIndex((l) => /^I\s*\./.test(l))
    if (at < 0) return null
    const [e1, e2] = parseQuadraticInput(lines.slice(at).join('\n')).map((l) => parseEquation(l))
    return `quad|${canonicalEquation(e1.poly)}|${canonicalEquation(e2.poly)}`
  } catch {
    return null
  }
}
