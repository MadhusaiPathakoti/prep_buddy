import { bits, pop } from "../../lib/puzzleSolver/core";
import type { Ctx, Grid } from "../../lib/puzzleSolver/core";
import type { Beat, CellRef } from "../../lib/puzzleSolver/trace";

export type BoardMode = "real" | "whatif";

interface BoardProps {
  ctx: Ctx;
  grid: Grid;
  /** the move that was just shown (its crossings flash and its placements pop) */
  beat: Beat | null;
  /** changes whenever a new move is shown, so the animations replay */
  beatKey: string;
  mode: BoardMode;
  clash: boolean;
  /** click a name / city / pip to ask "why is this possible, or not?" (left out while a what-if is playing) */
  onPick?: (cell: CellRef) => void;
  picked?: CellRef | null;
}

const sameCell = (x: CellRef | null | undefined, y: CellRef): boolean =>
  !!x && x.a === y.a && x.i === y.i && x.b === y.b && x.j === y.j;

type Tone = "cand" | "lock" | "out" | "suppose" | "empty";

const CHIP: Record<Tone, string> = {
  cand: "rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
  lock: "rounded-md px-2 py-1 text-sm font-bold leading-none bg-emerald-500 text-white shadow-sm",
  suppose:
    "rounded-md px-2 py-1 text-sm font-bold leading-none bg-amber-400 text-slate-900 shadow-sm",
  out: "rounded px-1 py-0.5 text-[10px] font-semibold leading-none bg-rose-100 text-rose-600 line-through dark:bg-rose-500/20 dark:text-rose-300 animate-chip-out",
  empty:
    "rounded px-1.5 py-0.5 text-xs font-bold leading-none bg-rose-500 text-white",
};

