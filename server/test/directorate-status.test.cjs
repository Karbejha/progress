const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ExecutiveService } = require('../src/executive/executive.service');
const { getDirectorateStatus } = require('../../client/src/lib/directorateStatus');

const assignment = (status = 'PENDING', percentage = 0, todayTargetMet = false) => ({
  id: 'assignment', title: 'تكليف المدير العام', status, completionPercentage: percentage,
  dailyProgress: [{ startCompletionPercentage: 0, completionPercentage: percentage, todayTargetMet }],
});
const completedTask = { id: 'task', title: 'مهمة صباحية', status: 'COMPLETED', completionPercentage: 100 };
const summary = { summaryText: 'إنجاز نهاية اليوم', overallCompletionRate: 0, urgentFlag: false };

const scenarios = [
  { name: 'no activity awaits the morning plan', status: 'PENDING' },
  { name: 'assigning work does not register a morning plan', assignments: [assignment()], status: 'PENDING' },
  { name: 'partial assignment progress does not register a morning plan', assignments: [assignment('IN_PROGRESS', 40)], status: 'PENDING' },
  { name: 'a met assignment target does not submit an evening summary', assignments: [assignment('IN_PROGRESS', 40, true)], status: 'PENDING' },
  { name: 'completed assignments do not submit a plan or summary', assignments: [assignment('COMPLETED', 100)], status: 'PENDING' },
  { name: 'a registered plan awaits the evening summary', plan: true, status: 'IN_PROGRESS' },
  { name: '100% morning tasks still await the evening summary', plan: true, tasks: [completedTask], status: 'IN_PROGRESS' },
  { name: '100% combined work still awaits the evening summary', plan: true, tasks: [completedTask], assignments: [assignment('COMPLETED', 100)], status: 'IN_PROGRESS' },
  { name: 'a submitted summary is recorded even with 0% progress', summary, status: 'COMPLETED' },
  { name: 'a submitted summary is recorded with unfinished assignments', summary, assignments: [assignment()], status: 'COMPLETED' },
  { name: 'an urgent summary takes priority over the completion theme', summary: { ...summary, urgentFlag: true }, status: 'URGENT' },
];

const colors = { PENDING: 'amber', IN_PROGRESS: 'blue', COMPLETED: 'emerald', URGENT: 'red' };

for (const scenario of scenarios) {
  test(`directorate reporting: ${scenario.name}`, async () => {
    const fixture = {
      id: 'directorate', name: 'مديرية تجريبية', code: 'PR', category: 'ADMINISTRATIVE',
      users: [{ id: 'director', fullName: 'مدير المديرية', role: 'DIRECTOR' }],
      executiveTasks: scenario.assignments || [],
      dailyPlans: scenario.plan || scenario.summary ? [{
        id: 'plan', tasks: scenario.tasks || [], dailySummary: scenario.summary || null, feedbacks: [],
      }] : [],
    };
    const service = new ExecutiveService({ directorate: { findMany: async () => [fixture] } }, {}, {});
    const result = await service.getDailyOverview();
    const item = result.directorates[0];

    assert.equal(getDirectorateStatus(item), scenario.status, 'Cards, hierarchy, filters and counts use the reporting state');
    assert.equal(item.statusColor, colors[scenario.status], 'The API reports the same state as the dashboard');
    assert.equal(result.kpis.plansSubmittedCount, fixture.dailyPlans.length);
    assert.equal(result.kpis.summariesSubmittedCount, scenario.summary ? 1 : 0);
    assert.equal(item.tasksCount, (scenario.tasks || []).length + fixture.executiveTasks.length);
    assert.equal(item.executiveTasks.length, fixture.executiveTasks.length, 'Assignments remain available for review');
    if (scenario.status === 'PENDING') assert.equal(item.statusTag, 'لم يتم تقديم خطة');
    if (scenario.status === 'URGENT') assert.equal(item.statusTag, 'تنبيه عاجل');
    if (scenario.name.startsWith('100%') || scenario.assignments?.[0]?.dailyProgress[0].todayTargetMet || scenario.assignments?.[0]?.status === 'COMPLETED') {
      assert.equal(item.completionRate, 100, 'Reporting state does not hide actual task progress');
    }
  });
}

test('an urgent flag takes priority even when the morning plan has not been registered', () => {
  assert.equal(getDirectorateStatus({ hasPlan: false, hasSummary: false, urgentFlag: true }), 'URGENT');
});
