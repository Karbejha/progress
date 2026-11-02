-- Safe to run repeatedly on existing installations: preserve IDs and history.
BEGIN;

UPDATE "Directorate"
SET "category" = 'OPERATIONAL', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'IMSAS' AND "category" IS DISTINCT FROM 'OPERATIONAL';

UPDATE "Directorate"
SET "name" = 'مديرية المصايد والرخص', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FISHERIES_LICENSES'
  AND "name" IS DISTINCT FROM 'مديرية المصايد والرخص';

UPDATE "Directorate"
SET "name" = 'مديرية المعلوماتية و التحول الرقمي', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'INFORMATICS'
  AND "name" IS DISTINCT FROM 'مديرية المعلوماتية و التحول الرقمي';

UPDATE "Directorate"
SET "name" = 'مديرية شؤون الموانئ', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PORT_AFFAIRS'
  AND "name" IS DISTINCT FROM 'مديرية شؤون الموانئ';

-- Update the old standard titles while preserving customized job titles.
UPDATE "User" u
SET "title" = 'مدير المصايد والرخص', "updatedAt" = CURRENT_TIMESTAMP
FROM "Directorate" d
WHERE u."directorateId" = d."id" AND d."code" = 'FISHERIES_LICENSES'
  AND u."role" = 'DIRECTOR' AND u."title" = 'مدير المصائد والرخص';

UPDATE "User" u
SET "title" = CASE u."title"
  WHEN 'مدير المعلوماتية' THEN 'مدير المعلوماتية و التحول الرقمي'
  ELSE 'مديرة المعلوماتية و التحول الرقمي'
END, "updatedAt" = CURRENT_TIMESTAMP
FROM "Directorate" d
WHERE u."directorateId" = d."id" AND d."code" = 'INFORMATICS'
  AND u."role" = 'DIRECTOR' AND u."title" IN ('مدير المعلوماتية', 'مديرة المعلوماتية');

COMMIT;
