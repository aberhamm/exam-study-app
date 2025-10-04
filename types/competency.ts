export type CompetencyDocument = {
  id: string;
  examId: string;
  title: string;
  description: string;
  examPercentage: number;
  questionCount?: number; // Denormalized count of questions assigned to this competency
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CompetencyWithId = CompetencyDocument;