function Chip({
  label,
  tone,
  pop: popIn,
  title,
  onClick,
  selected,
}: {
  label: string;
  tone: Tone;
  pop?: "lock" | "suppose";
  title?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const extra =
    (popIn === "lock"
      ? " animate-chip-lock"
      : popIn === "suppose"
        ? " animate-chip-suppose"
        : "") +
    (selected
      ? " ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-800"
      : "");
  if (!onClick)
    return (
      <span
        title={title ?? label}
        className={`inline-block ${CHIP[tone]}${extra}`}
      >
        {label}
      </span>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title ?? label} — click to see why`}
      aria-pressed={selected}
      className={`inline-block cursor-pointer transition hover:scale-110 hover:ring-2 hover:ring-indigo-400 ${CHIP[tone]}${extra}`}
    >
      {label}
    </button>
  );
}

/** A circular table drawn as a ring of seats: who is seated where so far, numbered in the direction of "to the right of". */
function RoundTable({
  ctx,
  grid,
  beat,
}: {
  ctx: Ctx;
  grid: Grid;
  beat: Beat | null;
}) {
  const { n, p } = ctx;
  const out = p.facing === "out";
  const dir = out ? 1 : -1; // seat + 1 is clockwise when everyone faces outside, anticlockwise when everyone faces the centre
  const cx = 150;
  const cy = 150;
  const R = 100;
  const { fixed } = beatCells(beat);
  return (
    <svg
      viewBox="0 0 300 300"
      className="mx-auto mb-3 h-72 w-72 max-w-full"
      role="img"
      aria-label={`Round table of ${n} seats, everyone facing ${out ? "outside" : "the centre"}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={R}
        className="fill-slate-100 stroke-slate-200 dark:fill-slate-900/50 dark:stroke-slate-700"
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-slate-400 text-[10px] font-semibold dark:fill-slate-500"
      >
        everyone faces {out ? "outside" : "the centre"}
      </text>
      <text
        x={cx}
        y={cy + 9}
        textAnchor="middle"
        className="fill-slate-400 text-[9px] dark:fill-slate-500"
      >
        right = next seat ({dir === 1 ? "clockwise" : "anticlockwise"})
      </text>
      {Array.from({ length: n }, (_, f) => {
        const ang = ((-90 + (dir * f * 360) / n) * Math.PI) / 180;
        const x = cx + R * Math.cos(ang);
        const y = cy + R * Math.sin(ang);
        const mask = grid.row(1, f, 0);
        const locked = pop(mask) === 1;
        const person = locked ? ctx.lab(0, bits(mask)[0]) : null;
        const justFixed = locked && fixed.has(`0.${bits(mask)[0]}.1.${f}`);
        // a small arrow beside each seat showing the way that person faces
        const deg = (ang * 180) / Math.PI;
        const ax = cx + (R + (out ? 31 : -31)) * Math.cos(ang);
        const ay = cy + (R + (out ? 31 : -31)) * Math.sin(ang);
        return (
          <g key={f}>
            <circle
              cx={x}
              cy={y}
              r="24"
              style={{ transformBox: "fill-box", transformOrigin: "center" }} // so the pop animation grows from the seat, not from the corner of the picture
              className={[
                locked
                  ? "fill-emerald-500"
                  : "fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600",
                justFixed ? "animate-chip-lock" : "",
              ].join(" ")}
              strokeWidth="1.5"
            />
            <text
              x={x}
              y={y - 5}
              textAnchor="middle"
              className={[
                "text-[9px] font-bold",
                locked
                  ? "fill-emerald-100"
                  : "fill-slate-400 dark:fill-slate-500",
              ].join(" ")}
            >
              {ctx.posNum(f)}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor="middle"
              className={[
                "text-[11px] font-extrabold",
                locked ? "fill-white" : "fill-slate-300 dark:fill-slate-600",
              ].join(" ")}
            >
              {person ?? "?"}
            </text>
            <polygon
              points="0,-5 4,3 -4,3"
              transform={`translate(${ax} ${ay}) rotate(${deg + (out ? 90 : -90)})`}
              className="fill-slate-300 dark:fill-slate-600"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Cells crossed out / settled in the move on show, keyed "a.i.b.j" (normalised a < b). */
function beatCells(beat: Beat | null) {
  const out = new Set<string>();
  const fixed = new Set<string>();
  if (beat)
    for (const e of beat.evs) {
      const key = `${e.a}.${e.i}.${e.b}.${e.j}`;
      if (e.op === "x") out.add(key);
      else fixed.add(key);
    }
  return { out, fixed };
}

export default function Board({
  ctx,
  grid,
  beat,
  beatKey,
  mode,
  clash,
  onPick,
  picked,
}: BoardProps) {
  const { n, p } = ctx;
  const { out, fixed } = beatCells(beat);
  const suppose = mode === "whatif";
  const order = Array.from({ length: n }, (_, f) => f);
  if (p.axis === "floor") order.reverse();
  const cols = 1 + p.cats.length; // person + one per extra category

  /** One cell of the building: everyone / every value still possible at position f. */
  function cell(f: number, cat: number) {
    // cat 0 = person, 2.. = extra categories; the table row is (position f) against that category
    const mask = grid.row(1, f, cat);
    const ghosts = [...Array(n).keys()].filter((j) =>
      out.has(cat === 0 ? `0.${j}.1.${f}` : `1.${f}.${cat}.${j}`),
    );
    if (mask === 0)
      return (
        <div className="flex min-h-[2.25rem] flex-wrap items-center gap-1">
          <Chip label="none left" tone="empty" />
        </div>
      );
    const single = pop(mask) === 1;
    const j = single ? bits(mask)[0] : -1;
    const justFixed =
      single && fixed.has(cat === 0 ? `0.${j}.1.${f}` : `1.${f}.${cat}.${j}`);
    // the table cell behind a chip: person x at position f, or value x of category `cat` at position f
    const ref = (x: number): CellRef =>
      cat === 0 ? { a: 0, i: x, b: 1, j: f } : { a: 1, i: f, b: cat, j: x };
    const pick = (x: number) => (onPick ? () => onPick(ref(x)) : undefined);
    return (
      <div className="flex min-h-[2.25rem] flex-wrap content-center items-center gap-1">
        {single ? (
          <Chip
            label={ctx.lab(cat, j)}
            tone={suppose && justFixed ? "suppose" : "lock"}
            pop={justFixed ? (suppose ? "suppose" : "lock") : undefined}
            onClick={pick(j)}
            selected={sameCell(picked, ref(j))}
          />
        ) : (
          bits(mask).map((x) => (
            <Chip
              key={x}
              label={ctx.shortLab(cat, x)}
              title={ctx.lab(cat, x)}
              tone="cand"
              onClick={pick(x)}
              selected={sameCell(picked, ref(x))}
            />
          ))
        )}
        {ghosts.map((x) => (
          <Chip
            key={`g${beatKey}.${x}`}
            label={ctx.shortLab(cat, x)}
            title={`${ctx.lab(cat, x)} crossed out`}
            tone="out"
          />
        ))}
      </div>
    );
  }

  const catHeads = [
    ctx.noun.replace(/^./, (m) => m.toUpperCase()),
    ...p.cats.map((c) => c.name.replace(/^./, (m) => m.toUpperCase())),
  ];
  const vertical = p.axis !== "row" && p.axis !== "tworow";

  /** One seat of a row, with everyone / every value still possible there. */
  const column = (f: number, head: string) => (
    <div
      key={f}
      className="min-w-[3.4rem] flex-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/40"
    >
      <div className="mb-1 text-center text-base font-extrabold text-slate-400 dark:text-slate-500">
        {head}
      </div>
      <div className="space-y-2">
        {[0, ...p.cats.map((_, c) => c + 2)].map((cat) => (
          <div key={cat}>
            {p.cats.length > 0 && (
              <div className="text-[9px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                {catHeads[cat === 0 ? 0 : cat - 1]}
              </div>
            )}
            {cell(f, cat)}
          </div>
        ))}
      </div>
    </div>
  );
  // two facing rows, drawn the way they stand: row 1 (facing south) on top with its own left on the right-hand side of the page,
  // row 2 (facing north) below it, so the person drawn directly under someone is the one facing them
  const m = ctx.rowLen;
  const lanes = [
    {
      r: 0,
      title: "Row 1 · faces south",
      seats: Array.from({ length: m }, (_, c) => m - 1 - c),
    },
    {
      r: 1,
      title: "Row 2 · faces north",
      seats: Array.from({ length: m }, (_, c) => m + c),
    },
  ];
  const flatCols = ctx.cols;
  const floorRows = n / flatCols;
  const labelCol = ctx.dated ? "4.25rem" : ctx.named ? "3rem" : "2.25rem";
  const unitHead = ctx.unit.replace(/^./, (m) => m.toUpperCase());

  return (
    <div
      className={[
        "rounded-3xl p-3 shadow-sm ring-2 transition",
        clash
          ? "animate-clash bg-rose-50 ring-rose-400 dark:bg-rose-500/10"
          : suppose
            ? "bg-amber-50 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/50"
            : "bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span>
          {p.axis === "floor" && p.place
            ? `The stack of ${ctx.nouns}, top first`
            : p.axis === "floor" || p.axis === "grid"
              ? "The building"
              : p.axis === "row"
                ? p.dirCat !== undefined
                  ? "The line, west → east"
                  : "The row, left → right"
                : p.axis === "circle"
                  ? "The round table"
                  : p.axis === "tworow"
                    ? "The two rows"
                    : `The ${ctx.unit}s, first → last`}
        </span>
        {suppose ? (
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">
            WHAT-IF · not the real answer
          </span>
        ) : (
          onPick && (
            <span className="hidden text-[10px] font-medium normal-case tracking-normal sm:inline">
              tip: click any name or city to see why it fits — or doesn't
            </span>
          )
        )}
      </div>

      {p.axis === "circle" && <RoundTable ctx={ctx} grid={grid} beat={beat} />}
      {p.axis === "grid" ? (
        <div
          role="table"
          aria-label="Who could live in which flat"
          className="space-y-1"
        >
          <div
            className="grid items-end gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
            style={{
              gridTemplateColumns: `2.25rem repeat(${flatCols}, minmax(0, 1fr))`,
            }}
          >
            <span>Floor</span>
            {Array.from({ length: flatCols }, (_, c) => (
              <span key={c}>
                Flat {p.flats?.[c] ?? String.fromCharCode(65 + c)}
                {c === 0 && flatCols > 1
                  ? " (west)"
                  : c === flatCols - 1 && flatCols > 1
                    ? " (east)"
                    : ""}
              </span>
            ))}
          </div>
          {Array.from({ length: floorRows }, (_, k) => floorRows - 1 - k).map(
            (r) => (
              <div
                key={r}
                role="row"
                className="grid items-stretch gap-2 rounded-xl bg-slate-50 px-1 py-0.5 dark:bg-slate-900/40"
                style={{
                  gridTemplateColumns: `2.25rem repeat(${flatCols}, minmax(0, 1fr))`,
                }}
              >
                <span className="self-center text-center text-base font-extrabold text-slate-400 dark:text-slate-500">
                  {r + 1}
                </span>
                {Array.from({ length: flatCols }, (_, c) => (
                  <div
                    key={c}
                    role="cell"
                    className="space-y-1 rounded-lg bg-white/70 p-1 ring-1 ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700"
                  >
                    {[0, ...p.cats.map((_, ci) => ci + 2)].map((cat) => (
                      <div key={cat}>{cell(r * flatCols + c, cat)}</div>
                    ))}
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      ) : vertical ? (
        <div
          role="table"
          aria-label={`Who could be at which ${ctx.unit}`}
          className="space-y-1"
        >
          <div
            className="grid items-end gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500"
            style={{
              gridTemplateColumns: `${labelCol} repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            <span>{unitHead}</span>
            {catHeads.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {order.map((f) => (
            <div
              key={f}
              role="row"
              className="grid items-center gap-2 rounded-xl bg-slate-50 px-1 py-0.5 dark:bg-slate-900/40"
              style={{
                gridTemplateColumns: `${labelCol} repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              <span
                className={[
                  "text-center font-extrabold text-slate-400 dark:text-slate-500",
                  ctx.named ? "text-sm" : "text-base",
                ].join(" ")}
              >
                {ctx.posShort(f)}
              </span>
              {[0, ...p.cats.map((_, c) => c + 2)].map((cat) => (
                <div key={cat} role="cell">
                  {cell(f, cat)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : p.axis === "tworow" ? (
        <div className="space-y-1 overflow-x-auto pb-1">
          {lanes.map((lane, li) => (
            <div key={lane.r}>
              {li === 1 && (
                <div className="py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  ↕ the two rows face each other
                </div>
              )}
              <div className="mb-0.5 px-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {lane.title}{" "}
                <span className="font-normal">
                  · seat numbers count from each person's own left
                </span>
              </div>
              <div className="flex gap-1">
                {lane.seats.map((f) => column(f, String(ctx.seatIdx(f) + 1)))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {order.map((f) => column(f, ctx.posShort(f)))}
        </div>
      )}
    </div>
  );
}

/** Who's who: for every person, the floors still possible (pips) and what is known about their other attributes. */
export function PeopleStrip({
  ctx,
  grid,
  beat,
  beatKey,
  onPick,
  picked,
}: Pick<
  BoardProps,
  "ctx" | "grid" | "beat" | "beatKey" | "onPick" | "picked"
>) {
  const { n, p } = ctx;
  const { out } = beatCells(beat);
  const floors = Array.from({ length: n }, (_, f) => f).sort(
    (x, y) => ctx.posNum(x) - ctx.posNum(y),
  );
  // two facing rows: one line of pips per row
  const lines = ctx.tworow
    ? [floors.slice(0, ctx.rowLen), floors.slice(ctx.rowLen)]
    : [floors];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {p.people.map((name, i) => {
        const fm = grid.row(0, i, 1);
        const placed = pop(fm) === 1;
        return (
          <div
            key={name}
            className={[
              "rounded-2xl p-2 ring-1 transition",
              placed
                ? "bg-emerald-50 ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40"
                : "bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                {name}
              </span>
              <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {placed
                  ? ctx.posLab(bits(fm)[0])
                  : `${pop(fm)} ${ctx.unit}s open`}
              </span>
            </div>
            <div
              className="mt-1 space-y-[3px]"
              aria-label={`${name}: possible ${ctx.unit}s`}
            >
              {lines.map((line, li) => (
                <div key={li} className="flex gap-[3px]">
                  {lines.length > 1 && (
                    <span className="flex w-3 shrink-0 items-center justify-center text-[8px] font-bold text-slate-400 dark:text-slate-500">
                      R{li + 1}
                    </span>
                  )}
                  {line.map((f) => {
                    const alive = ((fm >> f) & 1) === 1;
                    const justOut = out.has(`0.${i}.1.${f}`);
                    const cell: CellRef = { a: 0, i, b: 1, j: f };
                    const Tag = onPick ? "button" : "span";
                    return (
                      <Tag
                        key={`${f}${justOut ? beatKey : ""}`}
                        {...(onPick
                          ? {
                              type: "button" as const,
                              onClick: () => onPick(cell),
                            }
                          : {})}
                        title={`${ctx.posLab(f)}${alive ? (placed ? " — placed" : " — still possible") : justOut ? " — just crossed out" : " — ruled out"}${onPick ? " — click to see why" : ""}`}
                        className={[
                          "flex h-4 min-w-0 flex-1 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none",
                          onPick
                            ? "cursor-pointer hover:ring-2 hover:ring-indigo-400"
                            : "",
                          sameCell(picked, cell)
                            ? "ring-2 ring-indigo-500"
                            : "",
                          alive
                            ? placed
                              ? "bg-emerald-500 text-white"
                              : "bg-indigo-200 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-200"
                            : justOut
                              ? "bg-rose-400 text-white animate-pulse"
                              : "bg-slate-100 text-slate-300 dark:bg-slate-700/60 dark:text-slate-600",
                        ].join(" ")}
                      >
                        {ctx.grid
                          ? ctx.posShort(f)
                          : ctx.tworow
                            ? ctx.seatIdx(f) + 1
                            : ctx.posNum(f)}
                      </Tag>
                    );
                  })}
                </div>
              ))}
            </div>
            {p.cats.map((cat, c) => {
              const vm = grid.row(0, i, c + 2);
              const known = pop(vm) === 1;
              return (
                <div
                  key={cat.name}
                  className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400"
                  title={bits(vm)
                    .map((v) => cat.values[v])
                    .join(", ")}
                >
                  <span className="text-slate-400 dark:text-slate-500">
                    {cat.name}:{" "}
                  </span>
                  {known ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {cat.values[bits(vm)[0]]}
                    </span>
                  ) : (
                    <span>{pop(vm)} possible</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
