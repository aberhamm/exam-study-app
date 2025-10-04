/**
 * Unit tests for competency sync mechanisms
 *
 * These tests verify that:
 * - assignCompetenciesToQuestion automatically updates questionCount
 * - unassignCompetenciesFromQuestion automatically updates questionCount
 * - deleteCompetency cascades to remove references from questions
 */

import { ObjectId } from 'mongodb';

// Mock MongoDB collections
const mockQuestionsCol = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn(),
  collection: jest.fn(),
};

const mockCompetenciesCol = {
  deleteOne: jest.fn(),
  updateMany: jest.fn(),
  findOne: jest.fn(),
  insertOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'questions') return mockQuestionsCol;
    if (name === 'exam_competencies') return mockCompetenciesCol;
    throw new Error(`Unknown collection: ${name}`);
  }),
};

// Setup mocks before imports
jest.mock('@/lib/server/mongodb', () => ({
  getDb: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock('@/lib/env-config', () => ({
  envConfig: {
    mongo: {
      questionsCollection: 'questions',
      examCompetenciesCollection: 'exam_competencies',
    },
  },
}));

// Import after mocks are set up
import {
  assignCompetenciesToQuestion,
  unassignCompetenciesFromQuestion,
} from '@/lib/server/competency-assignment';
import { deleteCompetency } from '@/lib/server/competencies';

describe('Competency Sync Mechanisms', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assignCompetenciesToQuestion', () => {
    it('should increment questionCount for newly assigned competencies', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      // Mock current state: question has no competencies
      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: [],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      mockCompetenciesCol.updateMany.mockResolvedValue({
        matchedCount: 2,
        modifiedCount: 2,
      });

      // Assign two competencies
      await assignCompetenciesToQuestion(questionId, examId, ['comp1', 'comp2']);

      // Verify question was updated
      expect(mockQuestionsCol.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), examId },
        expect.objectContaining({
          $set: expect.objectContaining({
            competencyIds: ['comp1', 'comp2'],
            updatedAt: expect.any(Date),
          }),
        })
      );

      // Verify competency counts were incremented (called once for the added competencies)
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledWith(
        { examId, id: { $in: ['comp1', 'comp2'] } },
        expect.objectContaining({
          $inc: { questionCount: 1 },
          $set: { updatedAt: expect.any(Date) },
        })
      );

      // Should not decrement any (no competencies to remove)
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledTimes(1);
    });

    it('should handle partial changes (add and remove competencies)', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      // Mock current state: question has comp1 and comp2
      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: ['comp1', 'comp2'],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      mockCompetenciesCol.updateMany.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      // Change to comp2 and comp3 (keep comp2, remove comp1, add comp3)
      await assignCompetenciesToQuestion(questionId, examId, ['comp2', 'comp3']);

      // Verify question was updated
      expect(mockQuestionsCol.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), examId },
        expect.objectContaining({
          $set: expect.objectContaining({
            competencyIds: ['comp2', 'comp3'],
          }),
        })
      );

      // Verify increment was called for comp3
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledWith(
        { examId, id: { $in: ['comp3'] } },
        expect.objectContaining({
          $inc: { questionCount: 1 },
        })
      );

      // Verify decrement was called for comp1
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledWith(
        { examId, id: { $in: ['comp1'] } },
        expect.objectContaining({
          $inc: { questionCount: -1 },
        })
      );

      // Should be called twice: once for increment, once for decrement
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledTimes(2);
    });

    it('should handle no changes gracefully', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      // Mock current state: question already has comp1 and comp2
      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: ['comp1', 'comp2'],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      // Assign same competencies (no change)
      await assignCompetenciesToQuestion(questionId, examId, ['comp1', 'comp2']);

      // Verify question was still updated (for consistency)
      expect(mockQuestionsCol.updateOne).toHaveBeenCalled();

      // Should not update any competency counts (no changes)
      expect(mockCompetenciesCol.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('unassignCompetenciesFromQuestion', () => {
    it('should decrement questionCount for all previously assigned competencies', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      // Mock current state: question has two competencies
      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: ['comp1', 'comp2'],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      mockCompetenciesCol.updateMany.mockResolvedValueOnce({
        matchedCount: 2,
        modifiedCount: 2,
      });

      await unassignCompetenciesFromQuestion(questionId, examId);

      // Verify question was cleared
      expect(mockQuestionsCol.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), examId },
        expect.objectContaining({
          $set: expect.objectContaining({
            competencyIds: [],
            updatedAt: expect.any(Date),
          }),
        })
      );

      // Verify competency counts were decremented
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledWith(
        { examId, id: { $in: ['comp1', 'comp2'] } },
        expect.objectContaining({
          $inc: { questionCount: -1 },
          $set: { updatedAt: expect.any(Date) },
        })
      );
    });

    it('should handle questions with no competencies gracefully', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      // Mock current state: question has no competencies
      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: [],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await unassignCompetenciesFromQuestion(questionId, examId);

      // Verify question was still updated
      expect(mockQuestionsCol.updateOne).toHaveBeenCalled();

      // Verify no competency count updates were attempted (no competencies to decrement)
      expect(mockCompetenciesCol.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteCompetency', () => {
    it('should cascade delete by removing competency from all questions', async () => {
      const competencyId = 'comp1';
      const examId = 'test-exam';

      mockCompetenciesCol.deleteOne.mockResolvedValueOnce({
        deletedCount: 1,
      });

      mockQuestionsCol.updateMany.mockResolvedValueOnce({
        matchedCount: 3,
        modifiedCount: 3,
      });

      const result = await deleteCompetency(competencyId, examId);

      expect(result).toBe(true);

      // Verify competency was deleted
      expect(mockCompetenciesCol.deleteOne).toHaveBeenCalledWith({
        id: competencyId,
        examId,
      });

      // Verify questions were updated to remove the competency reference
      expect(mockQuestionsCol.updateMany).toHaveBeenCalledWith(
        { examId, competencyIds: competencyId },
        expect.objectContaining({
          $pull: { competencyIds: competencyId },
          $set: { updatedAt: expect.any(Date) },
        })
      );
    });

    it('should not update questions if competency deletion fails', async () => {
      const competencyId = 'comp1';
      const examId = 'test-exam';

      mockCompetenciesCol.deleteOne.mockResolvedValueOnce({
        deletedCount: 0,
      });

      const result = await deleteCompetency(competencyId, examId);

      expect(result).toBe(false);

      // Verify questions were not updated (competency was not deleted)
      expect(mockQuestionsCol.updateMany).not.toHaveBeenCalled();
    });

    it('should handle competency not found gracefully', async () => {
      const competencyId = 'nonexistent';
      const examId = 'test-exam';

      mockCompetenciesCol.deleteOne.mockResolvedValueOnce({
        deletedCount: 0,
      });

      const result = await deleteCompetency(competencyId, examId);

      expect(result).toBe(false);
      expect(mockCompetenciesCol.deleteOne).toHaveBeenCalledWith({
        id: competencyId,
        examId,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid question ID format', async () => {
      const invalidId = 'not-a-valid-objectid';
      const examId = 'test-exam';

      await expect(
        assignCompetenciesToQuestion(invalidId, examId, ['comp1'])
      ).rejects.toThrow('Invalid question ID format');
    });

    it('should handle empty competency array assignment', async () => {
      const questionId = new ObjectId().toString();
      const examId = 'test-exam';

      mockQuestionsCol.findOne.mockResolvedValueOnce({
        _id: new ObjectId(questionId),
        examId,
        competencyIds: ['comp1', 'comp2'],
      });

      mockQuestionsCol.updateOne.mockResolvedValueOnce({
        matchedCount: 1,
        modifiedCount: 1,
      });

      mockCompetenciesCol.updateMany.mockResolvedValueOnce({
        matchedCount: 2,
        modifiedCount: 2,
      });

      // Assigning empty array should work like unassigning
      await assignCompetenciesToQuestion(questionId, examId, []);

      expect(mockQuestionsCol.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), examId },
        expect.objectContaining({
          $set: expect.objectContaining({
            competencyIds: [],
          }),
        })
      );

      // Should decrement the previously assigned competencies
      expect(mockCompetenciesCol.updateMany).toHaveBeenCalledWith(
        { examId, id: { $in: ['comp1', 'comp2'] } },
        expect.objectContaining({
          $inc: { questionCount: -1 },
        })
      );
    });
  });
});
