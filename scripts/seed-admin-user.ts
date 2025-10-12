/**
 * Script to create an admin user
 * Usage: tsx scripts/seed-admin-user.ts
 *
 * You can set credentials via environment variables:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=yourpassword tsx scripts/seed-admin-user.ts
 */

// Load environment variables (Next.js standard approach)
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createUser, findUserByUsername } from '../lib/server/users';
import { closeConnection } from '../lib/server/mongodb';

async function seedAdminUser() {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    console.log(`Checking for existing user: ${username}`);

    // Check if admin user already exists
    const existing = await findUserByUsername(username);

    if (existing) {
      console.log(`✅ Admin user "${username}" already exists`);
      return;
    }

    console.log(`Creating admin user: ${username}`);

    // Create admin user
    const user = await createUser({
      username,
      password,
      role: 'admin',
    });

    console.log(`✅ Admin user created successfully`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   ID: ${user.id}`);

    if (!process.env.ADMIN_PASSWORD) {
      console.log(`\n⚠️  WARNING: Using default password "admin123"`);
      console.log(`   Please change the password after first login or set ADMIN_PASSWORD environment variable`);
    }
  } catch (error) {
    console.error('❌ Failed to seed admin user:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

seedAdminUser();
