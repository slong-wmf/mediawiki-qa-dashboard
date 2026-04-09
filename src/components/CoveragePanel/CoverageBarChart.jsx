import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { coverageBarHex, COVERAGE_THRESHOLDS } from '../../constants/coverage.js';

/** Recharts custom tooltip showing extension name, percent, and updated date. */
function CoverageTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg">
      <p className="text-white font-medium mb-0.5">{d.name}</p>
      <p className="text-gray-300">{d.coverage_pct}% coverage</p>
      <p className="text-gray-400 mt-1">Updated: {d.last_updated}</p>
    </div>
  );
}

/**
 * Vertical bar chart of the top / lowest 15 extensions by coverage percent.
 * Bars are clickable — each opens its extension's coverage page in a new tab.
 */
export function CoverageBarChart({ data }) {
  const openExtension = (url) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: -20, bottom: 48 }}
        onClick={(chartData) => {
          const url = chartData?.activePayload?.[0]?.payload?.page_url;
          if (url) openExtension(url);
        }}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#9ca3af', fontSize: 8 }}
          tickLine={false}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#9ca3af', fontSize: 10 }}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CoverageTooltip />} />
        <ReferenceLine
          y={COVERAGE_THRESHOLDS.target}
          stroke="#22c55e"
          strokeDasharray="4 3"
          label={{
            value: `${COVERAGE_THRESHOLDS.target}% target`,
            position: 'insideTopRight',
            fill: '#22c55e',
            fontSize: 9,
          }}
        />
        <Bar dataKey="coverage_pct" radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={coverageBarHex(entry.coverage_pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
