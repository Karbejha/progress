import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning operational data (Daily Plans, Tasks, Summaries, Feedbacks, Announcements)...');

  // 1. Delete Executive Feedbacks
  const deletedFeedbacks = await prisma.executiveFeedback.deleteMany({});
  console.log(`Deleted ExecutiveFeedbacks: ${deletedFeedbacks.count}`);

  // 2. Delete Daily Summaries (Achievements & Evening Reports)
  const deletedSummaries = await prisma.dailySummary.deleteMany({});
  console.log(`Deleted DailySummaries: ${deletedSummaries.count}`);

  // 3. Delete Plan Tasks
  const deletedTasks = await prisma.planTask.deleteMany({});
  console.log(`Deleted PlanTasks: ${deletedTasks.count}`);

  // 4. Delete Daily Plans (Morning Plans)
  const deletedPlans = await prisma.dailyPlan.deleteMany({});
  console.log(`Deleted DailyPlans: ${deletedPlans.count}`);

  // 5. Delete Announcements
  const deletedAnnouncements = await prisma.announcement.deleteMany({});
  console.log(`Deleted Announcements: ${deletedAnnouncements.count}`);

  // Verification
  const directoratesCount = await prisma.directorate.count();
  const usersCount = await prisma.user.count();
  const remainingPlans = await prisma.dailyPlan.count();
  const remainingSummaries = await prisma.dailySummary.count();
  const remainingAnnouncements = await prisma.announcement.count();
  const remainingFeedbacks = await prisma.executiveFeedback.count();

  console.log('\n--- Database State After Cleanup ---');
  console.log(`Directorates (preserved): ${directoratesCount}`);
  console.log(`Users (preserved): ${usersCount}`);
  console.log(`DailyPlans: ${remainingPlans}`);
  console.log(`DailySummaries: ${remainingSummaries}`);
  console.log(`ExecutiveFeedbacks: ${remainingFeedbacks}`);
  console.log(`Announcements: ${remainingAnnouncements}`);
  console.log('Database successfully cleaned!\n');
}

main()
  .catch((e) => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
