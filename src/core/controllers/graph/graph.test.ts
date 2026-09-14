import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphApplication } from '@/application/graph/graph';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { UserApplication } from '@/application/user/user';
import { GraphController } from '@/controllers/graph/graph';
import type { Pubky } from '@/models/models.types';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';

vi.mock('@/application/graph/graph', () => ({
  GraphApplication: { fetchNeighborhood: vi.fn(), fetchPath: vi.fn() },
}));
vi.mock('@/application/stream/users/users', () => ({
  UserStreamApplication: { getOrFetchUsers: vi.fn() },
}));
vi.mock('@/application/stream/posts/post', () => ({
  PostStreamApplication: { getOrFetchPosts: vi.fn() },
}));
vi.mock('@/application/user/user', () => ({
  UserApplication: { getManyTagsOrFetch: vi.fn() },
}));

const VIEWER = 'viewer00000000000000000000000000000000000000000000000' as Pubky;
const ALICE = 'alice0000000000000000000000000000000000000000000000000' as Pubky;
const BOB = 'bob000000000000000000000000000000000000000000000000000' as Pubky;

const GRAPH: NexusGraph = {
  nodes: [
    { kind: 'user', id: `user:${ALICE}`, pubky: ALICE, name: 'Alice', image: null },
    { kind: 'user', id: `user:${BOB}`, pubky: BOB, name: 'Bob', image: null },
    {
      kind: 'post',
      id: `post:${ALICE}:0032ABC`,
      author_id: ALICE,
      post_id: '0032ABC',
      content: 'hi',
      post_kind: 'short',
      is_reply: false,
      indexed_at: 1,
    },
    { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 3 },
  ],
  edges: [],
};

/** Resolves once queued microtasks (the fire-and-forget hydration) have run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GraphController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(GraphApplication.fetchNeighborhood).mockResolvedValue(GRAPH);
    vi.mocked(GraphApplication.fetchPath).mockResolvedValue(GRAPH);
    vi.mocked(UserStreamApplication.getOrFetchUsers).mockResolvedValue(undefined);
    vi.mocked(PostStreamApplication.getOrFetchPosts).mockResolvedValue(undefined);
    vi.mocked(UserApplication.getManyTagsOrFetch).mockResolvedValue(new Map());
  });

  it('fetchNeighborhood returns the graph and hydrates its users, posts and profile tags', async () => {
    const result = await GraphController.fetchNeighborhood({ kind: 'user', id: ALICE }, VIEWER);
    expect(result).toEqual(GRAPH);
    await flush();

    expect(UserStreamApplication.getOrFetchUsers).toHaveBeenCalledWith({ userIds: [ALICE, BOB], viewerId: VIEWER });
    expect(PostStreamApplication.getOrFetchPosts).toHaveBeenCalledWith({
      postIds: [`${ALICE}:0032ABC`],
      viewerId: VIEWER,
    });
    expect(UserApplication.getManyTagsOrFetch).toHaveBeenCalledWith({ userIds: [ALICE, BOB] });
  });

  it('fetchPath hydrates too', async () => {
    await GraphController.fetchPath({ from: VIEWER, to: ALICE });
    await flush();
    expect(UserStreamApplication.getOrFetchUsers).toHaveBeenCalled();
  });

  it('never rejects the caller when hydration fails', async () => {
    vi.mocked(UserStreamApplication.getOrFetchUsers).mockRejectedValue(new Error('dexie down'));
    const result = await GraphController.fetchNeighborhood({ kind: 'user', id: ALICE });
    expect(result).toEqual(GRAPH);
    await flush();
  });
});
