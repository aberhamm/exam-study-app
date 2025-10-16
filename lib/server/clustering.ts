import type { QuestionDocument } from '@/types/question';

/**
 * Clustering helpers and metrics.
 *
 * Notes
 * - We construct similarity graphs from pair scores and use connected components as clusters.
 * - `clusterQuestionsBySimilarity` returns clusters with an ephemeral id based on membership hash;
 *   API layers should assign a stable UUID when persisting.
 * - `calculateClusterMetricsExtended` augments classic min/max/avg with cohesion, density, stddev, and medoid.
 */

export type ClusterMetrics = {
  avgSimilarity: number;
  maxSimilarity: number;
  minSimilarity: number;
  cohesionScore: number;
  stdDevSimilarity: number;
  edgeCount: number;
  possibleEdgeCount: number;
  density: number;
  medoidId?: string;
  silhouette?: number;
};

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
/**
 * Construct clusters via connected components of the similarity graph, after applying a threshold.
 * The returned `id` is deterministic but intended for ephemeral use only.
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
/**
 * Base metrics on pairwise similarities within `questionIds`.
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

/** Deterministic key for unordered pairs. */
export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('::');
}

/** Build fast lookup of pair scores keyed by `pairKey`. */
export function buildPairScoreIndex(pairs: SimilarityPair[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const { aId, bId, score } of pairs) m.set(pairKey(aId, bId), score);
  return m;
}

/** L2-normalize a vector. */
function normalize(v: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const mag = Math.sqrt(sum) || 1;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / mag;
  return out;
}

/** Cosine similarity of two already-normalized vectors. */
function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Compute a dense set of pair scores from embeddings for a specific cluster scope.
 * Used when we want more accurate metrics than the sparse neighbor set produced by vector search.
 */
export function computePairScoresFromEmbeddings(
  questionIds: string[],
  embeddingsById: Map<string, number[]>
): Map<string, number> {
  const normalized = new Map<string, number[]>();
  for (const id of questionIds) {
    const e = embeddingsById.get(id);
    if (Array.isArray(e) && e.length) normalized.set(id, normalize(e));
  }
  const m = new Map<string, number>();
  for (let i = 0; i < questionIds.length; i++) {
    for (let j = i + 1; j < questionIds.length; j++) {
      const a = questionIds[i];
      const b = questionIds[j];
      const ea = normalized.get(a);
      const eb = normalized.get(b);
      if (ea && eb) m.set(pairKey(a, b), cosine(ea, eb));
    }
  }
  return m;
}

/**
 * Extended metrics combining cohesion (avg similarity), dispersion (stddev),
 * graph density, and a medoid (most central question by total incident similarity).
 */
export function calculateClusterMetricsExtended(
  questionIds: string[],
  pairScores: Map<string, number>
): ClusterMetrics {
  const scores: number[] = [];
  const n = questionIds.length;
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = pairScores.get(pairKey(questionIds[i], questionIds[j]));
      if (typeof s === 'number') {
        scores.push(s);
        edgeCount += 1;
      }
    }
  }
  const possibleEdgeCount = (n * (n - 1)) / 2;
  if (scores.length === 0) {
    return {
      avgSimilarity: 0,
      maxSimilarity: 0,
      minSimilarity: 0,
      cohesionScore: 0,
      stdDevSimilarity: 0,
      edgeCount: 0,
      possibleEdgeCount,
      density: 0,
      medoidId: undefined,
      silhouette: undefined,
    };
  }
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const variance = scores.reduce((acc, s) => acc + Math.pow(s - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const density = possibleEdgeCount > 0 ? edgeCount / possibleEdgeCount : 0;

  const totals = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const a = questionIds[i];
    let t = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = questionIds[j];
      const s = pairScores.get(pairKey(a, b));
      if (typeof s === 'number') t += s;
    }
    totals.set(a, t);
  }
  let medoidId: string | undefined = undefined;
  let medoidTotal = -Infinity;
  for (const [id, t] of totals) {
    if (t > medoidTotal) {
      medoidId = id;
      medoidTotal = t;
    }
  }

  return {
    avgSimilarity: avg,
    maxSimilarity: max,
    minSimilarity: min,
    cohesionScore: avg,
    stdDevSimilarity: stdDev,
    edgeCount,
    possibleEdgeCount,
    density,
    medoidId,
    silhouette: undefined,
  };
}

/**
 * Suggest an automatic split by trying multiple thresholds and choosing the configuration
 * that maximizes a weighted cohesion × density score across subclusters.
 */
export function splitClusterAuto(
  cluster: QuestionCluster,
  pairScores: Map<string, number>,
  options?: { candidates?: number[]; minClusterSize?: number }
): { threshold: number; clusters: Array<{ questionIds: string[]; metrics: ClusterMetrics }> } {
  const thresholds = options?.candidates ?? [0.92, 0.94, 0.96, 0.98];
  const minSize = Math.max(2, options?.minClusterSize ?? 2);
  let best: { threshold: number; clusters: string[][]; score: number } | null = null;
  for (const thr of thresholds) {
    const filteredPairs: SimilarityPair[] = [];
    for (let i = 0; i < cluster.questionIds.length; i++) {
      for (let j = i + 1; j < cluster.questionIds.length; j++) {
        const a = cluster.questionIds[i];
        const b = cluster.questionIds[j];
        const s = pairScores.get(pairKey(a, b)) ?? 0;
        if (s >= thr) filteredPairs.push({ aId: a, bId: b, score: s });
      }
    }
    const comps = clusterQuestionsBySimilarity(filteredPairs, minSize, thr).map(c => c.questionIds);
    if (comps.length < 2) continue;
    const metrics = comps.map(qids => calculateClusterMetricsExtended(qids, pairScores));
    const score = metrics.reduce((acc, m) => acc + m.cohesionScore * m.density * (qidsWeight(comps, m, cluster.questionIds.length)), 0);
    if (!best || score > best.score) best = { threshold: thr, clusters: comps, score };
  }
  if (!best) {
    return { threshold: thresholds[0], clusters: [{ questionIds: cluster.questionIds, metrics: calculateClusterMetricsExtended(cluster.questionIds, pairScores) }] };
  }
  return {
    threshold: best.threshold,
    clusters: best.clusters.map(qids => ({ questionIds: qids, metrics: calculateClusterMetricsExtended(qids, pairScores) })),
  };
}

function qidsWeight(comps: string[][], _m: ClusterMetrics, total: number): number {
  const sizes = comps.map(c => c.length);
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  return (sizes.reduce((a, b) => a + b, 0) / sum) * (sum / total);
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
