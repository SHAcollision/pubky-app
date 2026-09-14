import { GraphApplication } from '@/application/graph/graph';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { UserApplication } from '@/application/user/user';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { NexusGraph, TGraphNeighborhoodParams, TGraphPathParams } from '@/services/nexus/graph/graph.types';

export class GraphController {
  private constructor() {} // Prevent instantiation

  /**
   * Fetch the neighborhood graph around a center entity (user, post, or tag)
   * @param params - Center kind + id, plus optional depth/limit/kinds filters
   * @param viewerId - Optional viewer for relationship data on the ingested entities
   * @returns Nodes and edges around the center, ids kind-prefixed
   */
  static async fetchNeighborhood(params: TGraphNeighborhoodParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    const graph = await GraphApplication.fetchNeighborhood(params);
    void this.ingestGraphEntities(graph, viewerId);
    return graph;
  }

  /**
   * Fetch the shortest FOLLOWS path between two users (max 4 hops)
   * @param params - from/to pubkies
   * @param viewerId - Optional viewer for relationship data on the ingested entities
   * @returns Path graph; nodes are ordered along the path
   */
  static async fetchPath(params: TGraphPathParams, viewerId?: Pubky | null): Promise<NexusGraph> {
    const graph = await GraphApplication.fetchPath(params);
    void this.ingestGraphEntities(graph, viewerId);
    return graph;
  }

  /**
   * Backfill Dexie with the full entities behind a graph payload, fire and
   * forget. The payload rows are partial (no bio, links or counts) so they are
   * never upserted directly; the ids go through the stream applications, which
   * persist details, counts, tags, relationships and TTL in one shot. Ghost
   * post nodes get hydrated the same way. Lives here because the controller is
   * the layer that may orchestrate several applications.
   */
  private static async ingestGraphEntities(graph: NexusGraph, viewerId?: Pubky | null): Promise<void> {
    try {
      const userIds: Pubky[] = [];
      const postIds: string[] = [];
      for (const node of graph.nodes) {
        if (node.kind === 'user') userIds.push(node.pubky);
        else if (node.kind === 'post') postIds.push(buildCompositeId({ pubky: node.author_id, id: node.post_id }));
      }
      await Promise.all([
        UserStreamApplication.getOrFetchUsers({ userIds, viewerId: viewerId ?? undefined }),
        PostStreamApplication.getOrFetchPosts({ postIds, viewerId }),
      ]);
      // Users persisted earlier through the details-only path have no user_tags
      // row (the stream miss-check above is details-based), so the canvas would
      // render them without profile-tag chips forever. Runs after the stream
      // ingestion so freshly persisted tags are not re-fetched; does its own
      // tags-table miss check internally.
      await UserApplication.getManyTagsOrFetch({ userIds });
    } catch (error) {
      Logger.warn('GraphController: failed to ingest graph entities', { error });
    }
  }
}
