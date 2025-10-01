import type { QuestionDocument } from '@/types/question';

export type SimilarityPair = {
  aId: string;
  bId: string;
  score: number;
};

export type QuestionCluster = {
  id: string;
  questionIds: string[];
  avgSimilarity: number;
  maxSimilarity: number;
  minSimilarity: number;
  questions?: QuestionDocument[];
};

/**
 * Groups questions into clusters based on similarity pairs using connected components algorithm
 */
export function clusterQuestionsBySimilarity(
  pairs: SimilarityPair[],
  minClusterSize: number = 2,
  minSimilarityThreshold: number = 0.85
): QuestionCluster[] {
  // Filter pairs by minimum similarity threshold
  const filteredPairs = pairs.filter(pair => pair.score >= minSimilarityThreshold);

  if (filteredPairs.length === 0) {
    return [];
  }

  // Build adjacency list for connected components
  const adjacencyList = new Map<string, Set<string>>();
  const pairScores = new Map<string, number>();

  for (const pair of filteredPairs) {
    const { aId, bId, score } = pair;

    // Add to adjacency list
    if (!adjacencyList.has(aId)) {
      adjacencyList.set(aId, new Set());
    }
    if (!adjacencyList.has(bId)) {
      adjacencyList.set(bId, new Set());
    }

    adjacencyList.get(aId)!.add(bId);
    adjacencyList.get(bId)!.add(aId);

    // Store pair scores for cluster metrics
    const key = [aId, bId].sort().join('::');
    pairScores.set(key, score);
  }

  // Find connected components using DFS
  const visited = new Set<string>();
  const clusters: QuestionCluster[] = [];

  function dfs(nodeId: string, component: Set<string>) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    component.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, component);
      }
    }
  }

  // Find all components
  for (const nodeId of adjacencyList.keys()) {
    if (!visited.has(nodeId)) {
      const component = new Set<string>();
      dfs(nodeId, component);

      if (component.size >= minClusterSize) {
        const questionIds = Array.from(component);
        const clusterMetrics = calculateClusterMetrics(questionIds, pairScores);

        clusters.push({
          id: generateClusterId(questionIds),
          questionIds,
          ...clusterMetrics
        });
      }
    }
  }

  // Sort clusters by size (largest first) then by average similarity
  clusters.sort((a, b) => {
    if (a.questionIds.length !== b.questionIds.length) {
      return b.questionIds.length - a.questionIds.length;
    }
    return b.avgSimilarity - a.avgSimilarity;
  });

  return clusters;
}

/**
 * Calculate similarity metrics for a cluster
 */
function calculateClusterMetrics(
  questionIds: string[],
  pairScores: Map<string, number>
): Pick<QuestionCluster, 'avgSimilarity' | 'maxSimilarity' | 'minSimilarity'> {
  const scores: number[] = [];

  // Get all pairwise similarities within the cluster
  for (let i = 0; i < questionIds.length; i++) {
    for (let j = i + 1; j < questionIds.length; j++) {
      const key = [questionIds[i], questionIds[j]].sort().join('::');
      const score = pairScores.get(key);
      if (score !== undefined) {
        scores.push(score);
      }
    }
  }

  if (scores.length === 0) {
    return { avgSimilarity: 0, maxSimilarity: 0, minSimilarity: 0 };
  }

  const avgSimilarity = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const maxSimilarity = Math.max(...scores);
  const minSimilarity = Math.min(...scores);

  return { avgSimilarity, maxSimilarity, minSimilarity };
}

/**
 * Generate a deterministic cluster ID based on question IDs
 */
function generateClusterId(questionIds: string[]): string {
  const sortedIds = questionIds.slice().sort();
  const hash = hashString(sortedIds.join('::'));
  return `cluster_${hash}`;
}

/**
 * Simple hash function for generating cluster IDs
 */
function hashString(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString();

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Split a cluster into smaller clusters based on a similarity threshold
 */
export function splitCluster(
  cluster: QuestionCluster,
  pairs: SimilarityPair[],
  splitThreshold: number = 0.9
): QuestionCluster[] {
  // Filter pairs to only include those within the cluster
  const clusterPairs = pairs.filter(pair =>
    cluster.questionIds.includes(pair.aId) &&
    cluster.questionIds.includes(pair.bId) &&
    pair.score >= splitThreshold
  );

  return clusterQuestionsBySimilarity(clusterPairs, 2, splitThreshold);
}

/**
 * Merge multiple clusters into one
 */
export function mergeClusters(
  clusters: QuestionCluster[],
  pairs: SimilarityPair[]
): QuestionCluster {
  const allQuestionIds = clusters.flatMap(c => c.questionIds);
  const uniqueQuestionIds = Array.from(new Set(allQuestionIds));

  const pairScores = new Map<string, number>();
  for (const pair of pairs) {
    const key = [pair.aId, pair.bId].sort().join('::');
    pairScores.set(key, pair.score);
  }

  const metrics = calculateClusterMetrics(uniqueQuestionIds, pairScores);

  return {
    id: generateClusterId(uniqueQuestionIds),
    questionIds: uniqueQuestionIds,
    ...metrics
  };
}