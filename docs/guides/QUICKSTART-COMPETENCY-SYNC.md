# Competency-Question Sync: Quick Start

## TL;DR

✅ **Syncing happens automatically** - No manual intervention needed!

🚀 **One-time setup** for existing data:
```bash
pnpm sync:competencies --fix
```

That's it! After the initial setup, everything stays in sync automatically through your normal API usage.

---

## What Was Implemented

The system now automatically maintains:
1. **Cascading deletes** - Delete a competency → automatically removed from all questions
2. **Question counts** - `questionCount` field on competencies is always accurate
3. **No orphans** - Questions can never reference non-existent competencies

## Automatic Sync Examples

### Example 1: Assigning Competencies
```typescript
// When you call this endpoint:
POST /api/exams/sitecore-xmc/questions/abc123/competencies
Body: { "competencyIds": ["comp1", "comp2"] }

// What happens automatically:
✅ Question abc123 gets competencyIds: ["comp1", "comp2"]
✅ Competency comp1.questionCount incremented by 1
✅ Competency comp2.questionCount incremented by 1
```

### Example 2: Changing Competencies
```typescript
// Question currently has: ["comp1", "comp2"]
// You update it to: ["comp2", "comp3"]

POST /api/exams/sitecore-xmc/questions/abc123/competencies
Body: { "competencyIds": ["comp2", "comp3"] }

// What happens automatically:
✅ Question abc123 gets competencyIds: ["comp2", "comp3"]
✅ Competency comp1.questionCount decremented by 1 (removed)
✅ Competency comp2.questionCount unchanged (still assigned)
✅ Competency comp3.questionCount incremented by 1 (added)
```

### Example 3: Deleting a Competency
```typescript
// 3 questions reference competency "comp1"

DELETE /api/exams/sitecore-xmc/competencies/comp1

// What happens automatically:
✅ Competency "comp1" is deleted
✅ All 3 questions have "comp1" removed from their competencyIds
✅ All questions get updatedAt timestamp updated
```

## When to Use the Sync Script

The `pnpm sync:competencies` command is **only needed for**:

### 1. Initial Setup (Run Once)
```bash
# Populate questionCount for existing competencies
pnpm sync:competencies --fix
```

### 2. Recovery (If Needed)
```bash
# If you manually edited the database or something went wrong
pnpm sync:competencies --exam sitecore-xmc --dry-run  # Check first
pnpm sync:competencies --exam sitecore-xmc --fix      # Then fix
```

### 3. Auditing (Optional)
```bash
# Periodic integrity check (optional, not required)
pnpm sync:competencies --dry-run
```

## Normal Operations: No Action Needed

For day-to-day usage:
- ✅ Use the API endpoints normally
- ✅ Everything stays in sync automatically
- ✅ No scripts to run
- ✅ No background jobs
- ✅ No maintenance required

## FAQ

**Q: Do I need to run `pnpm sync:competencies` after every change?**
A: No! It happens automatically.

**Q: What if I forget to run the sync script?**
A: The sync script is only for initial setup. After that, the API handles everything.

**Q: How do I know if things are in sync?**
A: Run `pnpm sync:competencies --dry-run` to check. If it reports 0 issues, you're good!

**Q: What happens if I delete a competency?**
A: It's automatically removed from all questions that reference it. No orphaned references.

**Q: Is questionCount always accurate?**
A: Yes! It's updated in real-time with every competency assignment/unassignment.

## Technical Details

For implementation details, see:
- [Full Documentation](../features/competency-sync-implementation.md)
- [Test Summary](../features/TEST-SUMMARY.md)
- [Integration Tests](../../__tests__/lib/server/competency-sync.integration.md)

## Files Modified

- ✅ `types/competency.ts` - Added `questionCount` field
- ✅ `lib/server/competencies.ts` - Cascading delete logic
- ✅ `lib/server/competency-assignment.ts` - Auto-sync logic
- ✅ `lib/server/questions.ts` - Database indexes
- ✅ `scripts/sync-competency-references.ts` - Sync utility (one-time use)
