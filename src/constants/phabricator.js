/**
 * @file phabricator.js
 * Shared UI metadata for Phabricator task statuses, subtypes, and priorities.
 * Consumed by BugsPanel and TrainBlockersPanel so label/colour/border choices
 * stay consistent across the dashboard.
 */

/** Broad status groups used by the Bugs panel summary cards. */
export const STATUS_GROUPS = ['open', 'in-progress', 'stalled', 'needs-triage', 'other'];

/**
 * Visual metadata for each status group or raw status.
 * `colour` is only used by the BugsPanel stat cards (solid fill dot);
 * `text` + `border` are shared by both panels.
 */
export const STATUS_META = {
  'open':         { label: 'Open',         colour: 'bg-blue-500',   text: 'text-blue-300',   border: 'border-blue-600'   },
  'in-progress':  { label: 'In Progress',  colour: 'bg-amber-500',  text: 'text-amber-300',  border: 'border-amber-600'  },
  'stalled':      { label: 'Stalled',      colour: 'bg-gray-500',   text: 'text-gray-300',   border: 'border-gray-600'   },
  'needs-triage': { label: 'Needs Triage', colour: 'bg-purple-500', text: 'text-purple-300', border: 'border-purple-600' },
  'other':        { label: 'Other',        colour: 'bg-slate-500',  text: 'text-slate-300',  border: 'border-slate-600'  },
  // Resolved/closed statuses used by the TrainBlockersPanel (never shown in BugsPanel)
  'resolved':     { label: 'Resolved',     colour: 'bg-green-500',  text: 'text-green-300',  border: 'border-green-600'  },
  'declined':     { label: 'Declined',     colour: 'bg-gray-500',   text: 'text-gray-400',   border: 'border-gray-600'   },
  'invalid':      { label: 'Invalid',      colour: 'bg-gray-500',   text: 'text-gray-400',   border: 'border-gray-600'   },
  'wontfix':      { label: "Won't Fix",    colour: 'bg-gray-500',   text: 'text-gray-400',   border: 'border-gray-600'   },
  'duplicate':    { label: 'Duplicate',    colour: 'bg-gray-500',   text: 'text-gray-400',   border: 'border-gray-600'   },
};

/** Phabricator task subtype metadata (used by the TrainBlockersPanel). */
export const SUBTYPE_META = {
  'error':    { label: 'Production Error', text: 'text-red-300',    border: 'border-red-700'    },
  'bug':      { label: 'Bug',              text: 'text-orange-300', border: 'border-orange-700' },
  'security': { label: 'Security',         text: 'text-yellow-300', border: 'border-yellow-700' },
  'default':  { label: 'Task',             text: 'text-gray-300',   border: 'border-gray-600'   },
};

/** Priority metadata shared by BugsPanel and TrainBlockersPanel. */
export const PRIORITY_META = {
  'unbreak-now':  { label: 'Unbreak Now!', colour: 'text-red-400',    dot: 'bg-red-400'    },
  'needs-triage': { label: 'Needs Triage', colour: 'text-purple-400', dot: 'bg-purple-400' },
  'high':         { label: 'High',         colour: 'text-orange-400', dot: 'bg-orange-400' },
  'normal':       { label: 'Normal',       colour: 'text-gray-300',   dot: 'bg-gray-400'   },
  'low':          { label: 'Low',          colour: 'text-gray-500',   dot: 'bg-gray-500'   },
  'wishlist':     { label: 'Wishlist',     colour: 'text-gray-600',   dot: 'bg-gray-600'   },
};
