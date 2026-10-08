import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPulseStep } from '@/libs/observability/pulse';
import { type GraphExploreFunnelState, useGraphExploreFunnel } from './useGraphExploreFunnel';

vi.mock('@/libs/observability/pulse', () => ({ trackPulseStep: vi.fn() }));

const idle: GraphExploreFunnelState = { signedIn: true, deepLink: false, loaded: false, traced: false };

describe('useGraphExploreFunnel', () => {
  beforeEach(() => {
    vi.mocked(trackPulseStep).mockClear();
  });

  it('marks opened on mount with the entry context', () => {
    renderHook(() => useGraphExploreFunnel({ ...idle, signedIn: false, deepLink: true }));

    expect(trackPulseStep).toHaveBeenCalledExactlyOnceWith('graph-explore-opened', {
      signed_in: false,
      deep_link: true,
    });
  });

  it('follows the state through loaded and traced, and lets handlers mark interacted', () => {
    const { result, rerender } = renderHook((state: GraphExploreFunnelState) => useGraphExploreFunnel(state), {
      initialProps: idle,
    });
    rerender({ ...idle, loaded: true });
    result.current();
    rerender({ ...idle, loaded: true, traced: true });

    expect(vi.mocked(trackPulseStep).mock.calls.map(([step]) => step)).toEqual([
      'graph-explore-opened',
      'graph-explore-loaded',
      'graph-explore-interacted',
      'graph-explore-traced',
    ]);
  });

  it('sends each step at most once per mount', () => {
    const { result, rerender } = renderHook((state: GraphExploreFunnelState) => useGraphExploreFunnel(state), {
      initialProps: idle,
    });
    // A retry or a new center drops back to loading, then loads again
    rerender({ ...idle, loaded: true });
    rerender(idle);
    rerender({ ...idle, loaded: true });
    result.current();
    result.current();
    rerender({ ...idle, loaded: true, traced: true });
    rerender({ ...idle, loaded: true, traced: false });
    rerender({ ...idle, loaded: true, traced: true });

    expect(trackPulseStep).toHaveBeenCalledTimes(4);
  });

  it('starts over on a new mount', () => {
    renderHook(() => useGraphExploreFunnel(idle)).unmount();
    renderHook(() => useGraphExploreFunnel(idle));

    expect(trackPulseStep).toHaveBeenCalledTimes(2);
  });
});
