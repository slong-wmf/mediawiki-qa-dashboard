import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const JOB_COLORS  = { Passed: '#22c55e', Failed: '#ef4444', Other: '#94a3b8' };
const TEST_COLORS = { Passed: '#22c55e', Failed: '#ef4444', Skipped: '#94a3b8' };

/**
 * Donut chart used by PassFailPanel for both job- and test-level views.
 * Slice click is a no-op in test-level view — only the job view supports
 * filtering by status.
 */
export function PassFailPie({ pieData, view, activeStatus, onSliceClick }) {
  const pieColors = view === 'tests' ? TEST_COLORS : JOB_COLORS;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          onClick={(entry) => view === 'jobs' && onSliceClick(entry.name)}
          style={{ cursor: view === 'jobs' ? 'pointer' : 'default' }}
        >
          {pieData.map((entry) => {
            const dimmed = view === 'jobs' && activeStatus && activeStatus !== entry.name;
            const active = view === 'jobs' && activeStatus === entry.name;
            return (
              <Cell
                key={entry.name}
                fill={pieColors[entry.name] ?? '#94a3b8'}
                opacity={dimmed ? 0.35 : 1}
                stroke={active ? '#fff' : 'none'}
                strokeWidth={active ? 2 : 0}
              />
            );
          })}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb' }}
          formatter={(val, name) => [
            `${val} ${view === 'tests' ? 'tests' : 'builds'}`,
            name,
          ]}
        />
        <Legend
          formatter={(value) => (
            <span
              className={`text-xs select-none ${view === 'jobs' ? 'cursor-pointer' : ''}`}
              style={{ color: view === 'jobs' && activeStatus === value ? '#fff' : '#d1d5db' }}
              onClick={() => view === 'jobs' && onSliceClick(value)}
            >
              {value}
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
