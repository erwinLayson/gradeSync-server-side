# Implementation Plan: School Year Activation & Single School Year Disconnect Resolution

**Document Version:** 1.0.0  
**Target File:** `docs/school-year-activation-and-single-school-year-disconnect-plan.md`  
**Status:** DRAFT / PROPOSED FOR ARCHITECTURAL REVIEW  
**Scope:** Backend (`server/`), Database (`mysql`), Frontend (`client/`), and Shared API Contracts  
**Compliance Standards:** DepEd K-12 Order No. 8, s. 2015, DepEd Order No. 31, s. 2020  

---

## 1. Executive Summary

### 1.1 The Problem Statement
In Grade-Sync (Capstone v3), an architectural divergence exists between the database representation of the active school year, backend service assertions, and frontend UI fallbacks.

The primary defect surfaces when **only one school year exists** in the system (e.g., initial deployment, single-term instances, or following test suite executions):
1. **Database Reality:** The `schoolyear` table stores the record with `isActive = 0` (the default value defined in `0011_create_schoolyear.sql`).
2. **Frontend UI Assumption:** Client pages (`AdminSettings.tsx`, `RegisterStudentRecords.tsx`, `EnrollmentWorkspace.tsx`, and `AdminFaculties.tsx`) fall back to `schoolYears[0]` whenever no row has `isActive === true | 1`. The UI presents this single school year in dropdowns and headers as if it were the active operating term.
3. **Admin Inability to Interact:** In `AdminSettings.tsx`, because there is only one option in the `<select>` dropdown, the administrator cannot trigger an `onChange` event to re-select or deselect it. Furthermore, the UI lacks an explicit "Active / Inactive" badge, leading administrators to believe the school year is already fully configured.
4. **Backend Enforcement Block:** When the Register staff opens the **Submission Tracker** (`/register/student-records`), all classes appear complete for Quarter 1. However, the **"Advance to Q2"** button is disabled, accompanied by an inline warning:
   > *"Quarter advancement is unavailable here. No school year is active. Activate one in Admin Settings before advancing the quarter."*
   Backend quarter advancement (`assertQuarterCompleteService`) explicitly executes `SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1` and throws a `409 ConflictError`, completely deadlocking academic operations.
5. **Cache Invalidation Gap:** `GET /schoolYear` is wrapped in `cacheResponse({ ttl: 60_000, shared: true })`. Mutation endpoints (`PATCH /schoolYear/:id/activate` and `PATCH /schoolYear/:id/status`) do not purge this cache, leaving clients with stale activation states for up to 60 seconds even after manual activation.

### 1.2 Purpose of this Implementation Plan
This document defines an end-to-end architectural plan to:
1. Enforce a **single source of truth** where the database strictly governs the active school year.
2. Introduce a **database-level partial unique constraint** preventing multiple active school years.
3. Establish a **safe auto-activation invariant** ensuring the first created school year is automatically activated.
4. Implement a **centralized active-school-year backend provider** eliminating fragmented raw SQL queries.
5. Enhance **Admin Settings** with explicit Active/Inactive indicators and a 1-click activation button that functions even with a single school year.
6. Align the **Register Submission Tracker** to distinguish between viewed historical years and the authoritative active term without deceptive UI fallbacks.
7. Guarantee **zero regressions** across existing enrollments, gradebooks, attendance records, SF9/SF10 reports, and test suites.

---

## 2. Existing System Assessment & Codebase Findings

A comprehensive code audit across `server/` and `client/` revealed the following technical findings:

### 2.1 Database Schema & Creation Flaw
In `server/migrations/0011_create_schoolyear.sql`:
```sql
CREATE TABLE IF NOT EXISTS `schoolyear` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `startYear` varchar(20) NOT NULL,
  `endYear` varchar(20) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('ongoing','completed') NOT NULL DEFAULT 'ongoing',
  PRIMARY KEY (`id`)
);
```
- **Defect:** `isActive` defaults to `0`. There is no table constraint ensuring that at least one (or at most one) school year is active.
- In `server/src/model/schoolYear.ts` lines 41–49:
  ```ts
  async createSchoolYear(startYear: number, endYear: number): Promise<number> {
      const query = "INSERT INTO schoolyear(startYear, endYear) VALUES(?,?)";
      const [result] = await this.connection.execute<ResultSetHeader>(query, [String(startYear), String(endYear)]);
      return result.insertId;
  }
  ```
  When `POST /api/schoolYear` is invoked, `createSchoolYear` omits `isActive`. The new school year is unconditionally stored with `isActive = 0`, even if it is the first and only school year in the entire database.

