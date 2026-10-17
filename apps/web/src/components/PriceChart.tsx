import type { MarketSummary, PricePoint } from '@watercooler/shared';
import { useId, useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { outcomeColor } from '../lib/colors';
import { useThemeColor } from '../lib/theme';

const MAX_LINES = 6;

const timeFmt = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STEPS = [
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  60 * DAY,
  91 * DAY,
  182 * DAY,
  365 * DAY,
];

/** Evenly spaced ticks aligned to local hours/midnights, at most ~6 of them. */
function timeTicks(start: number, end: number): { ticks: number[]; step: number } {
  const step = STEPS.find((s) => (end - start) / s <= 6) ?? STEPS[STEPS.length - 1]!;
  const anchor = new Date(start);
  anchor.setHours(0, 0, 0, 0);
  const ticks: number[] = [];
  for (let t = anchor.getTime(); t <= end; t += step) if (t >= start) ticks.push(t);
  return { ticks, step };
}
const fullFmt = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function PriceChart({ market, points }: { market: MarketSummary; points: PricePoint[] }) {
  const gradientId = useId();
  const brand = useThemeColor('--color-brand');
  const series = useMemo(() => {
    const ranked = market.isBinary
      ? market.outcomes.slice(0, 1)
      : [...market.outcomes].sort((a, b) => b.probability - a.probability).slice(0, MAX_LINES);
    // Binary markets plot the first outcome's probability in the brand blue, ft.tech style.
    return ranked.map((o) => ({
      key: `o${o.index}`,
      label: o.label,
      color: market.isBinary ? brand : outcomeColor(o.index, false),
    }));
  }, [market, brand]);

  const data = useMemo(
    () =>
      points.map((p) => {
        const row: Record<string, number> = { t: p.t };
        p.probs.forEach((v, i) => (row[`o${i}`] = Math.round(v * 1000) / 10));
        return row;
      }),
    [points],
  );

  const start = points[0]?.t ?? 0;
  const end = points[points.length - 1]?.t ?? 0;
  const { ticks, step } = useMemo(() => timeTicks(start, end), [start, end]);
  const tickFormat = (t: number) => {
    if (step >= DAY) return dayFmt.format(t);
    const d = new Date(t);
    return d.getHours() === 0 && d.getMinutes() === 0 ? dayFmt.format(t) : timeFmt.format(t);
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]?.color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={series[0]?.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[start, end]}
          ticks={ticks}
          tickFormatter={tickFormat}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          orientation="right"
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ strokeDasharray: '4 4' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded border border-line bg-panel px-3 py-2 text-xs shadow-[0_4px_16px_rgb(29_33_41/0.12)]">
                <div className="mb-1 text-faint">{fullFmt.format(Number(label))}</div>
                {series.map((s) => {
                  const item = payload.find((p) => p.dataKey === s.key);
                  if (!item) return null;
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-dim">{s.label}</span>
                      <span className="ml-auto pl-4 font-mono font-semibold text-fg">
                        {Number(item.value).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
        {market.isBinary && series[0] ? (
          <Area
            type="stepAfter"
            dataKey={series[0].key}
            stroke={series[0].color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: series[0].color }}
          />
        ) : (
          series.map((s) => (
            <Line
              key={s.key}
              type="stepAfter"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, strokeWidth: 0, fill: s.color }}
            />
          ))
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
