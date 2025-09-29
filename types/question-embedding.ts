export type QuestionEmbeddingDocument = {
  id: string; // question id
  examId: string;
  embedding: number[];
  embeddingModel: string;
  embeddingUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

