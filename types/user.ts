import type { ObjectId } from 'mongodb';

/**
 * User document stored in MongoDB
 */
export interface UserDocument {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User object without sensitive data (for sessions)
 */
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

/**
 * User creation input
 */
export interface CreateUserInput {
  username: string;
  password: string;
  role: 'admin' | 'user';
}
