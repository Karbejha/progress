type OrderedTask = {
  id?: string;
  createdAt?: string;
  displayOrder?: number;
  isExecutive?: boolean;
};

export function newestTaskEntries<T extends OrderedTask>(tasks: readonly T[]) {
  // Keep source indexes so editing/deleting a sorted draft still targets the right task.
  return tasks.map((task, index) => ({ task, index })).sort((a, b) => {
    const executiveOrder = Number(!!b.task.isExecutive) - Number(!!a.task.isExecutive);
    if (executiveOrder) return executiveOrder;

    const draftOrder = Number(!b.task.id) - Number(!a.task.id);
    if (draftOrder) return draftOrder;

    const createdOrder = (Date.parse(b.task.createdAt || '') || 0) - (Date.parse(a.task.createdAt || '') || 0);
    if (createdOrder) return createdOrder;

    return (b.task.displayOrder ?? b.index) - (a.task.displayOrder ?? a.index) || b.index - a.index;
  });
}

export function newestTasksFirst<T extends OrderedTask>(tasks: readonly T[]): T[] {
  return newestTaskEntries(tasks).map(({ task }) => task);
}