### 2.2 Fragmented Backend Active Year Retrieval
There is no centralized service or model method for fetching the active school year. Instead, disparate services execute redundant, independent queries with inconsistent fallback behaviors:

| File Location | Query / Logic | Fallback Behavior |
| :--- | :--- | :--- |
| `server/src/model/studentRecord.ts:347` (`getActiveSchoolYearId`) | `SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1` | Returns `null`. Throws `409 Conflict` during quarter advance. |
| `server/src/model/dashboard.ts:14` (`getActiveSchoolYear`) | `SELECT id, startYear, endYear FROM schoolyear WHERE isActive = 1 LIMIT 1` | Returns `null`. Dashboard renders blank/zero metrics. |
| `server/src/controller/enrollments.ts:94` | `SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1` | Returns `count: 0`. |
| `server/src/service/enrollments.ts:363` | `SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1` | Returns `{ totalCleared: 0, classroomsCleared: 0 }`. |
| `server/src/model/schoolYear.ts:91` (`getCurrentSchoolYearForUpdate`) | `SELECT ... WHERE isActive = 1 ... LIMIT 1 FOR UPDATE` | **Inconsistent Fallback:** If `isActive = 1` is missing, falls back to `ORDER BY id DESC LIMIT 1`. |

### 2.3 HTTP Response Cache Leak
In `server/src/routes/schoolYear.ts` line 48:
```ts
router.get("/schoolYear", adminFacultyRegister, cacheResponse({ ttl: 60_000, shared: true }), getSchoolYearController);
```
- `GET /schoolYear` is cached in memory for 60 seconds.
- In `server/src/controller/schoolYear.ts`:
  - `activateSchoolYearController` (lines 40–60) executes `activateSchoolYearService` but does not invalidate the response cache.
  - `setSchoolYearStatusController` (lines 65–95) updates `status` but does not invalidate the cache.
  - `createSchoolYearController` (lines 25–37) creates a record but does not invalidate the cache.
