'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { trackPulseStep } from '@/libs/observability/pulse';
import { PULSE_STEP, type PulseStep, type PulseTelemetryAttributes } from '@/libs/observability/pulse.constants';

export type GraphExploreFunnelState = {
  signedIn: boolean;
  /** Opened on a `?user=` deep link rather than on the viewer's own graph */
  deepLink: boolean;
  /** A graph with content is on screen */
  loaded: boolean;
  /** A follow path is on screen */
  traced: boolean;
};

/**
 * The `graph-explore` Pulse funnel for one mount of the explorer: opened → loaded → interacted → traced.
 *
 * Each step is sent at most once per mount, so a retry, a new center or StrictMode's replayed effects never
 * repeat one. Opened, loaded and traced follow the state passed in; interacted is known only to the
 * template's handlers, so the returned function marks it.
 */
export function useGraphExploreFunnel({ signedIn, deepLink, loaded, traced }: GraphExploreFunnelState): () => void {
  const sentRef = useRef(new Set<PulseStep>());

  const send = (step: PulseStep, attributes?: PulseTelemetryAttributes) => {
    if (sentRef.current.has(step)) return;
    sentRef.current.add(step);
    trackPulseStep(step, attributes);
  };

  const onOpened = useEffectEvent(() =>
    send(PULSE_STEP.GRAPH_EXPLORE_OPENED, { signed_in: signedIn, deep_link: deepLink }),
  );
  const onReached = useEffectEvent((step: PulseStep) => send(step));

  useEffect(() => {
    onOpened();
  }, []);
  useEffect(() => {
    if (loaded) onReached(PULSE_STEP.GRAPH_EXPLORE_LOADED);
  }, [loaded]);
  useEffect(() => {
    if (traced) onReached(PULSE_STEP.GRAPH_EXPLORE_TRACED);
  }, [traced]);

  return () => send(PULSE_STEP.GRAPH_EXPLORE_INTERACTED);
}
