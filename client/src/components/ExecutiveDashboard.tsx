'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, ExecutiveOverviewResponse, DirectorateOverviewItem, Announcement } from '../types';
import { api } from '../services/api';
import { DirectorateCard } from './DirectorateCard';
import { OrgHierarchyChart } from './OrgHierarchyChart';
import { DirectorateDetailModal } from './DirectorateDetailModal';
import {
  Shield,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  Search,
  LayoutGrid,
  GitFork,
  Megaphone,
  Calendar,
  X,
  Send,
  Users,
  Layers,
  Plus,
  Eye,
} from 'lucide-react';

import { UsersManagementModal } from './UsersManagementModal';
import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import { ExecutiveTasksModal } from './ExecutiveTasksModal';
import { CustomDatePicker } from './CustomDatePicker';
import { getSocket } from '../lib/socket';
import { getReadAnnouncementIds, markAnnouncementAsRead } from '../lib/announcements';

interface ExecutiveDashboardProps {
  currentUser: User;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ currentUser }) => {
  const [data, setData] = useState<ExecutiveOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [viewMode, setViewMode] = useState<'GRID' | 'CHART' | 'URGENT'>('GRID');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDirectorate, setSelectedDirectorate] = useState<DirectorateOverviewItem | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showAnnouncementsListModal, setShowAnnouncementsListModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', priority: 'NORMAL' });
  const [submittingAnnouncement, setSubmittingAnnouncement] = useState(false);
  const [liveToast, setLiveToast] = useState<{ title: string; desc: string } | null>(null);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);

  useEffect(() => {
    setReadAnnouncementIds(getReadAnnouncementIds(currentUser.id));

    const handleReadUpdate = (e: any) => {
      if (e.detail?.userId === currentUser.id) {
        setReadAnnouncementIds(e.detail.readIds || getReadAnnouncementIds(currentUser.id));
      }
    };

    window.addEventListener('announcements:read_updated', handleReadUpdate);
    return () => window.removeEventListener('announcements:read_updated', handleReadUpdate);
  }, [currentUser.id]);

  useEffect(() => {
    loadOverview();
    loadAnnouncements();
    loadTasksCount();
  }, [selectedDate]);

  const loadTasksCount = async () => {
    try {
      const allTasks = await api.getExecutiveTasks();
      const active = allTasks.filter((t) => t.status !== 'COMPLETED').length;
      setActiveTasksCount(active);
    } catch (err) {
      console.error('Failed to load tasks count', err);
    }
  };

  useEffect(() => {
    if (!showAnnouncementModal) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAnnouncementModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAnnouncementModal]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const triggerLiveAlert = (title: string, desc: string) => {
      setLiveToast({ title, desc });
      loadOverview();
      loadTasksCount();
      setTimeout(() => setLiveToast(null), 4000);
    };

    socket.on('plan:submitted', (payload: any) => {
      triggerLiveAlert('خطة جديدة مرفوعة لحظياً', `قام ${payload.directorName} (${payload.directorateName}) برفع الخطة الصباحية.`);
    });

    socket.on('task:updated', (payload: any) => {
      triggerLiveAlert('تحديث إنجاز مهمة لحظياً', `قامت ${payload.directorateName} بتحديث "${payload.taskTitle}" إلى (${payload.completionPercentage}%).`);
    });

    socket.on('summary:submitted', (payload: any) => {
      triggerLiveAlert('تسليم ملخص إنجاز لحظياً', `سلّمت ${payload.directorateName} ملخص نهاية الدوام بنسبة ${payload.overallCompletionRate}%.`);
    });

    socket.on('announcement:created', (payload: any) => {
      loadAnnouncements();
    });

    socket.on('executive-task:created', (payload: any) => {
      triggerLiveAlert('تكليف جديد من المدير العام', `تم إسناد تكليف لـ (${payload.directorateName}): "${payload.task?.title || ''}"`);
      loadTasksCount();
    });

    socket.on('executive-task:updated', (payload: any) => {
      triggerLiveAlert('تحديث إنجاز تكليف المدير العام', `قامت (${payload.directorateName}) بتحديث إنجاز التكليف "${payload.task?.title}" إلى (${payload.task?.completionPercentage}%).`);
      loadTasksCount();
    });

    socket.on('executive-task:deleted', () => {
      loadOverview();
      loadTasksCount();
    });

    return () => {
      socket.off('plan:submitted');
      socket.off('task:updated');
      socket.off('summary:submitted');
      socket.off('announcement:created');
      socket.off('executive-task:created');
      socket.off('executive-task:updated');
      socket.off('executive-task:deleted');
    };
  }, []);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await api.getExecutiveOverview(selectedDate);
      setData(res);
    } catch (err) {
      console.error('Failed to load executive overview', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnnouncements = async () => {
    try {
      const res = await api.getAnnouncements();
      setAnnouncements(res);
    } catch (err) {
      console.error('Failed to load announcements', err);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) return;

    try {
      setSubmittingAnnouncement(true);
      const title = announcementForm.title;
      await api.createAnnouncement(announcementForm);
      setAnnouncementForm({ title: '', content: '', priority: 'NORMAL' });
      setShowAnnouncementModal(false);
      loadAnnouncements();
      setLiveToast({
        title: 'تم نشر التعميم بنجاح',
        desc: `تم تعميم "${title}" وإرسال إشعار فوري لكافة مديريات الموانئ.`,
      });
      setTimeout(() => setLiveToast(null), 4000);
    } catch (err) {
      console.error('Failed to create announcement', err);
    } finally {
      setSubmittingAnnouncement(false);
    }
  };

  const filteredDirectorates = (data?.directorates || []).filter((dir) => {
    const matchesSearch =
      dir.directorateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (dir.director?.fullName && dir.director.fullName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (dir.generalFocus && dir.generalFocus.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (viewMode === 'URGENT') {
      return dir.urgentFlag || (dir.challenges && dir.challenges.length > 0);
    }

    if (activeCategory === 'ALL') return true;
    if (activeCategory === 'URGENT') return dir.urgentFlag;
    if (activeCategory === 'SUBMITTED') return dir.hasSummary;
    if (activeCategory === 'PENDING') return !dir.hasPlan;
    return dir.category === activeCategory;
  });

  const kpis = data?.kpis;

  return (
    <>
      {/* Real-time Live Toast Alert */}
      {liveToast && (
        <div className="fixed top-24 left-6 z-50 flex items-start gap-3 bg-[#05261e] border-2 border-[#d4af37] text-white p-4 rounded-2xl shadow-2xl animate-fadeIn max-w-sm pointer-events-auto">
          <div className="w-8 h-8 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5 text-[#d4af37]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#d4af37]">{liveToast.title}</h4>
            <p className="text-xs text-[#edece4] mt-0.5 font-medium leading-tight">{liveToast.desc}</p>
          </div>
        </div>
      )}

      <div className="space-y-4 sm:space-y-7 animate-fadeIn pb-16 relative">
        {/* Top Banner / Welcome & Actions */}
      <div className="p-4 sm:p-7 rounded-2xl sm:rounded-[28px] bg-[#05261e] border border-[#0c3e35] shadow-brand-card relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 text-white">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              لوحة الإشراف المركزي
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            متابعة إنجاز المديريات
          </h2>
          <p className="text-xs sm:text-sm text-[#8daaa2] font-medium">
            متابعة لحظية ومباشرة للخطط اليومية ونسب التنفيذ
          </p>
        </div>

        {/* Date Selector & Print Report Button */}
        <div className="relative z-10 flex items-center gap-3 flex-wrap">
          <CustomDatePicker
            value={selectedDate}
            onChange={(newDate) => setSelectedDate(newDate)}
          />

          <button
            onClick={() => setShowTasksModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer relative"
          >
            <Layers className="w-4 h-4 text-[#d4af37]" />
            <span>التكليفات والمهام المباشرة</span>
            {activeTasksCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-extrabold">
                {activeTasksCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowUsersModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>إدارة الحسابات</span>
          </button>

          <button
            onClick={() => window.open(`/report?date=${selectedDate}`, '_blank')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#d4af37] text-[#05261e] hover:bg-[#c5a059] transition shadow-md active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الإيجاز الرسمي</span>
          </button>

          <button
            onClick={() => {
              loadAnnouncements();
              setShowAnnouncementsListModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
          >
            <Megaphone className="w-4 h-4 text-[#d4af37]" />
            <span>التعاميم وسجل القراءة</span>
            {announcements.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-extrabold">
                {announcements.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowAnnouncementModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#d4af37]" />
            <span>إصدار تعميم جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid matching Comercial-Circuit StatCard */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Morning Plans Submissions */}
          <div className="rounded-2xl border border-[#d2d1c9] bg-white p-5 shadow-xs transition-shadow duration-200 hover:shadow-md">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#0c3e35]/10 text-[#0c3e35]">
                <Clock size={21} strokeWidth={2} />
              </span>
              <span className="text-xs font-bold text-[#0c3e35] bg-[#0c3e35]/10 px-2 py-0.5 rounded-md">
                {kpis.plansSubmissionRate}% التزام
              </span>
            </div>
            <div className="text-2xl font-extrabold text-[#05261e]">
              {kpis.plansSubmittedCount} <span className="text-sm font-bold text-[#5e736e]">/ {kpis.totalDirectorates}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[#5e736e]">
              الخطط الصباحية المرفوعة
            </p>
          </div>

          {/* Card 2: Evening Summaries Submissions */}
          <div className="rounded-2xl border border-[#d2d1c9] bg-white p-5 shadow-xs transition-shadow duration-200 hover:shadow-md">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={21} strokeWidth={2} />
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                {kpis.summariesSubmissionRate}% تسليم
              </span>
            </div>
            <div className="text-2xl font-extrabold text-[#05261e]">
              {kpis.summariesSubmittedCount} <span className="text-sm font-bold text-[#5e736e]">/ {kpis.totalDirectorates}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[#5e736e]">
              ملخصات الإنجاز المسائية
            </p>
          </div>

          {/* Card 3: Overall Tasks & Completion Rate */}
          <div className="rounded-2xl border border-[#d2d1c9] bg-white p-5 shadow-xs transition-shadow duration-200 hover:shadow-md">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#d4af37]/20 text-[#8a7a52]">
                <BarChart3 size={21} strokeWidth={2} />
              </span>
              <span className="text-xs font-bold text-[#8a7a52] bg-[#d4af37]/15 px-2 py-0.5 rounded-md">
                {kpis.totalCompletedTasksCount} مهمة منجزة
              </span>
            </div>
            <div className="text-2xl font-extrabold text-[#05261e]">
              {kpis.averageCompletionRate}%
            </div>
            <p className="mt-1 text-xs font-semibold text-[#5e736e]">
              معدل الإنجاز العام لمهام الموانئ
            </p>
          </div>

          {/* Card 4: Urgent Requests / Interventions */}
          <div className={`rounded-2xl border p-5 shadow-xs transition-shadow duration-200 hover:shadow-md ${
            kpis.urgentIssuesCount > 0 ? 'bg-red-50/50 border-red-300' : 'bg-white border-[#d2d1c9]'
          }`}>
            <div className="mb-3.5 flex items-center justify-between">
              <span className={`flex size-11 items-center justify-center rounded-xl ${
                kpis.urgentIssuesCount > 0 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-600'
              }`}>
                <AlertTriangle size={21} strokeWidth={2} />
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                kpis.urgentIssuesCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {kpis.urgentIssuesCount > 0 ? 'يتطلب توجيه' : 'منتظم'}
              </span>
            </div>
            <div className={`text-2xl font-extrabold ${
              kpis.urgentIssuesCount > 0 ? 'text-red-700' : 'text-[#05261e]'
            }`}>
              {kpis.urgentIssuesCount}
            </div>
            <p className="mt-1 text-xs font-semibold text-[#5e736e]">
              تنبيهات ومعوقات عاجلة
            </p>
          </div>

        </div>
      )}

      {/* Announcements Bar */}
      {(() => {
        const isExec = currentUser.role === 'GENERAL_DIRECTOR' || currentUser.role === 'ASSISTANT_DIRECTOR';

        if (isExec) {
          if (announcements.length === 0) return null;
          const latestAnn = announcements[0];
          return (
            <div
              onClick={() => {
                setSelectedAnnouncement({
                  id: latestAnn.id,
                  isAnnouncement: true,
                  type: 'announcement',
                  title: latestAnn.title,
                  content: latestAnn.content,
                  authorName: latestAnn.author?.fullName || 'المدير العام للموانئ',
                  authorTitle: latestAnn.author?.title || 'المدير العام',
                  priority: latestAnn.priority,
                  createdAt: latestAnn.createdAt,
                });
              }}
              className="p-4 rounded-2xl bg-white border border-[#d2d1c9] hover:border-[#0c3e35] transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer shadow-xs animate-fadeIn"
            >
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 shadow-xs">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37]">
                      آخر تعميم إداري صادر
                    </span>
                    <h4 className="text-xs font-bold text-[#0c3e35] truncate">{latestAnn.title}</h4>
                  </div>
                  <p className="text-xs text-[#5e736e] mt-0.5 truncate">{latestAnn.content}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 bg-[#f4f3ed] px-3 py-1.5 rounded-xl border border-[#d2d1c9] text-xs text-[#0c3e35] font-bold">
                  <Eye className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>سجل القراءة: {latestAnn.readPercentage || 0}% ({latestAnn.readCount || 0} مديرية)</span>
                </div>
                <span className="text-[11px] text-[#0c3e35] font-bold bg-[#edece4] hover:bg-[#0c3e35] hover:text-white px-3.5 py-1.5 rounded-xl border border-[#d2d1c9] transition">
                  عرض سجل المطّلعين
                </span>
              </div>
            </div>
          );
        }

        const unreadAnnouncements = announcements.filter(
          (a) => !readAnnouncementIds.includes(a.id) && a.authorId !== currentUser.id
        );

        if (unreadAnnouncements.length === 0) return null;

        const currentAnn = unreadAnnouncements[0];

        return (
          <div
            onClick={() => {
              markAnnouncementAsRead(currentUser.id, currentAnn.id);
              setSelectedAnnouncement({
                id: currentAnn.id,
                isAnnouncement: true,
                type: 'announcement',
                title: currentAnn.title,
                content: currentAnn.content,
                authorName: currentAnn.author?.fullName || 'المدير العام للموانئ',
                authorTitle: currentAnn.author?.title || 'المدير العام',
                priority: currentAnn.priority,
                createdAt: currentAnn.createdAt,
              });
            }}
            className="p-4 rounded-2xl bg-[#edece4] border border-[#d2d1c9] hover:border-[#0c3e35] transition flex items-start justify-between gap-4 cursor-pointer shadow-xs animate-fadeIn"
          >
            <div className="flex items-start gap-3 flex-1">
              <div className="w-8 h-8 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Megaphone className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[#0c3e35]">{currentAnn.title}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37]">
                    تعميم إداري جديد
                  </span>
                </div>
                <p className="text-xs text-[#5e736e] mt-0.5 line-clamp-1">{currentAnn.content}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-[#0c3e35] font-bold bg-white px-3 py-1 rounded-lg border border-[#d2d1c9]">
                انقر لقراءة التفاصيل
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markAnnouncementAsRead(currentUser.id, currentAnn.id);
                }}
                className="p-1 text-[#8daaa2] hover:text-[#0c3e35] hover:bg-white rounded-lg transition cursor-pointer"
                title="إخفاء من اللوحة (تمت القراءة)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Controls & View Mode Toggle Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#edece4] border border-[#d2d1c9]">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="ابحث باسم المديرية، اسم المدير، أو طبيعة المهمة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
          />
          <Search className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3" />
        </div>

        {/* View Mode Buttons */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-[#d2d1c9]">
          <button
            onClick={() => setViewMode('GRID')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              viewMode === 'GRID'
                ? 'bg-[#0c3e35] text-white shadow-sm'
                : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>عرض البطاقات</span>
          </button>

          <button
            onClick={() => setViewMode('CHART')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              viewMode === 'CHART'
                ? 'bg-[#0c3e35] text-white shadow-sm'
                : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>المخطط الهرمي للموانئ</span>
          </button>

          <button
            onClick={() => setViewMode('URGENT')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              viewMode === 'URGENT'
                ? 'bg-red-700 text-white shadow-sm'
                : 'text-[#5e736e] hover:text-red-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>رادار المعوقات ({data?.directorates.filter(d => d.urgentFlag).length || 0})</span>
          </button>
        </div>

      </div>

      {/* Category Tabs (Active in Grid mode) */}
      {viewMode === 'GRID' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'ALL'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            كافة المديريات ({data?.directorates.length || 20})
          </button>
          <button
            onClick={() => setActiveCategory('OPERATIONAL')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'OPERATIONAL'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            التشغيلية والبحرية
          </button>
          <button
            onClick={() => setActiveCategory('ADMINISTRATIVE')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'ADMINISTRATIVE'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            الإدارية والتنظيمية
          </button>
          <button
            onClick={() => setActiveCategory('TECHNICAL')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'TECHNICAL'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            الفنية والتقنية
          </button>
          <button
            onClick={() => setActiveCategory('AUDIT_LEGAL')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'AUDIT_LEGAL'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            الرقابة والشؤون القانونية
          </button>
          <button
            onClick={() => setActiveCategory('LOGISTICS')}
            className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
              activeCategory === 'LOGISTICS'
                ? 'bg-[#0c3e35] text-white shadow-xs'
                : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
            }`}
          >
            الدعم والآليات
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="text-center py-20 text-[#0c3e35]">
          <div className="w-10 h-10 border-3 border-[#0c3e35] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-sm">جاري تحميل بيانات الإنجاز اليومي للمديريات...</p>
        </div>
      ) : viewMode === 'CHART' ? (
        <OrgHierarchyChart
          directorates={data?.directorates || []}
          onSelectDirectorate={(item) => setSelectedDirectorate(item)}
        />
      ) : filteredDirectorates.length === 0 ? (
        <div className="text-center py-16 text-[#5e736e] bg-white rounded-2xl border border-[#d2d1c9]">
          <AlertTriangle className="w-8 h-8 text-[#d4af37] mx-auto mb-2" />
          <p className="text-sm font-bold">لا توجد مديريات مطابقة لمعايير البحث المحددة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredDirectorates.map((item) => (
            <DirectorateCard
              key={item.directorateId}
              item={item}
              onSelect={(d) => setSelectedDirectorate(d)}
            />
          ))}
        </div>
      )}

      {/* User Management Modal */}
      <UsersManagementModal
        isOpen={showUsersModal}
        onClose={() => {
          setShowUsersModal(false);
          loadOverview();
        }}
      />

      {/* Directorate Drilldown Modal & Direct Feedback */}
      <DirectorateDetailModal
        item={selectedDirectorate}
        onClose={() => setSelectedDirectorate(null)}
        onFeedbackSent={() => {
          setSelectedDirectorate(null);
          loadOverview();
        }}
      />

      {/* General Announcement Modal */}
      {showAnnouncementModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
          onClick={() => setShowAnnouncementModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#d4af37]" />
                إصدار تعميم وتوجيه عام من المدير العام
              </h3>
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="p-1.5 rounded-lg text-[#8daaa2] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[#0c3e35] font-bold mb-1.5">عنوان التعميم / التوجيه:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الالتزام الصارم بتسجيل الخطط الصباحية..."
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35] font-medium"
                />
              </div>

              <div>
                <label className="block text-[#0c3e35] font-bold mb-1.5">نص التوجيه:</label>
                <textarea
                  required
                  rows={4}
                  placeholder="اكتب تفاصيل التوجيه الموجه لكافة مدراء المديريات..."
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                  className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35] font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingAnnouncement}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingAnnouncement ? 'جاري النشر...' : 'نشر وتعميم فوراً'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Published Announcements & Readership List Modal */}
      {showAnnouncementsListModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
          onClick={() => setShowAnnouncementsListModal(false)}
        >
          <div
            className="w-full max-w-3xl bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    التعاميم الصادرة وسجل القراءة والاطلاع
                  </h3>
                  <p className="text-xs text-[#8daaa2]">
                    متابعة مدى اطلاع مدراء المديريات على التعاميم الرسمية الصادرة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAnnouncementsListModal(false)}
                className="p-2 rounded-xl text-[#8daaa2] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {announcements.length === 0 ? (
                <div className="py-12 text-center text-[#5e736e] text-xs">
                  لا توجد تعاميم إدارية صادرة حتى الآن. يمكنك إصدار تعميم جديد من زر "إصدار تعميم جديد".
                </div>
              ) : (
                announcements.map((ann) => {
                  const percent = ann.readPercentage || 0;
                  const reads = ann.readCount || 0;
                  return (
                    <div
                      key={ann.id}
                      className="p-5 rounded-2xl bg-white border border-[#d2d1c9] hover:border-[#0c3e35] transition shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0eee6] pb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-[#0c3e35]">{ann.title}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f4f3ed] text-[#0c3e35] border border-[#d2d1c9]">
                            {ann.priority === 'URGENT' ? '🚨 عاجل' : '📌 عادي'}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#8daaa2]">
                          {new Date(ann.createdAt).toLocaleDateString('ar-SY', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-[#5e736e] leading-relaxed line-clamp-2">
                        {ann.content}
                      </p>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-3 flex-1 max-w-sm">
                          <div className="flex-1 bg-[#edece4] rounded-full h-2.5 overflow-hidden">
                            <div
                              className="bg-[#0c3e35] h-full rounded-full transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#0c3e35] shrink-0">
                            {percent}% ({reads} مديرية)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAnnouncement({
                              id: ann.id,
                              isAnnouncement: true,
                              type: 'announcement',
                              title: ann.title,
                              content: ann.content,
                              authorName: ann.author?.fullName || 'المدير العام للموانئ',
                              authorTitle: ann.author?.title || 'المدير العام',
                              priority: ann.priority,
                              createdAt: ann.createdAt,
                            });
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] text-white hover:bg-[#072923] text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                        >
                          <Eye className="w-4 h-4 text-[#d4af37]" />
                          <span>سجل المطّلعين والاطلاع</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-[#d2d1c9] bg-white flex justify-between items-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAnnouncementsListModal(false);
                  setShowAnnouncementModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] text-white text-xs font-bold hover:bg-[#072923] transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إصدار تعميم جديد</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAnnouncementsListModal(false)}
                className="px-4 py-2 rounded-xl bg-[#edece4] text-[#0c3e35] text-xs font-bold hover:bg-[#d2d1c9] transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Announcement Details Dialog */}
      <AnnouncementDetailsModal
        data={selectedAnnouncement}
        currentUser={currentUser}
        onClose={() => setSelectedAnnouncement(null)}
      />

      {/* Executive Tasks Management Modal */}
      <ExecutiveTasksModal
        isOpen={showTasksModal}
        onClose={() => {
          setShowTasksModal(false);
          loadTasksCount();
          loadOverview();
        }}
        currentUser={currentUser}
      />

    </div>
    </>
  );
};