- **Consequence:** Even if an administrator activates a school year, other users (and the administrator's subsequent requests) receive the cached `isActive: 0` payload for up to 1 minute.

### 2.4 Test Suite Database Corruption Defect
In `server/test/academicSettings.service.test.ts` lines 36–38:
```ts
afterEach(async () => {
    // Restore the active school year if a test flipped it.
    await connection.execute("UPDATE schoolyear SET isActive = 0 WHERE isActive = 1");
```
- **Defect:** Despite the developer's comment stating *"Restore the active school year"*, the code executes an unconditional wipe: `UPDATE schoolyear SET isActive = 0 WHERE isActive = 1`.
- If the test suite runs against a development database, all school years are stripped of their active status. The single school year is left in an unactivated state (`isActive = 0`), reproducing the user's reported bug.

### 2.5 Frontend Inconsistencies and UI Traps

#### A. `AdminSettings.tsx` (Lines 290–304 & 700–750)
- **Init Logic:**
  ```tsx
  const active = years.find((sy) => Boolean(sy.isActive));
  const initialId = active ? String(active.id) : years.length > 0 ? String(years[0].id) : "";
  setSelectedSchoolYearId(initialId);
  ```
  If `active` is `undefined`, `initialId` defaults to `years[0].id`.
- **Single-Option Dropdown:**
  ```tsx
  <select value={selectedSchoolYearId} onChange={(e) => setSelectedSchoolYearId(e.target.value)}>
      {schoolYears.map((sy) => <option key={sy.id} value={sy.id}>SY {sy.startYear}–{sy.endYear}</option>)}
  </select>
  ```
  When `schoolYears.length === 1`, the select element cannot fire `onChange`.
- **Missing State Indicator:** The badge displays `Ongoing` or `Completed` (reflecting `status`). There is **no badge indicating whether the year is Active or Inactive**.
- **Hidden Activation Trigger:** Activation is bundled into the card's general "Save Changes" form submit (`handleSaveAcademic`). Since the single school year is already displayed, the administrator has no visual cue to click "Save Changes".

#### B. `RegisterStudentRecords.tsx` (Lines 90–98 & 190–225)
- **Init Logic:** Selects `yearsData[0]` when no year is active.
- **Header & Dropdown:** Displays `Quarter 1 · SY 2026–2027` based on `selectedYearId`.
- **Advancement Logic:**
  ```tsx
  const activeYear = years.find((sy) => Boolean(sy.isActive)) ?? null;
  const advanceBlockedReason = !activeYear
      ? "No active school year — activate one in Admin Settings before advancing."
      : ...
  ```
  Because `activeYear` is `null`, `advanceBlockedReason` triggers, disabling the button and showing the confusing warning banner directly beneath the `SY 2026–2027` header.

#### C. `EnrollmentWorkspace.tsx` (Lines 36–41 & 148–152)
- **Local Type Definition:** `interface SchoolYear` in `EnrollmentWorkspace.tsx` completely omits `isActive?: boolean`.
- **Selection:** `setSelectedSchoolYearId((current) => current ?? response.data?.[0]?.id ?? null)` blindly selects the first record.

---

## 3. Target Architecture & Core Principles

```
                  ┌─────────────────────────────────────────┐
                  │          Database Invariant             │
                  │   Virtual Generated Column + Unique     │
                  │   uq_single_active_schoolyear           │
                  │   Exactly <= 1 row with isActive = 1    │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │    Centralized Service Provider         │
                  │    getActiveSchoolYearService()         │
                  │    (Atomic, Cached, Validated)          │
                  └──────────────┬───────────────────┬──────┘
                                 │                   │
                ┌────────────────┴──────┐     ┌──────┴────────────────┐
                ▼                       ▼     ▼                       ▼
      ┌──────────────────┐    ┌──────────────────┐   ┌─────────────────┐
      │ Enrollment Svc   │    │ Quarter Adv Svc  │   │ Dashboard Model │
      │ (Requires Active)│    │ (Requires Active)│   │ (Authoritative) │
      └──────────────────┘    └──────────────────┘   └─────────────────┘
```

### 3.1 Single Source of Truth
1. The database column `schoolyear.isActive` is the **sole authoritative indicator** of whether a school year is currently open for operational academic management.
2. Frontend code must **never synthesize or assume** that `schoolYears[0]` is active.
3. A school year with `status = 'ongoing'` represents a term that has not been officially archived, but it is **not automatically active** unless `isActive = 1`.
4. A school year with `status = 'completed'` cannot be active.

### 3.2 Active School Year Invariant Rules
The system enforces five state rules:
- **Rule 1 (Zero School Years):** The database is empty. No active school year exists. Features requiring an active year (enrollment, grading, quarter advancement) are cleanly blocked with an actionable "No school year created" state.
- **Rule 2 (First School Year Creation):** When the first school year is created in an empty table, it **must automatically be created with `isActive = 1`**.
- **Rule 3 (Multiple School Years):** Exactly **one** school year may have `isActive = 1` at any given time.
- **Rule 4 (No Silent Mutations on Read):** `GET` endpoints (`GET /schoolYear`, `GET /schoolYear/active`) must be strictly idempotent and side-effect free. They must never mutate table state to "auto-heal".
- **Rule 5 (Explicit Administrative Recovery):** If an invalid state occurs (e.g., records exist but none is active due to legacy data or test scripts), the system exposes a structured configuration state (`status: "inactive_unassigned"`) and provides an explicit administrative action to resolve it.

### 3.3 Database-Enforced Conditional Uniqueness
To prevent race conditions and guarantee the invariant at the storage engine level, we utilize a MySQL virtual generated column with a unique index.

In MySQL 5.7+ / 8.0+ / MariaDB / TiDB:
```sql
ALTER TABLE `schoolyear`
  ADD COLUMN `active_marker` TINYINT GENERATED ALWAYS AS (IF(`isActive` = 1, 1, NULL)) VIRTUAL,
  ADD UNIQUE KEY `uq_single_active_schoolyear` (`active_marker`);
```
- **How It Works:**
  - If `isActive = 0`, `active_marker` evaluates to `NULL`. Relational database unique constraints treat `NULL` values as distinct; therefore, an unlimited number of inactive rows (`active_marker = NULL`) can coexist.
  - If `isActive = 1`, `active_marker` evaluates to `1`. The unique constraint permits **only one row** with `active_marker = 1`.
  - Any concurrent transaction or rogue script attempting to insert or update a second row with `isActive = 1` fails immediately at the database level with `ER_DUP_ENTRY`.

---

## 4. Database Design & Migration Strategy

### 4.1 Migration File: `0037_enforce_single_active_schoolyear.sql`
The migration must be safely reversible and self-repairing for existing environments.

```sql
-- Migration: 0037_enforce_single_active_schoolyear.sql
-- Purpose: Clean up invalid active states and enforce at most one active school year.

-- Step 1: Pre-cleanup if multiple rows were marked active by legacy operations
-- Keeps the newest ongoing active school year; deactivates older ones.
UPDATE `schoolyear`
SET `isActive` = 0
WHERE `isActive` = 1
  AND `id` NOT IN (
    SELECT `targetId` FROM (
      SELECT `id` AS `targetId`
      FROM `schoolyear`
      WHERE `isActive` = 1
      ORDER BY (`status` = 'ongoing') DESC, `id` DESC
      LIMIT 1
    ) AS `keep`
  );

-- Step 2: Auto-activate single school year if exactly one exists but is inactive
UPDATE `schoolyear`
SET `isActive` = 1
WHERE (SELECT COUNT(*) FROM (SELECT `id` FROM `schoolyear`) AS `t`) = 1
  AND `status` = 'ongoing';

-- Step 3: Add virtual generated column for partial uniqueness (if not exists)
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'schoolyear'
    AND column_name = 'active_marker'
);

SET @stmt_add_col := IF(
  @col_exists = 0,
  'ALTER TABLE `schoolyear` ADD COLUMN `active_marker` TINYINT GENERATED ALWAYS AS (IF(`isActive` = 1, 1, NULL)) VIRTUAL',
  'DO 0'
);
PREPARE stmt FROM @stmt_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add unique index on active_marker (if not exists)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'schoolyear'
    AND index_name = 'uq_single_active_schoolyear'
);

SET @stmt_add_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE `schoolyear` ADD UNIQUE KEY `uq_single_active_schoolyear` (`active_marker`)',
  'DO 0'
);
PREPARE stmt FROM @stmt_add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

---

## 5. Backend Implementation Plan

### 5.1 Shared Model Enhancements (`server/src/model/schoolYear.ts`)

#### A. Centralized Active School Year Retrieval
```ts
// server/src/model/schoolYear.ts
export default class SchoolYearModel {
    // ... existing constructor ...

    /**
     * Retrieves the single active school year.
     * Returns null if no school year is currently marked active.
     */
    async getActiveSchoolYear(forUpdate: boolean = false): Promise<SchoolYear | null> {
        try {
            const lockClause = forUpdate ? " FOR UPDATE" : "";
            const query = `SELECT ${SCHOOL_YEAR_COLUMNS} FROM schoolyear WHERE isActive = 1 LIMIT 1${lockClause}`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return (rows[0] as SchoolYear) ?? null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch active school year", 500, err);
        }
    }

    /**
     * Checks if any school year exists in the system.
     */
    async countSchoolYears(): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS total FROM schoolyear";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return Number(rows[0]?.total ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to count school years", 500, err);
        }
    }

    /**
     * Creates a new school year, supporting explicit active status.
     */
    async createSchoolYear(startYear: number, endYear: number, isActive: boolean = false): Promise<number> {
        try {
            const query = "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,?)";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [
                String(startYear),
                String(endYear),
                isActive ? 1 : 0
            ]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Server Error", 500, err);
        }
    }

    /**
     * Atomically activates target id and deactivates all other rows.
     */
    async activateSchoolYear(id: number): Promise<void> {
        try {
            const query = "UPDATE schoolyear SET isActive = (id = ?)";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);
            if (result.affectedRows === 0) {
                throw new NotFoundError(`School year with ID ${id} not found`, 404);
            }
        } catch (err) {
            if (err instanceof NotFoundError) throw err;
            throw new InternalServerError("Server Error", 500, err);
        }
    }
}
```

### 5.2 Service Layer Logic (`server/src/service/schoolYear.ts`)

#### A. Centralized Active Year Provider
```ts
export async function getActiveSchoolYearService(): Promise<SchoolYear | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new SchoolYearModel(connection);
        return await model.getActiveSchoolYear(false);
    } finally {
        connection.release();
    }
}
```

#### B. First-Year Auto-Activation on Creation
```ts
export async function createSchoolYearService(): Promise<SchoolYear> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const model = new SchoolYearModel(connection);

        const startYear = new Date().getFullYear();
        const endYear = startYear + 1;

        const existing = await model.getSchoolYearByStartYear(startYear);
        if (existing) {
            throw new ConflictError(`School year ${startYear} - ${endYear} already exists`);
        }

        // Rule 2: If there are 0 existing school years or no active year exists,
        // automatically activate the newly created school year.
        const totalYears = await model.countSchoolYears();
        const currentActive = await model.getActiveSchoolYear(true);
        const shouldBeActive = totalYears === 0 || currentActive === null;

        const id = await model.createSchoolYear(startYear, endYear, shouldBeActive);
        await connection.commit();

        // Invalidate response cache
        invalidateByPrefix("http:GET:/schoolYear");

        return {
            id,
            startYear: String(startYear),
            endYear: String(endYear),
            isActive: shouldBeActive,
            status: "ongoing"
        };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
