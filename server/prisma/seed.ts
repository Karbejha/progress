import { PrismaClient, Role, Priority, PlanStatus, TaskStatus, SummaryStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding General Directorate of Ports data...');

  // Clean existing data in reverse dependency order
  await prisma.executiveFeedback.deleteMany();
  await prisma.dailySummary.deleteMany();
  await prisma.planTask.deleteMany();
  await prisma.dailyPlan.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();
  await prisma.directorate.deleteMany();

  const hashedPassword = await bcrypt.hash('password123', 10);
  const adminHashedPassword = await bcrypt.hash('admin123', 10);

  // 1. Seed Directorates
  const directoratesConfig = [
    // Top-Level / Executive
    {
      code: 'DG_OFFICE',
      name: 'مكتب المدير العام',
      category: 'EXECUTIVE',
      description: 'المتابعة المباشرة لقرارات وتوجيهات المدير العام والتنسيق مع كافة الجهات الرسمية والوزارية.',
      icon: 'Briefcase',
      displayOrder: 1,
    },
    {
      code: 'IMSAS',
      name: 'مكتب التدقيق الإلزامي للدول الأعضاء في المنظمة البحرية الدولية (IMSAS)',
      category: 'EXECUTIVE',
      description: 'متابعة الامتثال للاتفاقيات الدولية والمعايير الصادرة عن المنظمة البحرية الدولية IMO.',
      icon: 'Globe',
      displayOrder: 2,
    },
    {
      code: 'PSC',
      name: 'مديرية رقابة دولة الميناء Port State Control',
      category: 'OPERATIONAL',
      description: 'التفتيش على السفن الأجنبية التي تؤم الموانئ السورية والتحقق من التزامها بمعايير السلامة الدولية.',
      icon: 'ShieldAlert',
      displayOrder: 3,
    },
    {
      code: 'PLANNING',
      name: 'مديرية التخطيط والإحصاء',
      category: 'MANAGEMENT',
      description: 'إعداد الخطط الاستراتيجية وجمع وتحليل المؤشرات الإحصائية المرفئية والبحرية.',
      icon: 'LineChart',
      displayOrder: 4,
    },
    {
      code: 'PR',
      name: 'مديرية العلاقات العامة',
      category: 'MANAGEMENT',
      description: 'تنظيم الفعاليات والتواصل الإعلامي والتنسيق مع الوفود والمنظمات البحرية.',
      icon: 'Users',
      displayOrder: 5,
    },
    {
      code: 'TARTOUS_BRANCH',
      name: 'فرع المديرية العامة للموانئ بطرطوس',
      category: 'OPERATIONAL',
      description: 'الإشراف على العمليات المرفئية والموانئ والمخافر البحرية في قطاع محافظة طرطوس.',
      icon: 'Building2',
      displayOrder: 6,
    },
    {
      code: 'INTERNAL_AUDIT',
      name: 'مديرية الرقابة الداخلية',
      category: 'MANAGEMENT',
      description: 'التدقيق الإداري والمالي وضمان النزاهة وحسن تطبيق القوانين والأنظمة.',
      icon: 'ShieldCheck',
      displayOrder: 7,
    },
    {
      code: 'SUPPLY',
      name: 'مديرية الدعم والتوريد والمستودعات',
      category: 'SUPPORT',
      description: 'إدارة المستودعات المركزية وتأمين المشتريات والتجهيزات البحرية والفنية.',
      icon: 'Boxes',
      displayOrder: 8,
    },
    {
      code: 'MORAL_GUIDANCE',
      name: 'مكتب التوجيه المعنوي',
      category: 'EXECUTIVE',
      description: 'تعزيز الانضباط ورفع الروح المعنوية للكوادر البحرية والتنظيم الداخلي.',
      icon: 'HeartHandshake',
      displayOrder: 9,
    },
    {
      code: 'MARITIME_EDU',
      name: 'مديرية التعليم والتأهيل والتدريب البحري',
      category: 'TECHNICAL',
      description: 'إدارة المؤسسات التعليمية البحرية وتطبيق معايير STCW وتأهيل البحارة.',
      icon: 'GraduationCap',
      displayOrder: 10,
    },
    {
      code: 'FINANCE',
      name: 'مديرية الشؤون المالية',
      category: 'MANAGEMENT',
      description: 'إعداد الموازنة وتحصيل الرسوم المرفئية والرواتب والصرف المالي.',
      icon: 'Coins',
      displayOrder: 11,
    },
    {
      code: 'INSPECTION',
      name: 'مديرية التفتيش البحري',
      category: 'OPERATIONAL',
      description: 'معاينة السفن الوطنية وإصدار شهادات الصلاحية والسلامة ودفاتر البحارة.',
      icon: 'FileCheck',
      displayOrder: 12,
    },
    {
      code: 'MAINTENANCE',
      name: 'مديرية المنشآت والصيانة الفنية',
      category: 'TECHNICAL',
      description: 'صيانة الأرصفة والمباني والفنارات والعوامات والمنشآت المرفئية والآليات الثقيلة.',
      icon: 'Wrench',
      displayOrder: 13,
    },
    {
      code: 'FISHERIES_LICENSES',
      name: 'مديرية المصائد والرخص',
      category: 'OPERATIONAL',
      description: 'تنظيم شؤون الصيد البحري وإصدار رخص المراكب والصيادين وحماية البيئة البحرية.',
      icon: 'Fish',
      displayOrder: 14,
    },
    {
      code: 'INFORMATICS',
      name: 'مديرية المعلوماتية',
      category: 'TECHNICAL',
      description: 'تطوير البرمجيات وإدارة قواعد البيانات والتحول الرقمي للأنظمة البحرية.',
      icon: 'Cpu',
      displayOrder: 15,
    },
    {
      code: 'IT_INFRA',
      name: 'مديرية تقانة المعلومات والبنية التحتية',
      category: 'TECHNICAL',
      description: 'إدارة الشبكات والسيرفرات والاتصالات البحرية والأمن السيبراني.',
      icon: 'Network',
      displayOrder: 16,
    },
    {
      code: 'VEHICLES',
      name: 'مديرية الآليات والمركبات',
      category: 'SUPPORT',
      description: 'إدارة أسطول الآليات والسيارات الحقلية وصيانتها وتوزيع المهام اللوجستية.',
      icon: 'Truck',
      displayOrder: 17,
    },
    {
      code: 'ADMIN_DEV',
      name: 'مديرية التنمية الإدارية',
      category: 'MANAGEMENT',
      description: 'هيكلة الوظائف والتدريب والتوصيف الإداري ومتابعة الأداء المؤسسي.',
      icon: 'TrendingUp',
      displayOrder: 18,
    },
    {
      code: 'LEGAL',
      name: 'مديرية الشؤون القانونية',
      category: 'MANAGEMENT',
      description: 'صياغة العقود والاتفاقيات البحرية ومتابعة القضايا والتحقيقات في الحوادث البحرية.',
      icon: 'Scale',
      displayOrder: 19,
    },
    {
      code: 'PORT_AFFAIRS',
      name: 'مديرية شؤون الموانئ والمراسي',
      category: 'OPERATIONAL',
      description: 'الإشراف على حركة الموانئ التجارية وموانئ الصيد والنزهة وإدارة المراسي والمخافر.',
      icon: 'Anchor',
      displayOrder: 20,
    },
  ];

  const createdDirectorates: Record<string, any> = {};
  for (const cfg of directoratesConfig) {
    const d = await prisma.directorate.create({
      data: {
        code: cfg.code,
        name: cfg.name,
        category: cfg.category,
        description: cfg.description,
        icon: cfg.icon,
        displayOrder: cfg.displayOrder,
      },
    });
    createdDirectorates[cfg.code] = d;
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
