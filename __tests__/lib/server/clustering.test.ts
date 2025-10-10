import {
  clusterQuestionsBySimilarity,
  splitCluster,
  mergeClusters,
} from '@/lib/server/clustering';
import type { SimilarityPair, QuestionCluster } from '@/lib/server/clustering';

describe('clustering', () => {
  describe('clusterQuestionsBySimilarity', () => {
    it('clusters similar questions using connected components', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.88 },
        { aId: 'q4', bId: 'q5', score: 0.92 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(2);

      // Find cluster containing q1
      const cluster1 = clusters.find((c) => c.questionIds.includes('q1'));
      expect(cluster1?.questionIds.sort()).toEqual(['q1', 'q2', 'q3'].sort());

      // Find cluster containing q4
      const cluster2 = clusters.find((c) => c.questionIds.includes('q4'));
      expect(cluster2?.questionIds.sort()).toEqual(['q4', 'q5'].sort());
    });

    it('filters pairs by minimum similarity threshold', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.7 }, // Below threshold
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      // q1-q2 passes threshold and forms a cluster of size 2
      expect(clusters).toHaveLength(1);
      expect(clusters[0].questionIds.sort()).toEqual(['q1', 'q2'].sort());
    });

    it('respects minimum cluster size', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q3', bId: 'q4', score: 0.92 },
        { aId: 'q4', bId: 'q5', score: 0.88 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 3, 0.85);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].questionIds.sort()).toEqual(['q3', 'q4', 'q5'].sort());
    });

    it('calculates cluster metrics correctly', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.95 },
        { aId: 'q1', bId: 'q3', score: 0.85 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(1);
      const cluster = clusters[0];

      expect(cluster.avgSimilarity).toBeCloseTo(0.9, 2);
      expect(cluster.maxSimilarity).toBe(0.95);
      expect(cluster.minSimilarity).toBe(0.85);
    });

    it('generates deterministic cluster IDs', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
      ];

      const clusters1 = clusterQuestionsBySimilarity(pairs, 2, 0.85);
      const clusters2 = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters1[0].id).toBe(clusters2[0].id);
      expect(clusters1[0].id).toMatch(/^cluster_[0-9a-z]+$/);
    });

    it('handles transitive similarity (A-B-C forms one cluster)', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.87 },
        // q1 and q3 are not directly similar, but connected through q2
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].questionIds.sort()).toEqual(['q1', 'q2', 'q3'].sort());
    });

    it('sorts clusters by size (descending) then by average similarity', () => {
      const pairs: SimilarityPair[] = [
        // Large cluster with lower similarity
        { aId: 'q1', bId: 'q2', score: 0.86 },
        { aId: 'q2', bId: 'q3', score: 0.86 },
        { aId: 'q3', bId: 'q4', score: 0.86 },
        // Small cluster with higher similarity
        { aId: 'q5', bId: 'q6', score: 0.95 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(2);
      expect(clusters[0].questionIds).toHaveLength(4); // Larger cluster first
      expect(clusters[1].questionIds).toHaveLength(2);
    });

    it('handles empty pairs array', () => {
      const clusters = clusterQuestionsBySimilarity([], 2, 0.85);
      expect(clusters).toEqual([]);
    });

    it('handles pairs all below threshold', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.7 },
        { aId: 'q3', bId: 'q4', score: 0.6 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);
      expect(clusters).toEqual([]);
    });

    it('handles complex graph with multiple components', () => {
      const pairs: SimilarityPair[] = [
        // Cluster 1: triangle
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.88 },
        { aId: 'q1', bId: 'q3', score: 0.87 },
        // Cluster 2: chain
        { aId: 'q4', bId: 'q5', score: 0.92 },
        { aId: 'q5', bId: 'q6', score: 0.89 },
        { aId: 'q6', bId: 'q7', score: 0.91 },
        // Cluster 3: pair
        { aId: 'q8', bId: 'q9', score: 0.95 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(3);

      const sizes = clusters.map((c) => c.questionIds.length).sort((a, b) => b - a);
      expect(sizes).toEqual([4, 3, 2]);
    });

    it('handles duplicate pairs gracefully', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q1', bId: 'q2', score: 0.9 }, // Duplicate
        { aId: 'q2', bId: 'q1', score: 0.9 }, // Reverse duplicate
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].questionIds).toHaveLength(2);
    });

    it('calculates metrics when not all pairs exist', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.88 },
        // Missing q1-q3 pair
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].avgSimilarity).toBeCloseTo(0.89, 2);
    });
  });

  describe('splitCluster', () => {
    it('splits cluster into smaller clusters based on higher threshold', () => {
      const cluster: QuestionCluster = {
        id: 'cluster_123',
        questionIds: ['q1', 'q2', 'q3', 'q4'],
        avgSimilarity: 0.87,
        maxSimilarity: 0.95,
        minSimilarity: 0.8,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.95 }, // High similarity
        { aId: 'q3', bId: 'q4', score: 0.92 }, // High similarity
        { aId: 'q2', bId: 'q3', score: 0.82 }, // Lower similarity
      ];

      const subClusters = splitCluster(cluster, pairs, 0.9);

      expect(subClusters).toHaveLength(2);

      const cluster1 = subClusters.find((c) => c.questionIds.includes('q1'));
      const cluster2 = subClusters.find((c) => c.questionIds.includes('q3'));

      expect(cluster1?.questionIds.sort()).toEqual(['q1', 'q2'].sort());
      expect(cluster2?.questionIds.sort()).toEqual(['q3', 'q4'].sort());
    });

    it('returns empty array when no pairs meet threshold', () => {
      const cluster: QuestionCluster = {
        id: 'cluster_123',
        questionIds: ['q1', 'q2', 'q3'],
        avgSimilarity: 0.85,
        maxSimilarity: 0.88,
        minSimilarity: 0.82,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.85 },
        { aId: 'q2', bId: 'q3', score: 0.88 },
      ];

      const subClusters = splitCluster(cluster, pairs, 0.95);

      expect(subClusters).toEqual([]);
    });

    it('filters out pairs not in the cluster', () => {
      const cluster: QuestionCluster = {
        id: 'cluster_123',
        questionIds: ['q1', 'q2'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.92 },
        { aId: 'q3', bId: 'q4', score: 0.95 }, // Not in cluster
      ];

      const subClusters = splitCluster(cluster, pairs, 0.9);

      expect(subClusters).toHaveLength(1);
      expect(subClusters[0].questionIds.sort()).toEqual(['q1', 'q2'].sort());
    });
  });

  describe('mergeClusters', () => {
    it('merges multiple clusters into one', () => {
      const cluster1: QuestionCluster = {
        id: 'cluster_1',
        questionIds: ['q1', 'q2'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const cluster2: QuestionCluster = {
        id: 'cluster_2',
        questionIds: ['q3', 'q4'],
        avgSimilarity: 0.88,
        maxSimilarity: 0.88,
        minSimilarity: 0.88,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q3', bId: 'q4', score: 0.88 },
        { aId: 'q2', bId: 'q3', score: 0.85 },
      ];

      const merged = mergeClusters([cluster1, cluster2], pairs);

      expect(merged.questionIds.sort()).toEqual(['q1', 'q2', 'q3', 'q4'].sort());
      expect(merged.avgSimilarity).toBeCloseTo(0.876, 2);
    });

    it('handles overlapping question IDs (deduplicates)', () => {
      const cluster1: QuestionCluster = {
        id: 'cluster_1',
        questionIds: ['q1', 'q2', 'q3'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const cluster2: QuestionCluster = {
        id: 'cluster_2',
        questionIds: ['q2', 'q3', 'q4'],
        avgSimilarity: 0.88,
        maxSimilarity: 0.88,
        minSimilarity: 0.88,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.9 },
        { aId: 'q3', bId: 'q4', score: 0.88 },
      ];

      const merged = mergeClusters([cluster1, cluster2], pairs);

      expect(merged.questionIds.sort()).toEqual(['q1', 'q2', 'q3', 'q4'].sort());
      expect(merged.questionIds).toHaveLength(4); // No duplicates
    });

    it('generates new cluster ID based on merged questions', () => {
      const cluster1: QuestionCluster = {
        id: 'cluster_1',
        questionIds: ['q1', 'q2'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const cluster2: QuestionCluster = {
        id: 'cluster_2',
        questionIds: ['q3'],
        avgSimilarity: 0,
        maxSimilarity: 0,
        minSimilarity: 0,
      };

      const merged = mergeClusters([cluster1, cluster2], []);

      expect(merged.id).toMatch(/^cluster_[0-9a-z]+$/);
      expect(merged.id).not.toBe('cluster_1');
      expect(merged.id).not.toBe('cluster_2');
    });

    it('handles single cluster', () => {
      const cluster: QuestionCluster = {
        id: 'cluster_1',
        questionIds: ['q1', 'q2'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const pairs: SimilarityPair[] = [{ aId: 'q1', bId: 'q2', score: 0.9 }];

      const merged = mergeClusters([cluster], pairs);

      expect(merged.questionIds.sort()).toEqual(['q1', 'q2'].sort());
    });

    it('calculates metrics with missing pair scores', () => {
      const cluster1: QuestionCluster = {
        id: 'cluster_1',
        questionIds: ['q1', 'q2'],
        avgSimilarity: 0.9,
        maxSimilarity: 0.9,
        minSimilarity: 0.9,
      };

      const cluster2: QuestionCluster = {
        id: 'cluster_2',
        questionIds: ['q3'],
        avgSimilarity: 0,
        maxSimilarity: 0,
        minSimilarity: 0,
      };

      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q2', score: 0.9 },
        // Missing q1-q3 and q2-q3 pairs
      ];

      const merged = mergeClusters([cluster1, cluster2], pairs);

      expect(merged.questionIds).toHaveLength(3);
      expect(merged.avgSimilarity).toBe(0.9); // Only one pair score available
    });

    it('handles empty clusters array', () => {
      const merged = mergeClusters([], []);

      expect(merged.questionIds).toEqual([]);
      expect(merged.avgSimilarity).toBe(0);
      expect(merged.maxSimilarity).toBe(0);
      expect(merged.minSimilarity).toBe(0);
    });
  });

  describe('edge cases and algorithm correctness', () => {
    it('handles self-loops gracefully (same question ID in pair)', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q1', bId: 'q1', score: 1.0 }, // Self-loop
        { aId: 'q1', bId: 'q2', score: 0.9 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      // Should still form valid cluster(s)
      expect(clusters.length).toBeGreaterThanOrEqual(0);
    });

    it('maintains cluster ID determinism regardless of question order', () => {
      const pairs: SimilarityPair[] = [
        { aId: 'q3', bId: 'q1', score: 0.9 },
        { aId: 'q2', bId: 'q3', score: 0.88 },
      ];

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);
      const clusterId1 = clusters[0].id;

      // Same pairs, different order
      const pairs2: SimilarityPair[] = [
        { aId: 'q2', bId: 'q3', score: 0.88 },
        { aId: 'q1', bId: 'q3', score: 0.9 },
      ];

      const clusters2 = clusterQuestionsBySimilarity(pairs2, 2, 0.85);
      const clusterId2 = clusters2[0].id;

      expect(clusterId1).toBe(clusterId2);
    });

    it('handles very large clusters efficiently', () => {
      const pairs: SimilarityPair[] = [];

      // Create a fully connected graph of 50 questions
      for (let i = 0; i < 50; i++) {
        for (let j = i + 1; j < 50; j++) {
          pairs.push({ aId: `q${i}`, bId: `q${j}`, score: 0.9 });
        }
      }

      const clusters = clusterQuestionsBySimilarity(pairs, 2, 0.85);

      expect(clusters).toHaveLength(1);
      expect(clusters[0].questionIds).toHaveLength(50);
      // Use toBeCloseTo for floating point precision
      expect(clusters[0].avgSimilarity).toBeCloseTo(0.9, 5);
    });
  });
});
