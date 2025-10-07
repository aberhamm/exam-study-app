import type { ObjectId } from 'mongodb';

export type QuestionEmbeddingDocument = {
  question_id: ObjectId; // MongoDB _id of the question
  examId: string;
  embedding: number[];
  embeddingModel: string;
  embeddingUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

