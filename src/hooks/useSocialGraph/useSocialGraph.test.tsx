import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphController } from '@/controllers/graph/graph';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { startPulseOperation, trackPulseEvent } from '@/libs/observability/pulse';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';
import { useGraphStore } from '@/stores/graph/graph.store';
import { useSocialGraph } from './useSocialGraph';

vi.mock('@/controllers/graph/graph', () => ({
  GraphController: { fetchNeighborhood: vi.fn(), fetchPath: vi.fn(), hydrateEntities: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: vi.fn(),
}));

const pulseOperation = vi.hoisted(() => ({ complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }));
vi.mock('@/libs/observability/pulse', () => ({
  startPulseOperation: vi.fn(() => pulseOperation),
  trackPulseEvent: vi.fn(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => ({ currentUserPubky: 'mepubky' }),
}));

const mockGetNeighborhood = vi.mocked(GraphController.fetchNeighborhood);
const mockGetPath = vi.mocked(GraphController.fetchPath);

const ME = 'mepubky';
const initialGraph: NexusGraph = {
  nodes: [
    { kind: 'user', id: `user:${ME}`, pubky: ME, name: 'Me', image: null },
    { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
    {
      kind: 'post',
      id: `post:${ME}:p1`,
      author_id: ME,
      post_id: 'p1',
      content: 'hi',
      post_kind: 'short',
      is_reply: false,
      indexed_at: 1,
    },
    { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 3 },
  ],
  edges: [
    { source: `user:${ME}`, target: 'user:friend', type: 'FOLLOWS', indexed_at: 10 },
    { source: 'user:friend', target: `user:${ME}`, type: 'FOLLOWS', indexed_at: 20 },
    { source: `user:${ME}`, target: `post:${ME}:p1`, type: 'AUTHORED' },
    { source: 'tag:pubky', target: `user:${ME}`, type: 'TAGGED', label: 'pubky' },
  ],
};

async function loadedHook() {
  mockGetNeighborhood.mockResolvedValueOnce(initialGraph);
  const rendered = renderHook(() => useSocialGraph());
  act(() => {
    rendered.result.current.load(ME);
  });
  // Default view: the shared tag hub is filtered out (tagHubsOn is off)
  await waitFor(() => expect(rendered.result.current.nodes).toHaveLength(3));
  return rendered;
}

describe('useSocialGraph', () => {
  beforeEach(() => {
    mockGetNeighborhood.mockReset();
    mockGetPath.mockReset();
    // View preferences live in a persisted store shared across tests
    useGraphStore.getState().reset();
  });

  it('loads a neighborhood, starts the trail, and derives the visual model', async () => {
    const { result } = await loadedHook();

    expect(mockGetNeighborhood).toHaveBeenCalledWith({ kind: 'user', id: ME, depth: 1, kinds: 'user,post' });
    expect(result.current.focusId).toBe(`user:${ME}`);
    expect(result.current.trail.map((t) => t.id)).toEqual([`user:${ME}`]);
    expect(result.current.edges.filter((e) => e.type === 'FRIEND')).toHaveLength(1);
    expect(result.current.relationships.get('user:friend')).toBe('friend');
    expect(result.current.classCounts.get('friend')).toBe(1);
    expect(result.current.classCounts.get('post')).toBe(1);
    expect(result.current.timeBounds).toEqual({ min: 1, max: 20 });
  });

  it('expands a node by merging its neighborhood and is idempotent', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
        { kind: 'user', id: 'user:new', pubky: 'new', name: 'New', image: null },
      ],
      edges: [{ source: 'user:friend', target: 'user:new', type: 'FOLLOWS' }],
    });

    await act(async () => {
      await result.current.expand('user:friend');
    });

    expect(mockGetNeighborhood).toHaveBeenLastCalledWith({ kind: 'user', id: 'friend', depth: 1, kinds: 'user,post' });
    expect(result.current.nodes).toHaveLength(4);
    expect(result.current.expandedIds.has('user:friend')).toBe(true);

    await act(async () => {
      await result.current.expand('user:friend');
    });
    expect(mockGetNeighborhood).toHaveBeenCalledTimes(2);
  });

  it('refreshNode bypasses the expanded guard', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockResolvedValue({ nodes: [], edges: [] });
    await act(async () => {
      await result.current.expand('user:friend');
    });
    await act(async () => {
      await result.current.refreshNode('user:friend');
    });

    expect(mockGetNeighborhood).toHaveBeenCalledTimes(3);
  });

  it('keeps the graph untouched when an expansion fails', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.expand('user:friend');
    });

    expect(result.current.nodes).toHaveLength(3);
    expect(result.current.expandedIds.has('user:friend')).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('legend class toggles hide nodes and their edge families', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.toggleClass('post');
      result.current.toggleClass('tag');
    });

    expect(result.current.nodes.every((n) => n.kind === 'user')).toBe(true);
    expect(result.current.edges.every((e) => e.type === 'FRIEND' || e.type === 'FOLLOWS')).toBe(true);

    act(() => {
      result.current.toggleClass('friend');
    });
    expect(result.current.nodes.map((n) => n.id)).toEqual([`user:${ME}`]);
  });

  it('time cap hides newer edges and re-derives relationships', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.setTimeCap(15);
    });

    // Only the me->friend edge (ts 10) survives; the return edge (ts 20) is in the future
    expect(result.current.relationships.get('user:friend')).toBe('following');
    expect(result.current.edges.filter((e) => e.type === 'FRIEND')).toHaveLength(0);

    act(() => {
      result.current.setTimeCap(null);
    });
    expect(result.current.relationships.get('user:friend')).toBe('friend');
  });

  it('focus pushes trail hops without consecutive duplicates', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.focus('user:friend');
    });
    act(() => {
      result.current.focus('user:friend');
    });

    expect(result.current.trail.map((t) => t.id)).toEqual([`user:${ME}`, 'user:friend']);
    expect(result.current.relationships.get('user:friend')).toBe('self');
  });

  it('tracePath merges the path and exposes its ordered ids', async () => {
    const { result } = await loadedHook();

    mockGetPath.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: `user:${ME}`, pubky: ME, name: 'Me', image: null },
        { kind: 'user', id: 'user:mid', pubky: 'mid', name: 'Mid', image: null },
        { kind: 'user', id: 'user:far', pubky: 'far', name: 'Far', image: null },
      ],
      edges: [
        { source: `user:${ME}`, target: 'user:mid', type: 'FOLLOWS' },
        { source: 'user:mid', target: 'user:far', type: 'FOLLOWS' },
      ],
    });

    await act(async () => {
      await result.current.tracePath('far');
    });

    expect(mockGetPath).toHaveBeenCalledWith({ from: ME, to: 'far' });
    expect(GraphController.hydrateEntities).toHaveBeenCalled();
    expect(result.current.pathIds).toEqual([`user:${ME}`, 'user:mid', 'user:far']);
    expect(result.current.nodes.map((n) => n.id)).toContain('user:far');

    act(() => {
      result.current.clearPath();
    });
    expect(result.current.pathIds).toBeNull();
  });

  it('recenter focuses and expands the clicked user, pruning around it, only once', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
        { kind: 'user', id: 'user:new', pubky: 'new', name: 'New', image: null },
      ],
      edges: [{ source: 'user:friend', target: 'user:new', type: 'FOLLOWS' }],
    });

    await act(async () => {
      await result.current.recenter('user:friend');
    });

    expect(result.current.focusId).toBe('user:friend');
    expect(result.current.trail.at(-1)?.id).toBe('user:friend');
    expect(mockGetNeighborhood).toHaveBeenLastCalledWith({ kind: 'user', id: 'friend', depth: 1, kinds: 'user,post' });

    // Already expanded: a second recenter only refocuses, no refetch
    await act(async () => {
      await result.current.recenter('user:friend');
    });
    expect(mockGetNeighborhood).toHaveBeenCalledTimes(2);

    // Non-user nodes never recenter
    await act(async () => {
      await result.current.recenter('tag:pubky');
    });
    expect(result.current.focusId).toBe('user:friend');
  });

  it('path mode keeps only path clusters, bypassing hidden classes, at full opacity', async () => {
    const { result } = await loadedHook();

    // A stored hidden class must not amputate path members
    act(() => {
      result.current.toggleClass('friend');
    });
    expect(result.current.nodes.some((n) => n.id === 'user:friend')).toBe(false);

    mockGetPath.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: `user:${ME}`, pubky: ME, name: 'Me', image: null },
        { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
      ],
      edges: [{ source: `user:${ME}`, target: 'user:friend', type: 'FOLLOWS' }],
    });
    await act(async () => {
      await result.current.tracePath('friend');
    });

    const ids = result.current.nodes.map((n) => n.id);
    expect(ids).toContain('user:friend'); // hidden class bypassed
    expect(ids).toContain(`post:${ME}:p1`); // path users keep their posts
    expect(ids).not.toContain('tag:pubky'); // everything else is removed
    expect(result.current.opacityTiers.get('user:friend')).toBe('center');
    expect(result.current.opacityTiers.get(`user:${ME}`)).toBe('center');

    act(() => {
      result.current.clearPath();
    });
    // Class hiding applies again; the hub stays out (default view)
    expect(result.current.nodes.some((n) => n.id === 'user:friend')).toBe(false);
    expect(result.current.nodes.map((n) => n.id)).toEqual([`user:${ME}`, `post:${ME}:p1`]);
  });

  it('anchors sizes on the signed-in user while opacity follows the focus', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.focus('user:friend');
    });

    // Sizes never move off the viewer
    expect(result.current.sizeTiers.get(`user:${ME}`)).toBe('center');
    expect(result.current.sizeTiers.get('user:friend')).toBe('direct');
    // Opacity re-anchors on the focused user (mutuals, so me reads direct)
    expect(result.current.opacityTiers.get('user:friend')).toBe('center');
    expect(result.current.opacityTiers.get(`user:${ME}`)).toBe('direct');
  });

  describe('Pulse telemetry', () => {
    const userNode = (pubky: string) => ({
      kind: 'user' as const,
      id: `user:${pubky}`,
      pubky,
      name: pubky,
      image: null,
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('times the initial load and completes with its size', async () => {
      await loadedHook();

      expect(startPulseOperation).toHaveBeenCalledExactlyOnceWith('graph-neighborhood-load', {
        signed_in: true,
        is_self: true,
      });
      expect(pulseOperation.complete).toHaveBeenCalledExactlyOnceWith({ node_count: 4, edge_count: 4 });
    });

    it('cancels a load that a newer load superseded', async () => {
      let resolveFirst: (graph: NexusGraph) => void = () => {};
      mockGetNeighborhood
        .mockReturnValueOnce(new Promise<NexusGraph>((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce(initialGraph);
      const { result } = renderHook(() => useSocialGraph());
      act(() => {
        void result.current.load(ME);
      });
      act(() => {
        void result.current.load('friend');
      });
      await waitFor(() => expect(pulseOperation.complete).toHaveBeenCalledTimes(1));

      await act(async () => {
        resolveFirst(initialGraph);
      });

      expect(pulseOperation.cancel).toHaveBeenCalledTimes(1);
      expect(pulseOperation.complete).toHaveBeenCalledTimes(1);
    });

    it('fails the load metric with the error', async () => {
      const error = new Error('boom');
      mockGetNeighborhood.mockRejectedValueOnce(error);
      const { result } = renderHook(() => useSocialGraph());

      await act(async () => {
        await result.current.load(ME);
      });

      expect(pulseOperation.fail).toHaveBeenCalledExactlyOnceWith(error);
      expect(pulseOperation.complete).not.toHaveBeenCalled();
    });

    it('times expansions and refreshes with the node kind and trigger', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      mockGetNeighborhood.mockResolvedValue({ nodes: [userNode('friend')], edges: [] });

      await act(async () => {
        await result.current.expand('user:friend');
      });
      await act(async () => {
        await result.current.refreshNode('user:friend');
      });

      expect(vi.mocked(startPulseOperation).mock.calls).toEqual([
        ['graph-node-expand', { node_kind: 'user', trigger: 'expand' }],
        ['graph-node-expand', { node_kind: 'user', trigger: 'refresh' }],
      ]);
      expect(pulseOperation.complete).toHaveBeenCalledTimes(2);
    });

    it('never starts an expansion it drops as already expanded', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();

      await act(async () => {
        await result.current.expand(`user:${ME}`);
      });

      expect(startPulseOperation).not.toHaveBeenCalled();
    });

    it('fails the expand metric when the fetch fails', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      const error = new Error('boom');
      mockGetNeighborhood.mockRejectedValueOnce(error);

      await act(async () => {
        await result.current.expand('user:friend');
      });

      expect(pulseOperation.fail).toHaveBeenCalledExactlyOnceWith(error);
    });

    it('completes a found path with its hop count', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      mockGetPath.mockResolvedValueOnce({
        nodes: [userNode(ME), userNode('mid'), userNode('far')],
        edges: [
          { source: `user:${ME}`, target: 'user:mid', type: 'FOLLOWS' },
          { source: 'user:mid', target: 'user:far', type: 'FOLLOWS' },
        ],
      });

      await act(async () => {
        await result.current.tracePath('far');
      });

      expect(startPulseOperation).toHaveBeenCalledExactlyOnceWith('graph-path-trace');
      expect(pulseOperation.complete).toHaveBeenCalledExactlyOnceWith({ found: true, hops: 2 });
    });

    it('completes with found=false when Nexus answers that no path exists', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      mockGetPath.mockRejectedValueOnce(
        Err.client(ClientErrorCode.NOT_FOUND, 'Not Found', { service: ErrorService.Nexus, operation: 'fetchNexus' }),
      );

      await act(async () => {
        await result.current.tracePath('far');
      });

      expect(pulseOperation.complete).toHaveBeenCalledExactlyOnceWith({ found: false });
      expect(pulseOperation.fail).not.toHaveBeenCalled();
    });

    it('fails a path trace only on a real error', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      const error = new Error('network down');
      mockGetPath.mockRejectedValueOnce(error);

      await act(async () => {
        await result.current.tracePath('far');
      });

      expect(pulseOperation.fail).toHaveBeenCalledExactlyOnceWith(error);
      expect(pulseOperation.complete).not.toHaveBeenCalled();
    });

    it('reports the node cap once per mount, however many merges prune', async () => {
      const { result } = await loadedHook();
      vi.clearAllMocks();
      const crowd = (prefix: string) => ({
        nodes: [userNode('friend'), ...Array.from({ length: 450 }, (_, i) => userNode(`${prefix}${i}`))],
        edges: Array.from({ length: 450 }, (_, i) => ({
          source: 'user:friend',
          target: `user:${prefix}${i}`,
          type: 'FOLLOWS' as const,
        })),
      });
      mockGetNeighborhood.mockResolvedValueOnce(crowd('a')).mockResolvedValueOnce(crowd('b'));

      await act(async () => {
        await result.current.refreshNode('user:friend');
      });
      expect(trackPulseEvent).toHaveBeenCalledTimes(1);
      await act(async () => {
        await result.current.refreshNode('user:friend');
      });

      expect(trackPulseEvent).toHaveBeenCalledExactlyOnceWith(
        'graph_limit_reached',
        expect.objectContaining({ limit: 'node_cap' }),
      );
    });

    it('reports the automatic declutter of a dense graph', async () => {
      const users = Array.from({ length: 40 }, (_, i) => userNode(`u${i}`));
      const edges = users.flatMap((a, i) =>
        users.slice(i + 1).map((b) => ({ source: a.id, target: b.id, type: 'FOLLOWS' as const })),
      );
      mockGetNeighborhood.mockResolvedValueOnce({ nodes: [userNode(ME), ...users], edges });
      const { result } = renderHook(() => useSocialGraph());

      await act(async () => {
        await result.current.load(ME);
      });

      expect(trackPulseEvent).toHaveBeenCalledExactlyOnceWith(
        'graph_limit_reached',
        expect.objectContaining({ limit: 'auto_declutter' }),
      );
    });
  });
});
