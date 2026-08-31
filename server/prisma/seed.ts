import { PrismaClient, Role, Priority, TaskStatus, PlanStatus, SummaryStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding General Directorate of Ports data...');

  // Clear existing
  await prisma.announcement.deleteMany();
  await prisma.executiveFeedback.deleteMany();
  await prisma.dailySummary.deleteMany();
  await prisma.planTask.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.directorate.deleteMany();

  const hashedPassword = await bcrypt.hash('password123', 10);
  const adminHashedPassword = await bcrypt.hash('admin123', 10);

  // 1. Seed Directorates
  const directoratesData = [
    {
      code: 'DG_OFFICE',
      name: 'مكتب المدير العام',
      category: 'EXECUTIVE_OFFICE',
      description: 'متابعة الديوان والسكرتاريا وتنسيق المعاملات اليومية للإدارة العليا',
      icon: 'Briefcase',
      displayOrder: 1,
    },
    {
      code: 'IMSAS',
      name: 'مكتب التدقيق الإلزامي للدول الأعضاء في المنظمة البحرية الدولية (IMSAS)',
      category: 'EXECUTIVE_OFFICE',
      description: 'متابعة الاتفاقيات الدولية والعلاقات والتمثيل الدولي البحري',
      icon: 'Globe',
      displayOrder: 2,
    },
    {
      code: 'PSC',
      name: 'مديرية رقابة دولة الميناء Port State Control',
      category: 'OPERATIONAL',
      description: 'التنفيذ الفني والرقابة القانونية والتنسيق الدولي وقواعد البيانات',
      icon: 'ShieldCheck',
      displayOrder: 3,
    },
    {
      code: 'PLANNING',
      name: 'مديرية التخطيط والإحصاء',
      category: 'ADMINISTRATIVE',
      description: 'إعداد الخطط الاستراتيجية والإحصاءات والدراسات التنموية للموانئ',
      icon: 'BarChart3',
      displayOrder: 4,
    },
    {
      code: 'PR',
      name: 'مديرية العلاقات العامة',
      category: 'ADMINISTRATIVE',
      description: 'التواصل المؤسسي والإعلامي والفعاليات والبروتوكول',
      icon: 'Megaphone',
      displayOrder: 5,
    },
    {
      code: 'TARTOUS_BRANCH',
      name: 'فرع المديرية العامة للموانئ في طرطوس',
      category: 'OPERATIONAL',
      description: 'الإشراف على العمليات والخدمات البحرية في محافظة طرطوس',
      icon: 'Building2',
      displayOrder: 6,
    },
    {
      code: 'INTERNAL_AUDIT',
      name: 'مديرية الرقابة الداخلية',
      category: 'AUDIT_LEGAL',
      description: 'التدقيق المالي والإداري وضمان الامتثال للأنظمة والقوانين',
      icon: 'CheckSquare',
      displayOrder: 7,
    },
    {
      code: 'SUPPLY',
      name: 'مديرية الدعم والتوريد',
      category: 'LOGISTICS',
      description: 'إدارة المشتريات والمستودعات وتأمين اللوازم الفنية والتشغيلية',
      icon: 'Truck',
      displayOrder: 8,
    },
    {
      code: 'MORAL_GUIDANCE',
      name: 'مكتب التوجيه المعنوي',
      category: 'ADMINISTRATIVE',
      description: 'الأنشطة المعنوية والتوعوية ومتابعة شؤون الكادر البشري',
      icon: 'HeartHandshake',
      displayOrder: 9,
    },
    {
      code: 'MARITIME_EDU',
      name: 'مديرية التعليم والتأهيل البحري',
      category: 'OPERATIONAL',
      description: 'المؤسسات والمناهج والامتحانات وإصدار الشهادات والأهلية البحرية',
      icon: 'GraduationCap',
      displayOrder: 10,
    },
    {
      code: 'FINANCE',
      name: 'مديرية المالية',
      category: 'AUDIT_LEGAL',
      description: 'إدارة الموازنة والحسابات والإيرادات والمصروفات المالية',
      icon: 'Coins',
      displayOrder: 11,
    },
    {
      code: 'INSPECTION',
      name: 'مديرية التفتيش البحري',
      category: 'OPERATIONAL',
      description: 'معاينة السفن الوطنية وتسجيلها ومتابعة العمل والمهن البحرية',
      icon: 'Search',
      displayOrder: 12,
    },
    {
      code: 'MAINTENANCE',
      name: 'مديرية المنشآت والصيانة',
      category: 'TECHNICAL',
      description: 'صيانة الأرصفة والمنشآت المرفئية والمعدات والشبكات التحتية',
      icon: 'Wrench',
      displayOrder: 13,
    },
    {
      code: 'FISHERIES_LICENSES',
      name: 'مديرية المصائد والرخص (الصيد والأملاك البحرية)',
      category: 'OPERATIONAL',
      description: 'تنظيم قوارب الصيد ورخص الصيد وإشغالات الأملاك العامة البحرية',
      icon: 'Fish',
      displayOrder: 14,
    },
    {
      code: 'INFORMATICS',
      name: 'مديرية المعلوماتية',
      category: 'TECHNICAL',
      description: 'إدارة الأنظمة والبرمجيات وقواعد البيانات والتحول الرقمي',
      icon: 'Binary',
      displayOrder: 15,
    },
    {
      code: 'IT_INFRA',
      name: 'مديرية تقانة المعلومات',
      category: 'TECHNICAL',
      description: 'البنية التحتية للشبكات والخوادم والاتصالات وأمن المعلومات',
      icon: 'Server',
      displayOrder: 16,
    },
    {
      code: 'VEHICLES',
      name: 'مديرية الآليات',
      category: 'LOGISTICS',
      description: 'إدارة أسطول الآليات والسيارات والرافعات وصيانتها وجاهزيتها',
      icon: 'Car',
      displayOrder: 17,
    },
    {
      code: 'ADMIN_DEV',
      name: 'مديرية التنمية الإدارية',
      category: 'ADMINISTRATIVE',
      description: 'تطوير الهياكل التنظيمية والتوصيف الوظيفي وتدريب الكوادر',
      icon: 'TrendingUp',
      displayOrder: 18,
    },
    {
      code: 'LEGAL',
      name: 'مديرية الشؤون القانونية',
      category: 'AUDIT_LEGAL',
      description: 'الدراسات والاستشارات القانونية والعقود ومتابعة القضايا',
      icon: 'Scale',
      displayOrder: 19,
    },
    {
      code: 'PORT_AFFAIRS',
      name: 'مديرية شؤون الموانئ',
      category: 'OPERATIONAL',
      description: 'غرفة العمليات والمساحة البحرية ومكافحة التلوث ودوائر الموانئ',
      icon: 'Anchor',
      displayOrder: 20,
    },
  ];

  const createdDirectorates: Record<string, any> = {};
  for (const d of directoratesData) {
    const dir = await prisma.directorate.create({ data: d });
    createdDirectorates[d.code] = dir;
  }

  // 2. Seed Users
  // General Director
  const generalDirector = await prisma.user.create({
    data: {
      email: 'general.director@ports.gov.sy',
      username: 'director_general',
      password: adminHashedPassword,
      fullName: 'المدير العام للموانئ',
      title: 'المدير العام للموانئ',
      role: Role.GENERAL_DIRECTOR,
      phone: '0944000111',
    },
  });

  // Assistant Director
  const assistantDirector = await prisma.user.create({
    data: {
      email: 'assistant.director@ports.gov.sy',
      username: 'deputy_director',
      password: adminHashedPassword,
      fullName: 'معاون المدير العام',
      title: 'معاون المدير العام',
      role: Role.ASSISTANT_DIRECTOR,
      phone: '0944000222',
    },
  });

  // Create directors for each directorate
  const directorsConfig = [
    { code: 'DG_OFFICE', username: 'dir_office', title: 'مدير مكتب المدير العام', email: 'office@ports.gov.sy' },
    { code: 'IMSAS', username: 'dir_imsas', title: 'رئيس مكتب تدقيق IMO/IMSAS', email: 'imsas@ports.gov.sy' },
    { code: 'PSC', username: 'dir_psc', title: 'مدير رقابة دولة الميناء', email: 'psc@ports.gov.sy' },
    { code: 'PLANNING', username: 'dir_planning', title: 'مدير التخطيط والإحصاء', email: 'planning@ports.gov.sy' },
    { code: 'PR', username: 'dir_pr', title: 'مديرة العلاقات العامة', email: 'pr@ports.gov.sy' },
    { code: 'TARTOUS_BRANCH', username: 'dir_tartous', title: 'مدير فرع طرطوس', email: 'tartous@ports.gov.sy' },
    { code: 'INTERNAL_AUDIT', username: 'dir_audit', title: 'مدير الرقابة الداخلية', email: 'audit@ports.gov.sy' },
    { code: 'SUPPLY', username: 'dir_supply', title: 'مدير الدعم والتوريد', email: 'supply@ports.gov.sy' },
    { code: 'MORAL_GUIDANCE', username: 'dir_moral', title: 'رئيس مكتب التوجيه المعنوي', email: 'moral@ports.gov.sy' },
    { code: 'MARITIME_EDU', username: 'dir_edu', title: 'مدير التعليم والتأهيل البحري', email: 'edu@ports.gov.sy' },
    { code: 'FINANCE', username: 'dir_finance', title: 'مدير المالية', email: 'finance@ports.gov.sy' },
    { code: 'INSPECTION', username: 'dir_inspection', title: 'مدير التفتيش البحري', email: 'inspection@ports.gov.sy' },
    { code: 'MAINTENANCE', username: 'dir_maintenance', title: 'مدير المنشآت والصيانة', email: 'maintenance@ports.gov.sy' },
    { code: 'FISHERIES_LICENSES', username: 'dir_fisheries', title: 'مدير المصائد والرخص', email: 'fisheries@ports.gov.sy' },
    { code: 'INFORMATICS', username: 'dir_informatics', title: 'مديرة المعلوماتية', email: 'informatics@ports.gov.sy' },
    { code: 'IT_INFRA', username: 'dir_it', title: 'مدير تقانة المعلومات', email: 'it@ports.gov.sy' },
    { code: 'VEHICLES', username: 'dir_vehicles', title: 'مدير الآليات', email: 'vehicles@ports.gov.sy' },
    { code: 'ADMIN_DEV', username: 'dir_admin_dev', title: 'مديرة التنمية الإدارية', email: 'admin.dev@ports.gov.sy' },
    { code: 'LEGAL', username: 'dir_legal', title: 'مديرة الشؤون القانونية', email: 'legal@ports.gov.sy' },
    { code: 'PORT_AFFAIRS', username: 'dir_ports', title: 'مدير شؤون الموانئ', email: 'ports@ports.gov.sy' },
  ];

  const createdUsers: Record<string, any> = {};
  for (const cfg of directorsConfig) {
    const user = await prisma.user.create({
      data: {
        email: cfg.email,
        username: cfg.username,
        password: hashedPassword,
        fullName: '',
        title: cfg.title,
        role: Role.DIRECTOR,
        directorateId: createdDirectorates[cfg.code].id,
      },
    });
    createdUsers[cfg.code] = user;
  }

  // 3. Create Daily Plans & Summaries for Today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sample data: Inspection Directorate (Completed daily workflow)
  const planInspection = await prisma.dailyPlan.create({
    data: {
      directorateId: createdDirectorates['INSPECTION'].id,
      userId: createdUsers['INSPECTION'].id,
      planDate: today,
      status: PlanStatus.REVIEWED,
      generalFocus: 'معاينة السفن التجارية في الرصيف 4 ومطابقة معايير السلامة البحرية',
      tasks: {
        create: [
          {
            title: 'معاينة السفينة الوطنية (أوغاريت 2) وتدقيق شهادات السلامة',
            description: 'فحص معدات النجاة وأجهزة اللاسلكي وتمديد صلاحية شهادة المعاينة السنوية',
            priority: Priority.URGENT,
            estimatedHours: 3.5,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تمت المعاينة بنجاح وإصدار المحضر الفني دون ملاحظات حرجة',
            displayOrder: 1,
          },
          {
            title: 'إصدار وتجديد 8 دفاتر بحارة وشهادات أهلية للضباط',
            description: 'تدقيق المستندات الجنائية والطبية وإصدار الوثائق الرسمية',
            priority: Priority.HIGH,
            estimatedHours: 2.0,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تم تسليم كافة الدفاتر لأصحاب العلاقة بعد التدقيق',
            displayOrder: 2,
          },
          {
            title: 'إعداد التقرير الشهري لمخالفات سفن الصيد المسجلة',
            description: 'حصر الإنذارات الموجهة خلال الشهر ومطابقتها مع غرفة العمليات',
            priority: Priority.NORMAL,
            estimatedHours: 1.5,
            status: TaskStatus.IN_PROGRESS,
            completionPercentage: 75,
            completionNote: 'تم إنجاز 75% وسيتم إنهاؤه صباح الغد بالتنسيق مع الشؤون القانونية',
            displayOrder: 3,
          },
        ],
      },
    },
  });

  const summaryInspection = await prisma.dailySummary.create({
    data: {
      dailyPlanId: planInspection.id,
      directorateId: createdDirectorates['INSPECTION'].id,
      userId: createdUsers['INSPECTION'].id,
      summaryDate: today,
      summaryText: 'تم إنجاز غالبية خطة اليوم بنجاح ممتاز، حيث أنهينا معاينة السفينة أوغاريت 2 وتجديد كافة دفاتر البحارة المطلوبة.',
      achievements: [
        'معاينة كاملة للسفينة الوطنية وتمديد شهادتها',
        'إصدار 8 دفاتر بحارة جديدة وتدقيق بياناتهم',
        'تدقيق سجلات السلامة لـ 4 زوارق خدمة',
      ],
      challenges: 'نقص في بعض نماذج الكروت الأمنية الخاصة بالدفاتر البحرية ونحتاج تزويدنا بها من المستودع.',
      directorNotes: 'نرجو التوجيه للمستودعات بتسريع تسليم النماذج لتجنب تأخير معاملات البحارة.',
      urgentFlag: false,
      tomorrowPlanPreview: 'استكمال التقرير الشهري والانتقال لمعاينة قاطرتين تابعتين لفرع طرطوس.',
      overallCompletionRate: 92.0,
      status: SummaryStatus.FEEDBACK_GIVEN,
    },
  });

  // General Director Feedback on Inspection
  await prisma.executiveFeedback.create({
    data: {
      dailyPlanId: planInspection.id,
      dailySummaryId: summaryInspection.id,
      directorateId: createdDirectorates['INSPECTION'].id,
      fromUserId: generalDirector.id,
      feedbackText: 'جهد متميز ومتابعة دقيقة لسلامة السفن. تم الإيعاز لمديرية التوريد لتأمين النماذج فوراً.',
      rating: 5,
    },
  });

  // Sample data: Port Affairs (Has an urgent challenge / request)
  const planPorts = await prisma.dailyPlan.create({
    data: {
      directorateId: createdDirectorates['PORT_AFFAIRS'].id,
      userId: createdUsers['PORT_AFFAIRS'].id,
      planDate: today,
      status: PlanStatus.SUBMITTED,
      generalFocus: 'جاهزية غرفة العمليات ومتابعة حركات الدخول والمغادرة في الموانئ الرئيسية ومكافحة التلوث',
      tasks: {
        create: [
          {
            title: 'مناوبة غرفة العمليات وتنسيق دخول 6 بواخر تجارية',
            description: 'التنسيق مع برج المراقبة والإرشاد والقطر',
            priority: Priority.URGENT,
            estimatedHours: 4.0,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تم دخول 6 بواخر ورسوها بسلام دون أي تأخير',
            displayOrder: 1,
          },
          {
            title: 'جولة تفتيشية بيئية في حوض الميناء القديم ومكافحة تسرب زيوت محدود',
            description: 'استخدام الحواجز العائمة والمواد الماصة لمعالجة بقعة زيتية صغيرة',
            priority: Priority.URGENT,
            estimatedHours: 3.0,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تمت السيطرة الكاملة على التسرب وتطويقه بنجاح',
            displayOrder: 2,
          },
          {
            title: 'فحص رادار المراقبة الساحلية في محطة الرأس',
            description: 'معالجة بطء استجابة إشارة التتبع وتحديث البرمجية',
            priority: Priority.HIGH,
            estimatedHours: 2.0,
            status: TaskStatus.DELAYED,
            completionPercentage: 30,
            completionNote: 'توقف العمل بسبب عطل كهربائي مفاجئ في المولد الاحتياطي',
            displayOrder: 3,
          },
        ],
      },
    },
  });

  await prisma.dailySummary.create({
    data: {
      dailyPlanId: planPorts.id,
      directorateId: createdDirectorates['PORT_AFFAIRS'].id,
      userId: createdUsers['PORT_AFFAIRS'].id,
      summaryDate: today,
      summaryText: 'تمت إدارة دخول السفن بكفاءة عالية واحتواء حادثة التسرب النفطي البسيطة بالكامل. نواجه عطلاً في مولد محطة الرادار.',
      achievements: [
        'دخول ومغادرة 6 سفن تجارية وتفريغ الحمولات بانتظام',
        'احتواء بقعة زيتية بحرية وتنظيف الحوض',
      ],
      challenges: 'عطل مفاجئ في المولد الكهربائي الاحتياطي لمحطة رادار الرأس، مما يعيق صيانة جهاز التتبع.',
      directorNotes: 'نرجو توجيه مديرية الصيانة بإرسال فريق طوارئ كهربائي لمعالجة المولد في محطة الرأس.',
      urgentFlag: true, // Urgent flag for General Director!
      tomorrowPlanPreview: 'متابعة إصلاح رادار الرأس واستكمال مسح الأعماق للممر الملاحي رقم 2.',
      overallCompletionRate: 78.0,
      status: SummaryStatus.SUBMITTED,
    },
  });

  // Sample data: IT Directorate (In Progress)
  const planIT = await prisma.dailyPlan.create({
    data: {
      directorateId: createdDirectorates['IT_INFRA'].id,
      userId: createdUsers['IT_INFRA'].id,
      planDate: today,
      status: PlanStatus.SUBMITTED,
      generalFocus: 'تطوير البنية التحتية للشبكات والربط الضوئي بين المكاتب وتأمين السيرفرات',
      tasks: {
        create: [
          {
            title: 'ترقية نظام النسخ الاحتياطي التلقائي لخوادم قاعدة بيانات الموانئ',
            description: 'تنصيب التحديثات وجدولة النسخ كل 6 ساعات',
            priority: Priority.HIGH,
            estimatedHours: 3.0,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تمت الترقية بنجاح واختبار استعادة نسخة تجريبية',
            displayOrder: 1,
          },
          {
            title: 'تمديد كابلات الألياف الضوئية لمبنى مديرية التفتيش',
            description: 'ربط 12 نقطة شبكية جديدة وتركيب محولات السرعة العالية',
            priority: Priority.NORMAL,
            estimatedHours: 4.0,
            status: TaskStatus.IN_PROGRESS,
            completionPercentage: 60,
            completionNote: 'تم سحب الكابلات وجاري اللحام الضوئي والتركيب',
            displayOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.dailySummary.create({
    data: {
      dailyPlanId: planIT.id,
      directorateId: createdDirectorates['IT_INFRA'].id,
      userId: createdUsers['IT_INFRA'].id,
      summaryDate: today,
      summaryText: 'تم إنجاز خطة السيرفرات بنجاح، ومتابعة مد شبكة الألياف تسير وفق المخطط الزمني.',
      achievements: [
        'اكتمال نظام النسخ الاحتياطي السحابي والمحلي',
        'تجهيز 60% من شبكة الألياف لمبنى التفتيش',
      ],
      challenges: 'لا توجد معوقات، المواد متوفرة وفريق العمل ملتزم.',
      directorNotes: 'النظام جاهز لاستقبال المنظومة البرمجية الجديدة للمديرية العامة.',
      urgentFlag: false,
      tomorrowPlanPreview: 'إنهاء اللحام الضوئي وتفعيل نقاط الإنترنت لمديرية التفتيش.',
      overallCompletionRate: 85.0,
      status: SummaryStatus.SUBMITTED,
    },
  });

  // Sample data: Legal Affairs (Plan Submitted, working on tasks)
  await prisma.dailyPlan.create({
    data: {
      directorateId: createdDirectorates['LEGAL'].id,
      userId: createdUsers['LEGAL'].id,
      planDate: today,
      status: PlanStatus.SUBMITTED,
      generalFocus: 'دراسة عقود التوريدات وصياغة مذكرات الدعاوى القضائية المتعلقة بحوادث الاصطدام البحري',
      tasks: {
        create: [
          {
            title: 'إعداد المذكرة القانونية في دعوى تعويض التلوث ضد الناقلة (مارين ستار)',
            description: 'حصر الأضرار البيئية والرجوع لقانون حماية البيئة البحرية',
            priority: Priority.URGENT,
            estimatedHours: 3.5,
            status: TaskStatus.IN_PROGRESS,
            completionPercentage: 80,
            displayOrder: 1,
          },
          {
            title: 'تدقيق بنود عقد صيانة الرافعة المرفئية رقم 3 المحال من مديرية الصيانة',
            description: 'مطابقة شروط الضمان الجزائي وفترات التوريد',
            priority: Priority.HIGH,
            estimatedHours: 2.0,
            status: TaskStatus.COMPLETED,
            completionPercentage: 100,
            completionNote: 'تم تدقيق العقد وإعادته لمديرية الصيانة مع التعديلات القانونية اللازمة',
            displayOrder: 2,
          },
        ],
      },
    },
  });

  // Sample data: Planning & Statistics (Plan Submitted)
  await prisma.dailyPlan.create({
    data: {
      directorateId: createdDirectorates['PLANNING'].id,
      userId: createdUsers['PLANNING'].id,
      planDate: today,
      status: PlanStatus.SUBMITTED,
      generalFocus: 'تجميع إحصائيات حركة الموانئ والبضائع لشهر آب وإعداد مؤشرات الأداء السنوية',
      tasks: {
        create: [
          {
            title: 'تدقيق جداول الحمولات الواردة والصادرة عبر الموانئ السورية لشهر آب',
            description: 'مطابقة الأرقام مع فروع الموانئ والمصالح الجمركية',
            priority: Priority.HIGH,
            estimatedHours: 4.0,
            status: TaskStatus.IN_PROGRESS,
            completionPercentage: 50,
            displayOrder: 1,
          },
        ],
      },
    },
  });

  // Sample announcements from General Director
  await prisma.announcement.create({
    data: {
      title: 'تعميم إداري: الالتزام الصارم برفع الخطط الصباحية قبل الساعة 9:00 صباحاً',
      content: 'السادة مدراء المديريات والمكاتب والفروع، يرجى الالتزام اليومي بتسجيل خطة العمل الصباحية قبل التاسعة صباحاً وتحديث ملخص الإنجاز اليومي قبل نهاية الدوام، لضمان تقييم الأداء المرفئي بدقة.',
      priority: Priority.URGENT,
      authorId: generalDirector.id,
    },
  });

  await prisma.announcement.create({
    data: {
      title: 'جاهزية موسم الأمطار والتدقيق على منشآت ومصارف الموانئ',
      content: 'يطلب من مديرية المنشآت والصيانة ومديرية شؤون الموانئ تكثيف الجولات التفقدية للتأكد من جاهزية كواسر الأمواج ومصارف المياه والمولدات الاحتياطية.',
      priority: Priority.HIGH,
      authorId: generalDirector.id,
    },
  });

  console.log('Seeding completed successfully!');
  console.log('Directorates seeded: 20');
  console.log('Admin account: general.director@ports.gov.sy (password: admin123)');
  console.log('Director accounts created with password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
