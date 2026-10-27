import { Prisma, Role } from '@prisma/client';

// Preserve unassigned directorates. Only an explicit suspension of all their
// directors excludes a directorate, even when it still has historical activity.
export const activeDirectorateWhere: Prisma.DirectorateWhereInput = {
  OR: [
    { users: { none: { role: Role.DIRECTOR } } },
    { users: { some: { role: Role.DIRECTOR, isActive: true } } },
  ],
};

// Submission KPIs only cover directorates with an active reporting director.
// Stored activity or users in other roles must not add to that population.
export const reportingDirectorateWhere: Prisma.DirectorateWhereInput = {
  users: { some: { role: Role.DIRECTOR, isActive: true } },
};

export const activeExecutiveTaskWhere: Prisma.ExecutiveTaskWhereInput = {
  directorate: activeDirectorateWhere,
  OR: [
    { assignedToUserId: null },
    { assignedToUser: { isActive: true } },
  ],
};
