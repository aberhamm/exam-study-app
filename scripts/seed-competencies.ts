/**
 * Seed Competencies
 *
 * Inserts the 8 Sitecore XM Cloud Developer exam competency domains into
 * quiz.competencies. Safe to re-run — upserts on (exam_id, title).
 *
 * Usage:
 *   tsx scripts/seed-competencies.ts [--exam <examId>] [--dry-run]
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const COMPETENCIES = [
  {
    title: 'XM Cloud Architecture and Developer Workflow',
    description:
      'Covers XM Cloud-specific terminology, the benefits of cloud and SaaS architecture for a composable DXP, key components of the developer workflow (CLI, Docker, JSS, Git), and managing sites within site collections.',
    exam_percentage: 12,
  },
  {
    title: 'Deployment of XM Cloud Projects',
    description:
      'Covers navigating the XM Cloud Deploy application, deploying projects using starter templates and source code providers (GitHub, Azure DevOps, GitLab), setting up local development environments, configuring repositories and environments, and troubleshooting deployment issues.',
    exam_percentage: 16,
  },
  {
    title: 'Renderings and Layout',
    description:
      'Covers creating and managing components using Component Builder and custom SXA modules, configuring placeholder settings and allowed controls, creating Page Designs and Partial Designs, setting up rendering parameters and variants, and configuring item security.',
    exam_percentage: 14,
  },
  {
    title: 'Sitecore Content Serialization',
    description:
      'Covers using Sitecore Content Serialization (SCS) to serialize and deserialize items, connecting to local and remote XM Cloud instances, configuring serialization modules with paths and rules, and using serialization packages for CI/CD pipelines.',
    exam_percentage: 14,
  },
  {
    title: 'Sitecore APIs and Webhooks',
    description:
      'Covers using the Experience Edge GraphQL API for content queries, using GraphQL mutations via the Authoring and Management API for content operations, and defining and handling webhooks for integration scenarios.',
    exam_percentage: 10,
  },
  {
    title: 'XM Cloud Pages',
    description:
      'Covers using the XM Cloud Pages visual page builder for content authoring, working with the Component Builder to create and manage reusable components, using BYOC (Bring Your Own Component) to register external React components, and managing pages within a site.',
    exam_percentage: 10,
  },
  {
    title: 'Security for Developers',
    description:
      'Covers configuring user roles and permissions in XM Cloud, applying item-level and folder-level security, working with Sitecore security roles and access rights, and following the principle of least privilege for content authors and developers.',
    exam_percentage: 10,
  },
  {
    title: 'Data Modeling',
    description:
      'Covers designing Sitecore data templates, understanding template inheritance and base templates, configuring field types and field sections, structuring the content tree, defining datasource templates for components, and applying content modeling best practices for XM Cloud.',
    exam_percentage: 14,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const examIdx = args.indexOf('--exam');
  const examId = examIdx >= 0 ? args[examIdx + 1] : 'sitecore-xmc';

  console.log(`Seeding ${COMPETENCIES.length} competencies for exam: ${examId}`);
  if (dryRun) console.log('DRY RUN — no changes will be made\n');

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const comp of COMPETENCIES) {
    console.log(`  ${comp.title} (${comp.exam_percentage}%)`);

    if (dryRun) continue;

    // Check if already exists
    const { data: existing } = await supabase
      .schema('quiz')
      .from('competencies')
      .select('id')
      .eq('exam_id', examId)
      .eq('title', comp.title)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('quiz')
        .from('competencies')
        .update({
          description: comp.description,
          exam_percentage: comp.exam_percentage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`    Error updating: ${error.message}`);
        failed++;
      } else {
        console.log(`    Updated (id: ${existing.id})`);
        updated++;
      }
    } else {
      const { data, error } = await supabase
        .schema('quiz')
        .from('competencies')
        .insert({
          exam_id: examId,
          title: comp.title,
          description: comp.description,
          exam_percentage: comp.exam_percentage,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`    Error inserting: ${error.message}`);
        failed++;
      } else {
        console.log(`    Inserted (id: ${data.id})`);
        inserted++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);
  if (dryRun) console.log('\n(DRY RUN — no actual changes made)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
