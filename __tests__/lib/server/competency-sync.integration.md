# Competency Sync Integration Tests

This document describes the expected behavior of the competency sync mechanisms. These behaviors are enforced through the implementation.

## Test Scenarios

### 1. Assign Competencies to Question

**Scenario**: Assign competencies to a question that has no existing competencies

**Given**:
- Question `Q1` has no competencies (`competencyIds: []`)
- Competencies `C1` and `C2` exist with `questionCount: 0`

**When**:
- Call `assignCompetenciesToQuestion('Q1', 'exam1', ['C1', 'C2'])`

**Then**:
- Question `Q1` should have `competencyIds: ['C1', 'C2']`
- Competency `C1` should have `questionCount: 1`
- Competency `C2` should have `questionCount: 1`

---

### 2. Reassign Competencies (Partial Change)

**Scenario**: Change competency assignments, removing one and adding another

**Given**:
- Question `Q1` has `competencyIds: ['C1', 'C2']`
- Competencies `C1`, `C2`, `C3` exist with respective `questionCount: 5, 3, 0`

**When**:
- Call `assignCompetenciesToQuestion('Q1', 'exam1', ['C2', 'C3'])`

**Then**:
- Question `Q1` should have `competencyIds: ['C2', 'C3']`
- Competency `C1` should have `questionCount: 4` (decremented)
- Competency `C2` should have `questionCount: 3` (unchanged)
- Competency `C3` should have `questionCount: 1` (incremented)

---

### 3. Unassign All Competencies

**Scenario**: Remove all competency assignments from a question

**Given**:
- Question `Q1` has `competencyIds: ['C1', 'C2']`
- Competencies `C1`, `C2` have respective `questionCount: 5, 3`

**When**:
- Call `unassignCompetenciesFromQuestion('Q1', 'exam1')`

**Then**:
- Question `Q1` should have `competencyIds: []`
- Competency `C1` should have `questionCount: 4` (decremented)
- Competency `C2` should have `questionCount: 2` (decremented)

---

### 4. Delete Competency (Cascading)

**Scenario**: Delete a competency and cascade the deletion to remove references from questions

**Given**:
- Questions `Q1`, `Q2`, `Q3` have `competencyIds: ['C1', 'C2'], ['C1'], ['C2']` respectively
- Competency `C1` exists and has `questionCount: 2`

**When**:
- Call `deleteCompetency('C1', 'exam1')`

**Then**:
- Competency `C1` should be deleted from the database
- Question `Q1` should have `competencyIds: ['C2']`
- Question `Q2` should have `competencyIds: []`
- Question `Q3` should have `competencyIds: ['C2']` (unchanged)

---

### 5. Orphan Cleanup

**Scenario**: Detect and clean orphaned competency references

**Given**:
- Questions `Q1`, `Q2` have `competencyIds: ['C1', 'ORPHAN'], ['C2', 'ORPHAN']`
- Only competencies `C1` and `C2` exist (valid)
- Competencies have `questionCount: 1, 1`

**When**:
- Run `sync-competency-references.ts --fix`

**Then**:
- Question `Q1` should have `competencyIds: ['C1']`
- Question `Q2` should have `competencyIds: ['C2']`
- Console output should report 2 orphaned references removed

---

### 6. QuestionCount Sync

**Scenario**: Recalculate and sync questionCount for all competencies

**Given**:
- Competency `C1` has `questionCount: 5` but actually has 7 questions referencing it
- Competency `C2` has `questionCount: 3` but actually has 3 questions (correct)

**When**:
- Run `sync-competency-references.ts --fix`

**Then**:
- Competency `C1` should have `questionCount: 7` (updated)
- Competency `C2` should have `questionCount: 3` (unchanged)
- Console output should report 1 competency updated

---

## Implementation Verification

To verify these behaviors:

1. **Unit Tests**: See `__tests__/lib/server/competency-sync.test.ts`
2. **Manual Testing**:
   ```bash
   # Create test data
   pnpm seed:exams

   # Assign competencies
   pnpm assign:competencies --exam sitecore-xmc --topN 2

   # Check for issues
   pnpm sync:competencies --exam sitecore-xmc --dry-run

   # Fix any issues
   pnpm sync:competencies --exam sitecore-xmc --fix
   ```

## Database Indexes

The following indexes ensure efficient queries:

- `questions` collection: `{ examId: 1, competencyIds: 1 }`
- `exam_competencies` collection: `{ id: 1, examId: 1 }`

These indexes are automatically created on first access to the collections.
