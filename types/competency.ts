export type CompetencyDocument = {
  id: string;
  examId: string;
  title: string;
  description: string;
  examPercentage: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CompetencyWithId = CompetencyDocument;
