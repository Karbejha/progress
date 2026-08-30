# دليل النشر والتشغيل على السيرفر (Docker & CI/CD)
## General Directorate of Ports - Deployment Guide

هذا الدليل يوضح كيفية تشغيل المنظومة على أي سيرفر خارجي (VPS / Dedicated Server / Cloud) باستخدام **Docker & Docker Compose** وإعداد مسارات **CI/CD** عبر **GitHub Actions**.

---

## 1. التشغيل السريع على أي سيرفر جديد (خلال دقيقتين)

### الخطوة 1: استنساخ المشروع أو نقله إلى السيرفر
```bash
git clone <YOUR_REPOSITORY_URL> /opt/ports-daily-system
cd /opt/ports-daily-system
```

### الخطوة 2: إنشاء ملف الإعدادات البيئية `.env`
انسخ ملف النموذج `.env.example` إلى `.env`:
```bash
cp .env.example .env
```
*(يمكنك تعديل كلمات المرور أو المنافذ حسب رغبتك داخل `.env`).*

### الخطوة 3: تشغيل المنظومة بالكامل بضغطة زر
```bash
docker compose up -d --build
```

**هذا الأمر سيقوم تلقائياً بـ:**
1. تشغيل قاعدة بيانات **PostgreSQL** وإنشاء جداول النظام.
2. بناء وتشغيل خادم **Nest.js** وبذر بيانات كافة المديريات الـ 20 وحسابات المدراء فوراً.
3. بناء وتشغيل واجهة **Next.js** الإنتاجية (Standalone Mode).
4. تفعيل قنوات **WebSockets** للبث اللحظي.

---

## 2. الروابط الافتراضية بعد التشغيل
- **الواجهة الأمامية للمدراء والمدير العام**: `http://YOUR_SERVER_IP:3000`
- **الخادم الخلفي (API & WebSockets)**: `http://YOUR_SERVER_IP:4000`
- **قاعدة البيانات**: منفذ `5432` داخلياً عبر شبكة `ports_network`.

### الحسابات الافتراضية الجاهزة للتجربة:
- **المدير العام**: `director_general` / كلمة المرور: `admin123`
- **معاون المدير**: `deputy_director` / كلمة المرور: `admin123`
- **مدراء المديريات الـ 20**: (مثال: `dir_inspection`، `dir_ports`، `dir_legal`...) / كلمة المرور: `password123`

---

## 3. إدارة الحاويات (Docker Commands)

- **عرض حالة الحاويات النشطة**:
  ```bash
  docker compose ps
  ```
- **عرض سجلات التشغيل الحية (Logs)**:
  ```bash
  docker compose logs -f
  ```
- **إيقاف المنظومة**:
  ```bash
  docker compose down
  ```
- **إعادة تشغيل المنظومة**:
  ```bash
  docker compose restart
  ```
- **تحديث الكود وإعادة البناء**:
  ```bash
  git pull
  docker compose up -d --build
  ```

---

## 4. مسارات الـ CI/CD المؤتمتة (GitHub Actions)

تم إنشاء مسارين مؤتمتين داخل المجلد `.github/workflows/`:

### أ. مسار الفحص والتحقق (`.github/workflows/ci.yml`):
- يعمل تلقائياً مع كل `push` أو `pull_request`.
- يفحص بناء الباك إند وتوليد الـ Prisma Client.
- يفحص بناء الفرونت إند والـ Standalone output.
- يتحقق من نجاح بناء صور الـ Docker دون أخطاء.

### ب. مسار النشر التلقائي للسيرفر (`.github/workflows/deploy.yml`):
- يعمل عند الدمج في فرع `main` أو إصدار Version Tag جديد (`v1.0.0`).
- يبني صور الـ Docker ويرفعها تلقائياً إلى GitHub Packages Registry (GHCR).
- يتصل بالسيرفر عبر SSH لتطبيق التحديث وتشغيل الحاويات الجديدة فوراً.

### لتفعيل النشر التلقائي عبر SSH، أضف المتغيرات التالية في إعدادات مستودع GitHub (Repository Secrets):
- `SERVER_HOST`: عنوان IP أو دومين السيرفر الخاص بك.
- `SERVER_USER`: اسم المستخدم (مثلاً `root` أو `ubuntu`).
- `SERVER_SSH_KEY`: مفتاح الـ SSH الخاص للاتصال بالسيرفر.
- `PROD_API_URL`: رابط الـ API الإنتاجي (مثلاً `https://api.ports.gov.sy` أو `http://YOUR_SERVER_IP:4000`).

---

## 5. النسخ الاحتياطي لقاعدة البيانات (Database Backups)
البيانات محفوظة بشكل دائم في Docker Volume باسم `ports_pgdata`.

لأخذ نسخة احتياطية سريعة من قاعدة البيانات في أي وقت:
```bash
docker exec -t ports-postgres pg_dump -U postgres ports_daily_system > backup_$(date +%Y%m%d_%H%M%S).sql
```

لاستعادة نسخة سابقة:
```bash
cat backup_file.sql | docker exec -i ports-postgres psql -U postgres -d ports_daily_system
```
