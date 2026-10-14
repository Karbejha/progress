import { DailyPlan, PlanTask, PrismaClient } from '@prisma/client';

export type LinkedPlanTask = PlanTask & {
  dailyPlan: Pick<DailyPlan, 'id' | 'directorateId' | 'planDate'> & {
    directorate?: { name: string };
  };
};

// Titles are not identities: follow only explicit carryover relations, and
// never cross a directorate boundary, including malformed or cyclic links.
export async function collectLinkedPlanTasks(
  prisma: Pick<PrismaClient, 'planTask'>,
  seedTasks: LinkedPlanTask[],
  directorateId: string,
): Promise<Map<string, LinkedPlanTask>> {
  const family = new Map(seedTasks
    .filter((task) => task.dailyPlan.directorateId === directorateId)
    .map((task) => [task.id, task]));
  let frontier = [...family.keys()];
  while (frontier.length > 0) {
    const parentIds = frontier
      .map((id) => family.get(id).carriedFromTaskId)
      .filter((id) => id && !family.has(id));
    const relatedTasks = await prisma.planTask.findMany({
      where: {
        dailyPlan: { directorateId },
        OR: [
          { carriedFromTaskId: { in: frontier } },
          { id: { in: parentIds } },
        ],
      },
      include: { dailyPlan: { include: { directorate: true } } },
    });
    frontier = [];
    for (const task of relatedTasks) {
      if (task.dailyPlan.directorateId !== directorateId || family.has(task.id)) continue;
      family.set(task.id, task);
      frontier.push(task.id);
    }
  }
  return family;
}
