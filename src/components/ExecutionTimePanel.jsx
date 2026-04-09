import { useMemo, useCallback } from 'react';
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
import { formatDuration, truncate } from '../utils/format.js';
import { PanelSkeleton } from './shared/Skeleton.jsx';
import { ErrorBanner } from './shared/ErrorBanner.jsx';

/**
 * Return a hex colour for a bar based on average duration.
 * green < 5 min · amber 5–10 min · red ≥ 10 min
 */
function barColour(avgSeconds) {
  if (avgSeconds < 300) return '#22c55e';
  if (avgSeconds < 600) return '#f59e0b';
  return '#ef4444';
}

/**
 * Custom tooltip showing the full job name, avg / min / max duration,
 * sample count, and a click-through hint.
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded p-2 text-xs shadow-lg max-w-[200px]">
      <p className="text-white font-medium mb-0.5 break-words">{d.fullJob}</p>
      <p className="text-gray-300">Avg: {formatDuration(d.avgDuration)}</p>
      <p className="text-gray-400">
        Min: {formatDuration(d.minDuration)} · Max: {formatDuration(d.maxDuration)}
      </p>
      <p className="text-gray-400">{d.sampleCount} build{d.sampleCount !== 1 ? 's' : ''}</p>
      <p className="text-gray-500 text-xs mt-1 italic">Includes setup, install &amp; all test phases</p>
      <p className="text-blue-400 mt-1">↗ Click to open job in Jenkins</p>
    </div>
  );
}

/**
 * Job Total Time panel. Groups builds by job name and plots the average
 * total job duration (top 15) as a bar chart.
 *
 * Quibble jobs do not publish JUnit per-phase timings, so durations shown
 * are total job runtime (setup + install + PHPUnit + WDIO + teardown).
 *
 * @param {{ builds: Array, error: Error|null, loading: boolean }} props
 */
export default function ExecutionTimePanel({ builds, error, loading }) {
  const chartData = useMemo(() => {
    const grouped = {};
    for (const build of builds) {
      if (!grouped[build.job]) {
        grouped[build.job] = { durations: [], job_url: build.job_url };
      }
      grouped[build.job].durations.push(build.duration_seconds);
    }
    return Object.entries(grouped)
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
  }, [builds]);

  const hasSlowJobs = useMemo(
    () => chartData.some((d) => d.avgDuration >= 300),
    [chartData],
  );

  const handleBarClick = useCallback((barData) => {
    if (barData?.job_url) {
      window.open(barData.job_url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (loading) return <PanelSkeleton />;
  if (error)   return <ErrorBanner source="Jenkins" error={error} />;

  if (builds.length === 0) {
    return <p className="text-gray-500 text-sm italic">No build data available.</p>;
  }

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
            {chartData.map((entry) => (
              <Cell key={entry.fullJob} fill={barColour(entry.avgDuration)} />
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