```

#### C. Atomic Activation with Precondition Checks
```ts
export async function activateSchoolYearService(id: number): Promise<SchoolYear[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const model = new SchoolYearModel(connection);

        const target = await model.getSchoolYearById(id);
        if (!target) {
            throw new NotFoundError(`School year with ID ${id} not found`, 404);
        }

        // Business Rule: Cannot activate an archived/completed school year
        if (target.status === "completed") {
            throw new BadRequestError("Cannot activate a completed school year. Reopen the school year first.");
        }

        await model.activateSchoolYear(id);
        await connection.commit();

        // Invalidate all cached HTTP GET responses for schoolYear
        invalidateByPrefix("http:GET:/schoolYear");

        return await model.getSchoolYear();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
```

#### D. Explicit Administrative Recovery Service
```ts
export async function recoverActiveSchoolYearService(): Promise<SchoolYear> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const model = new SchoolYearModel(connection);

        const active = await model.getActiveSchoolYear(true);
        if (active) {
            await connection.rollback();
            return active;
        }

        const allYears = await model.getSchoolYear();
        if (allYears.length === 0) {
            throw new NotFoundError("No school years exist to activate.", 404);
        }

        // Select the newest ongoing school year, or the newest overall
        const target = allYears.find((y) => y.status === "ongoing") ?? allYears[0]!;
        await model.activateSchoolYear(target.id);
        await connection.commit();

        invalidateByPrefix("http:GET:/schoolYear");
        return { ...target, isActive: true };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
```

### 5.3 Controller & Route Updates (`server/src/routes/schoolYear.ts`)
1. **Cache Invalidation Middleware:**
   Attach post-mutation cache clearing to `activateSchoolYearController`, `createSchoolYearController`, and `setSchoolYearStatusController`.
2. **Dedicated Active Route:**
   `GET /api/schoolYear/active` (Authorized for Admin, Teacher, Register). Returns `{ activeSchoolYear: SchoolYear | null, state: "active" | "none" }`.
3. **Recovery Endpoint:**
   `POST /api/schoolYear/recover-active` (Admin Only).

### 5.4 Refactoring Dependent Services
Replace ad-hoc `SELECT ... WHERE isActive = 1 LIMIT 1` across:
- `server/src/model/studentRecord.ts` -> Delegate `getActiveSchoolYearId` to `SchoolYearModel.getActiveSchoolYear()`.
- `server/src/model/dashboard.ts` -> Delegate `getActiveSchoolYear` to `SchoolYearModel.getActiveSchoolYear()`.
- `server/src/service/enrollments.ts` -> Use `getActiveSchoolYearService()`.
- `server/src/controller/enrollments.ts` -> Use `getActiveSchoolYearService()`.

### 5.5 Fixing Test Suite Database Contamination
In `server/test/academicSettings.service.test.ts`:
- In `beforeAll`: Record `originalActiveSchoolYearId` via `SELECT id FROM schoolyear WHERE isActive = 1 LIMIT 1`.
- In `afterEach` and `afterAll`: Instead of `UPDATE schoolyear SET isActive = 0 WHERE isActive = 1`, restore `originalActiveSchoolYearId`:
  ```ts
  if (originalActiveSchoolYearId !== null) {
      await connection.execute("UPDATE schoolyear SET isActive = (id = ?)", [originalActiveSchoolYearId]);
  }
  ```

---

## 6. Frontend Implementation Plan

### 6.1 Admin Settings UI (`client/src/pages/admin/AdminSettings.tsx`)

#### A. Visual Representation: Separate Status from Activation
Currently, the UI displays only "Ongoing / Completed". We enhance the layout to present two distinct badges:
1. **Term Lifecycle Badge:** `Ongoing` (blue) vs `Completed` (gray).
2. **Operational Activation Badge:**
   - If `selectedSchoolYear.isActive`: `<span className="badge badge-success flex items-center gap-1.5"><FiCheckCircle /> Active Term</span>`
   - If `!selectedSchoolYear.isActive`: `<span className="badge badge-warning flex items-center gap-1.5"><FiAlertCircle /> Inactive</span>`

#### B. Explicit "Set as Active" Action Button
Positioned directly next to the School Year dropdown:
```tsx
{!selectedSchoolYear?.isActive && selectedSchoolYear && (
    <button
        type="button"
        className="settings__btn rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-bold text-white hover:bg-[var(--primary-dark)]"
        onClick={() => handleOpenActivateDialog(selectedSchoolYear)}
        disabled={activating || academicLoading}
    >
        {activating ? "Activating…" : `Set SY ${selectedSchoolYear.startYear}–${selectedSchoolYear.endYear} as Active`}
    </button>
)}
```
- **Works with 1 School Year:** The button is rendered regardless of dropdown item count. When only one school year exists and is inactive, this button provides an intuitive, one-click mechanism to activate it.

#### C. System Warning Banner on Missing Active Year
If `schoolYears.length > 0` and no year has `isActive = true`:
```tsx
<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
    <div className="flex items-center gap-2 font-bold text-amber-950">
        <FiAlertTriangle className="text-amber-600 text-lg" />
        No School Year is Currently Active
    </div>
    <p className="mt-1 text-xs text-amber-800">
        Quarter advancement, student enrollment, and active gradebook submissions require an active school year. 
        Select a school year below and click <strong>"Set as Active"</strong> to restore normal operations.
    </p>
</div>
```

#### D. Switch Confirmation Dialog
Before activating a different school year, display a modal:
- Title: *"Activate SY 2026–2027?"*
- Description: *"Activating this school year will make it the operational term across the entire system. Ongoing enrollments and quarterly gradebook submissions will point to this school year. The previously active school year (SY 2025–2026) will be set to Inactive. Historical grade records will remain completely intact."*

### 6.2 Register Submission Tracker (`client/src/pages/register/RegisterStudentRecords.tsx`)

#### A. Elimination of Deceptive Fallback
In `loadContext`:
```tsx
const activeYear = yearsData.find((sy) => Boolean(sy.isActive)) ?? null;
// Do NOT default selectedYearId to yearsData[0] if no active year exists!
setSelectedYearId(activeYear ? String(activeYear.id) : (yearsData[0] ? String(yearsData[0].id) : ""));
```

#### B. Transparent Multi-State Alerts
Replace the single ambiguous alert with three precise contextual states:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Case 1: Active Year Exists, but Register is Viewing a Historical Year       │
├─────────────────────────────────────────────────────────────────────────────┤
│ ℹ️ Viewing SY 2024–2025 (Historical Archive).                               │
│ Quarter advancement is only performed on the Active School Year             │
│ (SY 2026–2027). [Switch to Active Year]                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Case 2: School Years Exist, but NONE is Active (Configuration Issue)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ Operational Term Not Active.                                             │
│ All 1 classes have completed Quarter 1 submissions for SY 2026–2027, but     │
│ quarter advancement is locked because no school year is marked active in    │
│ the database. Please request an Administrator to activate SY 2026–2027      │
│ in Admin Settings.                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Case 3: Zero School Years Exist                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ ℹ️ No school years have been created yet.                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### C. Quarter Advancement Button State
- The button is explicitly disabled if `!activeYear`.
- The button tooltip precisely explains: `"Cannot advance: SY 2026–2027 is not active. Activate in Admin Settings."`

### 6.3 Shared Types & Enrollment Workspace Synchronization
1. Move `interface SchoolYear` to `client/src/constant/schoolYear.ts` as the single canonical interface:
   ```ts
   export interface SchoolYear {
       id: number;
       startYear: string;
       endYear: string;
       isActive?: boolean | number;
       status?: "ongoing" | "completed";
   }
   ```
2. Replace duplicate interfaces in `EnrollmentWorkspace.tsx`, `AdminSettings.tsx`, `Analytics-Reports.tsx`, and `RegisterStudentRecords.tsx`.
3. Update `EnrollmentWorkspace.tsx` line 151 to prioritize `activeYear` without falling back silently.

---

## 7. Data Integrity, Edge Cases & Recovery Strategy

### 7.1 Matrix of Database States & Handling

| Scenario | Database State | System Impact | Resolution / Handling Strategy |
| :--- | :--- | :--- | :--- |
| **A. Cold Start** | 0 records in `schoolyear`. | Expected clean state. | System blocks operations cleanly. First created school year via `POST /schoolYear` is automatically assigned `isActive = 1`. |
| **B. Single Inactive Year** (User Bug) | 1 record, `isActive = 0`. | UI displays it; advancement blocked. | Migration `0037` auto-promotes to `isActive = 1`. Admin UI displays 1-click "Set as Active" button. |
| **C. Multiple Inactive Years** | $\ge 2$ records, all `isActive = 0`. | Caused by manual script or test suite. | Admin UI warns "No active term"; Admin clicks "Set as Active" on chosen term. Recovery endpoint `POST /api/schoolYear/recover-active` available. |
| **D. Multiple Active Years** (Corruption) | $\ge 2$ records with `isActive = 1`. | Unpredictable `LIMIT 1` behavior. | Migration `0037` deactivates older rows and adds `uq_single_active_schoolyear`. DB engine strictly prevents future occurrences. |
| **E. Completed Term Activation Attempt** | Record has `status = 'completed'`. | Violates DepEd term closure. | Backend `activateSchoolYearService` rejects with `400 Bad Request`. UI requires user to reopen term first. |

### 7.2 Safety Guarantees
- **No Deletions:** Existing school years, enrollments, classes, grades, and attendance records are never deleted.
- **Audit Preservation:** All previous quarter advancement history and student records remain immutable.
- **Safe Rollback:** If migration `0037` fails, the transaction rolls back cleanly without schema modification.

---

## 8. Comprehensive Testing Strategy

### 8.1 Backend Unit & Integration Tests (`server/test/schoolYear.service.test.ts`)
1. **Creation Tests:**
   - Verify creating the 1st school year in an empty DB creates it with `isActive = 1`.
   - Verify creating the 2nd school year does NOT overwrite `isActive = 1` of the 1st year.
2. **Activation Invariant Tests:**
   - Set Year 1 active. Activate Year 2. Verify Year 1 becomes `isActive = 0` and Year 2 becomes `isActive = 1`.
   - Attempt to activate a non-existent ID $\rightarrow$ `404 NotFoundError`.
   - Attempt to activate a `completed` school year $\rightarrow$ `400 BadRequestError`.
3. **Database Constraint Tests:**
   - Attempt raw SQL `INSERT` of a second row with `isActive = 1` $\rightarrow$ Expect `ER_DUP_ENTRY` on `uq_single_active_schoolyear`.
4. **Cache Purge Tests:**
   - Mock response cache. Call `activateSchoolYearService(id)`. Verify `cache.delete` was invoked for `/schoolYear`.
5. **Advancement Gate Tests:**
   - Ensure `assertQuarterCompleteService` passes when active year is valid and complete.
   - Ensure `assertQuarterCompleteService` rejects with `ConflictError` when `isActive = 0`.

### 8.2 Frontend Test Suite (`client/src/pages/admin/__tests__/AdminSettings.test.tsx`)
1. **Single Inactive Year Display:**
   - Render `AdminSettings` with `[{ id: 1, startYear: "2026", endYear: "2027", isActive: 0 }]`.
   - Expect badge "Inactive" to be visible.
   - Expect button "Set SY 2026–2027 as Active" to be present and enabled.
2. **Activation Click Flow:**
   - Click "Set SY 2026–2027 as Active".
   - Confirm in modal.
   - Verify `PATCH /schoolYear/1/activate` is called.
   - Verify UI updates badge to "Active Term".
3. **Register Tracker State:**
   - Render `RegisterStudentRecords` with inactive year.
   - Verify inline warning appears explaining that no school year is active.
   - Verify "Advance to Q2" button has `disabled={true}`.

---

## 9. Phased Implementation Roadmap

```
  Phase 1: DB Schema & Migration
  └── Add virtual generated column + unique key uq_single_active_schoolyear
  └── Clean existing data & auto-promote single inactive year

  Phase 2: Backend Core & Cache Invalidation
  └── Centralize getActiveSchoolYear() in SchoolYearModel & Service
  └── Auto-activate first created school year in createSchoolYearService
  └── Purge /schoolYear cache in mutation controllers

  Phase 3: Service Consumer Alignment
  └── Update studentRecord, dashboard, enrollments to use central service
  └── Fix academicSettings.service.test.ts teardown pollution

  Phase 4: Admin Settings UI Overhaul
  └── Add Active/Inactive badges and 1-click "Set as Active" button
  └── Implement switch confirmation dialog

  Phase 5: Register Submission Tracker Alignment
  └── Remove silent fallback; show unambiguous contextual alerts
  └── Connect advancement button state to authoritative active year

  Phase 6: Verification & End-to-End Testing
  └── Run full server & client test suites
  └── Validate quarter advance from Q1 to Q2 on Aguinaldo Grade 7
```

### Phase Details

#### Phase 1: Database Migration & Schema Invariant
- **Files Affected:** `server/migrations/0037_enforce_single_active_schoolyear.sql`
- **Dependencies:** None.
- **Exit Criteria:** Migration applies cleanly; table has `active_marker` column with unique index.

#### Phase 2: Backend Centralization & Cache Invalidation
- **Files Affected:**
  - `server/src/model/schoolYear.ts`
  - `server/src/service/schoolYear.ts`
  - `server/src/controller/schoolYear.ts`
  - `server/src/routes/schoolYear.ts`
- **Dependencies:** Phase 1.
- **Exit Criteria:** `GET /api/schoolYear/active` operational; cache invalidated immediately on activation.

#### Phase 3: Consumer Alignment & Test Cleanliness
- **Files Affected:**
  - `server/src/model/studentRecord.ts`
  - `server/src/model/dashboard.ts`
  - `server/src/service/enrollments.ts`
  - `server/test/academicSettings.service.test.ts`
- **Dependencies:** Phase 2.
- **Exit Criteria:** All backend raw queries replaced; tests restore baseline active school year in `afterEach`.

#### Phase 4: Admin Settings UI Enhancements
- **Files Affected:** `client/src/pages/admin/AdminSettings.tsx`
- **Dependencies:** Phase 2.
- **Exit Criteria:** Admin sees explicit Active badge; can activate single school year with 1 click.

#### Phase 5: Register Tracker Alignment
- **Files Affected:** `client/src/pages/register/RegisterStudentRecords.tsx`
- **Dependencies:** Phase 2 & 4.
- **Exit Criteria:** Warning banner correctly reflects active year state; button enables when active year is complete.

#### Phase 6: Full Verification
- **Files Affected:** Test suites.
- **Dependencies:** Phases 1–5.
- **Exit Criteria:** 100% test pass rate across backend and frontend; successful advancement to Q2.

---

## 10. Technical Decisions, Risks & Mitigations

### 10.1 MySQL Generated Column vs. Application-Only Locks
- **Decision:** Use a virtual generated column (`IF(isActive = 1, 1, NULL)`) with a unique index.
- **Rationale:** Application-only locking (`SELECT ... FOR UPDATE`) protects standard API paths, but does not prevent rogue scripts, migrations, or parallel test suites from inserting a second active row. Schema-level partial uniqueness provides defense-in-depth.
- **Compatibility:** Supported in MySQL 5.7+, MySQL 8.0+, MariaDB 10.2+, and TiDB.

### 10.2 Concurrency During Activation
- **Risk:** An administrator switches the active school year while a teacher is submitting a gradebook or an adviser is finalizing student records.
- **Mitigation:**
  - `activateSchoolYearService` runs inside a transaction with row locking on `schoolyear`.
  - Academic submissions specify `schoolYearId` explicitly. If a teacher submits against a term that just became inactive, the submission still attaches to the correct historical `schoolYearId` record without data loss.

### 10.3 Completed Year Protection
- **Decision:** Block activation of any school year with `status = 'completed'`.
- **Rationale:** A completed school year has closed rosters and potentially altered faculty roles. Activating it without reopening would lead to invalid classroom state. The UI will instruct the administrator to "Reopen School Year" first.

---

## 11. Measurable Acceptance Criteria

1. **Schema Invariant:** The database allows multiple rows with `isActive = 0`, but rejects any insert/update creating a second row with `isActive = 1` with a duplicate key error.
2. **Single Year Auto-Activation:** When an empty database has its first school year created via `POST /api/schoolYear`, it is created with `isActive = 1`.
3. **Admin Settings Usability:**
   - A single inactive school year displays an amber **"Inactive"** badge.
   - An explicit button **"Set SY 2026–2027 as Active"** is visible and functional.
   - Clicking the button successfully calls `PATCH /api/schoolYear/:id/activate`, updates the database, invalidates the server cache, and updates the badge to **"Active Term"** without requiring a page reload.
4. **Register Submission Tracker Usability:**
   - When `SY 2026–2027` is active and all classes are complete (Aguinaldo Grade 7 1/1), the warning banner disappears.
   - The **"Advance to Q2"** button is fully enabled.
   - Clicking "Advance to Q2" successfully increments `academic_settings.currentQuarter` from 1 to 2 and locks Q1 records.
5. **Zero Data Regression:** Existing student enrollments, historical grades, and attendance records remain 100% intact.
6. **Zero Test Suite Contamination:** Running backend vitest suites does not wipe `isActive = 1` from the baseline database.

---
*End of Implementation Plan. Ready for architectural sign-off.*

