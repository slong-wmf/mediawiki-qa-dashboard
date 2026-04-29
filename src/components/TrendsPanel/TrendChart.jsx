import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

/**
 * Format a numeric value for display in the tooltip and Y axis.
 *
 * @param {number|null} v
 * @param {'percent'|'integer'} format
 * @returns {string}
 */
function formatValue(v, format) {
  if (v == null || Number.isNaN(v)) return '—';
  if (format === 'percent') return `${v.toFixed(1)}%`;
  return String(Math.round(v));
}

/**
 * Trim a YYYY-MM-DD date to "MMM D" for compact X-axis labels.
 * @param {string} iso
 */
function shortDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

function CustomTooltip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg">
      <p className="text-white font-medium">{label}</p>
      <p className="text-blue-300">{formatValue(value, format)}</p>
    </div>
  );
}

/**
 * Generic line chart for the Trends Over Time panel. Receives the rolling
 * history entries, an accessor that pulls the metric off each entry, and a
 * format hint for the Y-axis tick formatter.
 *
 * Coverage and E2E count entries are sometimes null (backfilled days from
 * the dailyJobs.results array carry only the pass-rate metric). Recharts is
 * told to NOT connect across nulls so the gap is visible.
 *
 * @param {{
 *   title: string,
 *   entries: Array<object>,
 *   accessor: (entry: object) => number|null|undefined,
 *   format: 'percent'|'integer',
 *   threshold?: number,
 *   colour?: string,
 * }} props
 */
export function TrendChart({ title, entries, accessor, format, threshold, colour = '#60a5fa' }) {
  const data = entries.map((e) => ({
    date: shortDate(e.date),
    value: typeof accessor(e) === 'number' ? accessor(e) : null,
  }));

  const dataPointCount = data.filter((d) => d.value != null).length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-gray-200">{title}</h3>
        <span className="text-xs text-gray-500">
          {dataPointCount} day{dataPointCount === 1 ? '' : 's'}
        </span>
      </div>
      {dataPointCount === 0 ? (
        <p className="text-xs italic text-gray-500 py-12 text-center">
          No data yet for this metric.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={false}
              tickFormatter={(v) => formatValue(v, format)}
              domain={format === 'percent' ? [0, 100] : ['auto', 'auto']}
            />
            <Tooltip content={(props) => <CustomTooltip {...props} format={format} />} />
            {threshold != null && (
              <ReferenceLine
                y={threshold}
                stroke="#22c55e"
                strokeDasharray="4 4"
                label={{ value: `${threshold}%`, fill: '#22c55e', fontSize: 9, position: 'right' }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={colour}
              strokeWidth={2}
              dot={{ r: 2, fill: colour }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
