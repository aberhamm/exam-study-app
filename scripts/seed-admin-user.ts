/**
 * Script to create an admin user in Supabase Auth
 *
 * Creates a user with the app_metadata claims required for admin access.
 * Admin access is determined by `app_metadata.claims_admin = true` and
 * `app_metadata.apps["study-util"].role = "admin"`.
 *
 * Usage:
 *   tsx scripts/seed-admin-user.ts
 *
 * Environment variables:
 *   ADMIN_EMAIL     - Email address for the admin user (required)
 *   ADMIN_PASSWORD  - Password for the admin user (optional, uses default if not set)
 *
 * Note: Supabase uses email-based auth (magic link / OTP). Passwords are optional
 * unless you also have email+password auth enabled in your Supabase project.
 */

// Load environment variables (Next.js standard approach)
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';
import { APP_ID, USER_ROLES, ACCESS_TIERS } from '../lib/constants.js';

function getAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    console.error('Error: ADMIN_EMAIL environment variable is required.');
    console.error('Usage: ADMIN_EMAIL=you@example.com tsx scripts/seed-admin-user.ts');
    process.exit(1);
  }

  const supabase = getAdminAuthClient();

  // The app_metadata claims required for admin access (see lib/auth/appUser.ts)
  const adminAppMetadata = {
    claims_admin: true,
    apps: {
      [APP_ID]: {
        enabled: true,
        role: USER_ROLES.ADMIN,
        tier: ACCESS_TIERS.PREMIUM,
      },
    },
  };

  console.log(`Checking for existing user: ${email}`);

  // Try to find the user by listing admin users (service role only)
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    throw new Error(`Failed to list users: ${listError.message}`);
  }

  const existingUser = listData.users.find(u => u.email === email);

  if (existingUser) {
    console.log(`User "${email}" already exists (id: ${existingUser.id})`);
    console.log('Updating app_metadata claims to ensure admin access...');

    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { app_metadata: adminAppMetadata }
    );

    if (updateError) {
      throw new Error(`Failed to update user claims: ${updateError.message}`);
    }

    console.log('Admin claims updated successfully.');
    console.log(`  Email: ${updatedUser.user.email}`);
    console.log(`  ID:    ${updatedUser.user.id}`);
    return;
  }

  console.log(`Creating admin user: ${email}`);

  // Build user creation payload
  const createPayload: Parameters<typeof supabase.auth.admin.createUser>[0] = {
    email,
    email_confirm: true,
    app_metadata: adminAppMetadata,
  };

  if (password) {
    createPayload.password = password;
  } else {
    console.log(
      'No ADMIN_PASSWORD set — creating user without password (magic-link / OTP sign-in only).'
    );
  }

  const { data: newUser, error: createError } = await supabase.auth.admin.createUser(
    createPayload
  );

  if (createError) {
    throw new Error(`Failed to create user: ${createError.message}`);
  }

  console.log('Admin user created successfully.');
  console.log(`  Email: ${newUser.user.email}`);
  console.log(`  ID:    ${newUser.user.id}`);
  console.log(`  Role:  ${USER_ROLES.ADMIN} (claims_admin: true)`);

  if (!password) {
    console.log('\nNote: No password was set. The user must sign in via magic-link or OTP.');
    console.log('      To add a password: set ADMIN_PASSWORD and re-run this script.');
  }
}

seedAdminUser()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to seed admin user:', err);
    process.exit(1);
  });
