import { Prisma, Role } from '@prisma/client';

// Preserve unassigned directorates. Only an explicit suspension of all their
// directors excludes a directorate, even when it still has historical activity.
export const activeDirectorateWhere: Prisma.DirectorateWhereInput = {
  OR: [
    { users: { none: { role: Role.DIRECTOR } } },
    { users: { some: { role: Role.DIRECTOR, isActive: true } } },
  ],
};

export const activeExecutiveTaskWhere: Prisma.ExecutiveTaskWhereInput = {
  directorate: activeDirectorateWhere,
  OR: [
    { assignedToUserId: null },
    { assignedToUser: { isActive: true } },
  ],
};
