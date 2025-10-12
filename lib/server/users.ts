import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from './mongodb';
import { mongoConfig } from '@/lib/env-config';
import type { UserDocument, User, CreateUserInput } from '@/types/user';

const SALT_ROUNDS = 10;

/**
 * Get users collection
 */
export async function getUsersCollection() {
  const db = await getDb();
  return db.collection<UserDocument>(mongoConfig.usersCollection);
}

/**
 * Find user by username
 */
export async function findUserByUsername(username: string): Promise<UserDocument | null> {
  const collection = await getUsersCollection();
  return collection.findOne({ username });
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null;

  const collection = await getUsersCollection();
  const user = await collection.findOne({ _id: new ObjectId(id) });

  if (!user) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
  };
}

/**
 * Create a new user
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const collection = await getUsersCollection();

  // Check if username already exists
  const existing = await collection.findOne({ username: input.username });
  if (existing) {
    throw new Error('Username already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Create user document
  const userDoc: Omit<UserDocument, '_id'> = {
    username: input.username,
    passwordHash,
    role: input.role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(userDoc as UserDocument);

  return {
    id: result.insertedId.toString(),
    username: userDoc.username,
    role: userDoc.role,
  };
}

/**
 * Verify user credentials
 */
export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const user = await findUserByUsername(username);

  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) return null;

  return {
    id: user._id.toString(),
    username: user.username,
    role: user.role,
  };
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}
