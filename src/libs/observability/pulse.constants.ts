/**
 * The custom Pulse telemetry catalog, emitted only through the helpers in pulse.ts.
 *
 * Funnel step and metric names must match the definitions in the Pulse project exactly: the server matches them
 * verbatim. Event names are the issue-grouping key, so they are never interpolated. Attribute values are kinds,
 * flags and counts only — never a pubky, post id, tag label or anything the user typed.
 */

/** Steps of the `graph-explore` funnel; each fires at most once per /graph mount. */
export const PULSE_STEP = {
  GRAPH_EXPLORE_OPENED: 'graph-explore-opened',
  GRAPH_EXPLORE_LOADED: 'graph-explore-loaded',
  GRAPH_EXPLORE_INTERACTED: 'graph-explore-interacted',
  GRAPH_EXPLORE_TRACED: 'graph-explore-traced',
} as const;

export type PulseStep = (typeof PULSE_STEP)[keyof typeof PULSE_STEP];

/** Timed operations: one start event, then exactly one complete, fail or cancel. */
export const PULSE_METRIC = {
  /** The neighborhood fetch that first populates the /graph canvas. */
  GRAPH_NEIGHBORHOOD_LOAD: 'graph-neighborhood-load',
  /** Fetching and merging one more node's neighborhood; cancelled when a newer load supersedes it. */
  GRAPH_NODE_EXPAND: 'graph-node-expand',
  /** The follow-path query behind "How am I connected?"; completes with found=false when there is no path. */
  GRAPH_PATH_TRACE: 'graph-path-trace',
} as const;

export type PulseMetric = (typeof PULSE_METRIC)[keyof typeof PULSE_METRIC];

export const PULSE_EVENT = {
  GRAPH_SEARCH_PICKED: 'graph_search_picked',
  GRAPH_NODE_ACTION: 'graph_node_action',
  GRAPH_CONTROL_USED: 'graph_control_used',
  GRAPH_LIMIT_REACHED: 'graph_limit_reached',
  GRAPH_LAYOUT_SELECTED: 'graph_layout_selected',
  GRAPH_FEED_VIEWED: 'graph_feed_viewed',
} as const;

export type PulseEvent = (typeof PULSE_EVENT)[keyof typeof PULSE_EVENT];

/** Typed so an object or array can never be stringified into an attribute by accident. */
export type PulseTelemetryAttributes = Readonly<Record<string, string | number | boolean>>;

/** The part of an SDK operation handle callers use; the helpers hand back a no-op one when Pulse is off. */
export type PulseOperationHandle = {
  complete: (attributes?: PulseTelemetryAttributes) => void;
  fail: (error: unknown, attributes?: PulseTelemetryAttributes) => void;
  cancel: (attributes?: PulseTelemetryAttributes) => void;
};
