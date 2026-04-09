import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

/** Skeleton loader for the panel. */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-48 bg-gray-700 rounded"></div>
      <div className="h-3 bg-gray-700 rounded w-3/4"></div>
    </div>
  );
}

/**
 * Return a hex colour for a bar based on average duration.
 * green < 300s (5 min) | amber 300–600s (5–10 min) | red ≥ 600s (10 min+)
 */
function barColour(avgSeconds) {
  if (avgSeconds < 300) return '#22c55e';
  if (avgSeconds < 600) return '#f59e0b';
  return '#ef4444';
}

/** Format seconds into "Xm Ys" or "Xs". */
function fmtSeconds(s) {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${s}s`;
}

/** Truncate a job name to at most 20 characters. */
function truncate(name, max = 20) {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/**
 * Custom tooltip that shows the full job name, avg duration, sample count,
 * and a hint to click through to Jenkins.
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg max-w-[200px]">
      <p className="text-white font-medium mb-0.5 break-words">{d.fullJob}</p>
      <p className="text-gray-300">Avg: {fmtSeconds(d.avgDuration)}</p>
      <p className="text-gray-400">
        Min: {fmtSeconds(d.minDuration)} · Max: {fmtSeconds(d.maxDuration)}
      </p>
      <p className="text-gray-400">{d.sampleCount} build{d.sampleCount !== 1 ? 's' : ''}</p>
      <p className="text-gray-500 text-xs mt-1 italic">Includes setup, install &amp; all test phases</p>
      <p className="text-blue-400 mt-1">↗ Click to open job in Jenkins</p>
    </div>
  );
}

/**
 * Job Total Time panel.
 * Groups builds by job name and shows average total job duration per job as a bar chart.
 *
 * Note: Wikimedia's Quibble jobs do not publish JUnit test-phase timings to Jenkins,
 * so durations shown are total job runtime (setup + install + PHPUnit + WDIO + teardown).
 *
 * Interactions:
 * - Hover a bar to see avg/min/max duration and sample count.
 * - Click a bar to open that Jenkins job page in a new tab.
 *
 * @param {{ builds: Array, error: Error|null, loading: boolean }} props
 */
export default function ExecutionTimePanel({ builds, error, loading }) {
  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="bg-red-900 border border-red-600 text-red-200 rounded p-3 text-sm">
        Jenkins data unavailable: {error.message}
      </div>
    );
  }

  if (builds.length === 0) {
    return <p className="text-gray-500 text-sm italic">No build data available.</p>;
  }

  // Group builds by job and gather stats + job_url
  const grouped = {};
  for (const build of builds) {
    if (!grouped[build.job]) {
      grouped[build.job] = { durations: [], job_url: build.job_url };
    }
    grouped[build.job].durations.push(build.duration_seconds);
  }

  const chartData = Object.entries(grouped)
    .map(([job, { durations, job_url }]) => {
      const avg = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
      return {
        job: truncate(job),
        fullJob: job,
        job_url,
        avgDuration: avg,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        sampleCount: durations.length,
      };
    })
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 15);

  const hasSlowJobs = chartData.some((d) => d.avgDuration >= 300); // amber or red

  const handleBarClick = (barData) => {
    if (barData?.job_url) {
      window.open(barData.job_url, '_blank', 'noopener');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Avg total job runtime — click a bar to open in Jenkins
      </p>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 8, left: -20, bottom: 40 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="job"
            tick={{ fill: '#9ca3af', fontSize: 9 }}
            tickLine={false}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickLine={false}
            tickFormatter={(v) => `${v}s`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="avgDuration"
            radius={[3, 3, 0, 0]}
            onClick={handleBarClick}
            style={{ cursor: 'pointer' }}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={barColour(entry.avgDuration)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {hasSlowJobs && (
        <p className="text-xs text-gray-400">
          <span className="text-red-400 font-medium">Red</span> bars exceed 10 min ·{' '}
          <span className="text-amber-400 font-medium">Amber</span> exceed 5 min
        </p>
      )}
      <p className="text-xs text-gray-600 italic">
        Durations are total job time (Quibble does not publish per-phase test timings to Jenkins)
      </p>
    </div>
  );
}
