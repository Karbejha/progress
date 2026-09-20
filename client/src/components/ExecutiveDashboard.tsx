'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, ExecutiveOverviewResponse, DirectorateOverviewItem, Announcement } from '../types';
import { api } from '../services/api';
import { DirectorateCard } from './DirectorateCard';
import { OrgHierarchyChart } from './OrgHierarchyChart';
import { DirectorateDetailModal } from './DirectorateDetailModal';
import { getDirectorateStatus, DirectorateSemanticStatus } from '../lib/directorateStatus';
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
  ListTodo,
  RotateCcw,
} from 'lucide-react';

import { UsersManagementModal } from './UsersManagementModal';
import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import { ExecutiveTasksModal } from './ExecutiveTasksModal';
import { CustomDatePicker } from './CustomDatePicker';
import { getSocket } from '../lib/socket';
import { getReadAnnouncementIds, markAnnouncementAsRead, syncReadNotificationsFromServer } from '../lib/announcements';

interface ExecutiveDashboardProps {
  currentUser: User;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ currentUser }) => {
  const isObserver = currentUser.role === 'OBSERVER';
  const [data, setData] = useState<ExecutiveOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [viewMode, setViewMode] = useState<'GRID' | 'CHART' | 'URGENT'>('GRID');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DirectorateSemanticStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDirectorate, setSelectedDirectorate] = useState<DirectorateOverviewItem | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showAnnouncementsListModal, setShowAnnouncementsListModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksModalSearch, setTasksModalSearch] = useState<string>('');
  const [tasksModalDirId, setTasksModalDirId] = useState<string | undefined>(undefined);
  const [activeTasksCount, setActiveTasksCount] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', priority: 'NORMAL' });
  const [submittingAnnouncement, setSubmittingAnnouncement] = useState(false);
  const [liveToast, setLiveToast] = useState<{ title: string; desc: string } | null>(null);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);

  useEffect(() => {
    const handleOpenTasksModal = (e: any) => {
      const detail = e.detail || {};
      setTasksModalSearch(detail.searchQuery || detail.taskTitle || '');
      setTasksModalDirId(detail.directorateId);
      setShowTasksModal(true);
    };

    const handleOpenDirectorateDetail = (e: any) => {
      const dirId = e.detail?.directorateId;
      if (!dirId) return;

      const found = data?.directorates?.find((d) => d.directorateId === dirId);
      if (found) {
        setSelectedDirectorate(found);
      } else {
        api.getExecutiveOverview(selectedDate).then((res) => {
          setData(res);
          const target = res.directorates?.find((d) => d.directorateId === dirId);
          if (target) setSelectedDirectorate(target);
        }).catch(() => {});
      }
    };

    window.addEventListener('ports:open_tasks_modal', handleOpenTasksModal);
    window.addEventListener('ports:open_directorate_detail', handleOpenDirectorateDetail);

    return () => {
      window.removeEventListener('ports:open_tasks_modal', handleOpenTasksModal);
      window.removeEventListener('ports:open_directorate_detail', handleOpenDirectorateDetail);
    };
  }, [data, selectedDate]);

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

    const handlePlanSubmitted = (payload: any) => {
      triggerLiveAlert('خطة جديدة مرفوعة لحظياً', `قام ${payload.directorName} (${payload.directorateName}) برفع الخطة الصباحية.`);
    };

    const handleTaskUpdated = (payload: any) => {
      triggerLiveAlert('تحديث إنجاز مهمة لحظياً', `قامت ${payload.directorateName} بتحديث "${payload.taskTitle}" إلى (${payload.completionPercentage}%).`);
    };

    const handleSummarySubmitted = (payload: any) => {
      triggerLiveAlert('تسليم ملخص إنجاز لحظياً', `سلّمت ${payload.directorateName} ملخص نهاية الدوام بنسبة ${payload.overallCompletionRate}%.`);
    };

    const handleAnnouncementCreated = () => {
      loadAnnouncements();
    };

    const handleExecutiveTaskCreated = (payload: any) => {
      triggerLiveAlert('تكليف جديد من المدير العام', `تم إسناد تكليف لـ (${payload.directorateName}): "${payload.task?.title || ''}"`);
      loadTasksCount();
    };

    const handleExecutiveTaskUpdated = (payload: any) => {
      triggerLiveAlert('تحديث إنجاز تكليف المدير العام', `قامت (${payload.directorateName}) بتحديث إنجاز التكليف "${payload.task?.title}" إلى (${payload.task?.completionPercentage}%).`);
      loadTasksCount();
    };

    const handleExecutiveTaskDeleted = () => {
      loadOverview();
      loadTasksCount();
    };

    socket.on('plan:submitted', handlePlanSubmitted);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('summary:submitted', handleSummarySubmitted);
    socket.on('announcement:created', handleAnnouncementCreated);
    socket.on('executive-task:created', handleExecutiveTaskCreated);
    socket.on('executive-task:updated', handleExecutiveTaskUpdated);
    socket.on('executive-task:deleted', handleExecutiveTaskDeleted);

    return () => {
      socket.off('plan:submitted', handlePlanSubmitted);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('summary:submitted', handleSummarySubmitted);
      socket.off('announcement:created', handleAnnouncementCreated);
      socket.off('executive-task:created', handleExecutiveTaskCreated);
      socket.off('executive-task:updated', handleExecutiveTaskUpdated);
      socket.off('executive-task:deleted', handleExecutiveTaskDeleted);
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
      if (res && res.length > 0) {
        const readFromAnns = res.filter((a: any) => a.isReadByMe).map((a: any) => a.id);
        if (readFromAnns.length > 0) {
          syncReadNotificationsFromServer(currentUser.id, readFromAnns);
          setReadAnnouncementIds(getReadAnnouncementIds(currentUser.id));
        }
      }
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

  // Category directorates counts for the tabs
  const categoryCounts = useMemo(() => {
    const list = data?.directorates || [];
    return {
      ALL: list.length,
      OPERATIONAL: list.filter((d) => d.category === 'OPERATIONAL').length,
      ADMINISTRATIVE: list.filter((d) => d.category === 'ADMINISTRATIVE').length,
      TECHNICAL: list.filter((d) => d.category === 'TECHNICAL').length,
      AUDIT_LEGAL: list.filter((d) => d.category === 'AUDIT_LEGAL').length,
      LOGISTICS: list.filter((d) => d.category === 'LOGISTICS').length,
      EXECUTIVE_OFFICE: list.filter((d) => d.category === 'EXECUTIVE_OFFICE').length,
    };
  }, [data?.directorates]);

  // Semantic status counts (scoped to current category if selected, otherwise all)
  const statusCounts = useMemo(() => {
    const list = data?.directorates || [];
    const scopedList = activeCategory === 'ALL'
      ? list
      : list.filter((d) => d.category === activeCategory);

    return {
      COMPLETED: scopedList.filter((d) => getDirectorateStatus(d) === 'COMPLETED').length,
      IN_PROGRESS: scopedList.filter((d) => getDirectorateStatus(d) === 'IN_PROGRESS').length,
      PENDING: scopedList.filter((d) => getDirectorateStatus(d) === 'PENDING').length,
      URGENT: scopedList.filter((d) => getDirectorateStatus(d) === 'URGENT').length,
      total: scopedList.length,
    };
  }, [data?.directorates, activeCategory]);

  const filteredDirectorates = useMemo(() => {
    return (data?.directorates || []).filter((dir) => {
      // 1. Search Query
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const matchesSearch =
          dir.directorateName.toLowerCase().includes(query) ||
          (dir.director?.fullName && dir.director.fullName.toLowerCase().includes(query)) ||
          (dir.generalFocus && dir.generalFocus.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // 2. Urgent / Obstacles View Mode
      if (viewMode === 'URGENT') {
        return dir.urgentFlag || (dir.challenges && dir.challenges.length > 0);
      }

      // 3. Sector / Category Filter
      if (activeCategory !== 'ALL' && dir.category !== activeCategory) {
        return false;
      }

      // 4. Status Filter
      if (statusFilter !== 'ALL') {
        const dirStatus = getDirectorateStatus(dir);
        if (dirStatus !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [data?.directorates, searchQuery, viewMode, activeCategory, statusFilter]);

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
            {isObserver ? (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 flex items-center gap-1.5 shadow-xs">
                <Eye className="w-3.5 h-3.5 text-[#d4af37]" />
                منظومة المراقبة المركزية (اطلاع ومتابعة)
              </span>
            ) : (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 flex items-center gap-1.5 shadow-xs">
                <Shield className="w-3.5 h-3.5" />
                لوحة الإشراف المركزي
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {isObserver ? 'مراقبة تقارير ومهام المديريات' : 'متابعة إنجاز المديريات'}
          </h2>
          <p className="text-xs sm:text-sm text-[#8daaa2] font-medium">
            {isObserver
              ? 'اطلاع ومراقبة شاملة ومباشرة للخطط اليومية ونسب الإنجاز دون تعديل'
              : 'متابعة لحظية ومباشرة للخطط اليومية ونسب التنفيذ'}
          </p>
        </div>

        {/* Date Selector & Print Report Button */}
        <div className="relative z-10 flex items-center gap-3 flex-wrap">
          <CustomDatePicker
            value={selectedDate}
            onChange={(newDate) => setSelectedDate(newDate)}
          />

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('ports:navigate_view', { detail: { view: 'TODOS' } }))}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
            title="فتح أجندة ومفكرة المهام الخاصة"
          >
            <ListTodo className="w-4 h-4 text-[#d4af37]" />
            <span>مفكرتي الخاصة (TO-DO)</span>
          </button>

          <button
            onClick={() => setShowTasksModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer relative"
          >
            <Layers className="w-4 h-4 text-[#d4af37]" />
            <span>التكليفات والمهام المباشرة</span>
            {activeTasksCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#d4af37] text-[#031814] text-[11px] font-bold leading-none flex items-center justify-center shadow-xs tabular-nums">
                {activeTasksCount}
              </span>
            )}
          </button>

          {!isObserver && (
            <button
              onClick={() => setShowUsersModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>إدارة الحسابات</span>
            </button>
          )}

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

          {!isObserver && (
            <button
              onClick={() => setShowAnnouncementModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#d4af37]" />
              <span>إصدار تعميم جديد</span>
            </button>
          )}
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
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
          />
          <Search className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-3 text-[#8daaa2] hover:text-[#0c3e35] transition cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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

      {/* Category Tabs & Status Legend Bar (Active in Grid mode) */}
      {viewMode === 'GRID' && (
        <div className="space-y-2.5">
          {/* Main Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setActiveCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'ALL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              كافة المديريات ({categoryCounts.ALL})
            </button>
            <button
              onClick={() => setActiveCategory('OPERATIONAL')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'OPERATIONAL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              التشغيلية والبحرية ({categoryCounts.OPERATIONAL})
            </button>
            <button
              onClick={() => setActiveCategory('ADMINISTRATIVE')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'ADMINISTRATIVE'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              الإدارية والتنظيمية ({categoryCounts.ADMINISTRATIVE})
            </button>
            <button
              onClick={() => setActiveCategory('TECHNICAL')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'TECHNICAL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              الفنية والتقنية ({categoryCounts.TECHNICAL})
            </button>
            <button
              onClick={() => setActiveCategory('AUDIT_LEGAL')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'AUDIT_LEGAL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              الرقابة والشؤون القانونية ({categoryCounts.AUDIT_LEGAL})
            </button>
            <button
              onClick={() => setActiveCategory('LOGISTICS')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'LOGISTICS'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              الدعم والآليات ({categoryCounts.LOGISTICS})
            </button>
            <button
              onClick={() => setActiveCategory('EXECUTIVE_OFFICE')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                activeCategory === 'EXECUTIVE_OFFICE'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
              }`}
            >
              المكاتب التنفيذية ({categoryCounts.EXECUTIVE_OFFICE})
            </button>
          </div>

          {/* Status Quick Filter & Color Legend */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-[#edece4]/70 p-2.5 rounded-xl border border-[#d2d1c9]">
            <div className="flex items-center gap-2 font-bold text-[#0c3e35] text-xs">
              <span className="text-[#5e736e]">دلالات ألوان وتصفية البطاقات:</span>
              {(statusFilter !== 'ALL' || activeCategory !== 'ALL' || searchQuery.trim() !== '') && (
                <button
                  onClick={() => {
                    setActiveCategory('ALL');
                    setStatusFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#5e736e] hover:text-red-700 bg-white px-2 py-0.5 rounded-md border border-[#d2d1c9] transition cursor-pointer"
                  title="إلغاء كافة الفلاتر والبحث"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إلغاء التصفية</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] font-medium">
              {/* Completed Status */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-400/30'
                    : 'bg-emerald-50/90 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                }`}
                title={statusFilter === 'COMPLETED' ? 'انقر لإلغاء التصفية' : 'تصفية حسب المديريات التي أنجزت ملخصها اليومي'}
              >
                <span className={`w-2 h-2 rounded-full ${statusFilter === 'COMPLETED' ? 'bg-white' : 'bg-emerald-600'}`}></span>
                <span>ملخص منجز / مكتملة</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'COMPLETED' ? 'bg-white/20 text-white' : 'bg-emerald-200/70 text-emerald-900'
                }`}>
                  {statusCounts.COMPLETED}
                </span>
              </button>

              {/* In Progress Status */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-[#0c3e35] text-white border-[#0c3e35] shadow-xs ring-2 ring-[#0c3e35]/30'
                    : 'bg-white border-[#0c3e35]/25 text-[#0c3e35] hover:bg-[#0c3e35]/5'
                }`}
                title={statusFilter === 'IN_PROGRESS' ? 'انقر لإلغاء التصفية' : 'تصفية حسب المديريات قيد العمل ولديها خطة أو تكليفات جارية'}
              >
                <span className={`w-2 h-2 rounded-full ${statusFilter === 'IN_PROGRESS' ? 'bg-[#d4af37]' : 'bg-[#0c3e35]'}`}></span>
                <span>قيد العمل والمتابعة</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'IN_PROGRESS' ? 'bg-white/20 text-white' : 'bg-[#0c3e35]/10 text-[#0c3e35]'
                }`}>
                  {statusCounts.IN_PROGRESS}
                </span>
              </button>

              {/* Pending Status */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-700 text-white border-amber-700 shadow-xs ring-2 ring-amber-400/30'
                    : 'bg-amber-50/90 border-dashed border-amber-300 text-amber-800 hover:bg-amber-100'
                }`}
                title={statusFilter === 'PENDING' ? 'انقر لإلغاء التصفية' : 'تصفية حسب المديريات التي لم تسجل خطة صباحية بعد'}
              >
                <span className={`w-2 h-2 rounded-full ${statusFilter === 'PENDING' ? 'bg-white' : 'bg-amber-500'}`}></span>
                <span>بانتظار الخطة الصباحية</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'PENDING' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'
                }`}>
                  {statusCounts.PENDING}
                </span>
              </button>

              {/* Urgent Status */}
              <button
                onClick={() => setStatusFilter(statusFilter === 'URGENT' ? 'ALL' : 'URGENT')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                  statusFilter === 'URGENT'
                    ? 'bg-rose-700 text-white border-rose-700 shadow-xs ring-2 ring-rose-400/30'
                    : 'bg-rose-50/90 border-rose-200 text-rose-800 hover:bg-rose-100'
                }`}
                title={statusFilter === 'URGENT' ? 'انقر لإلغاء التصفية' : 'تصفية حسب المديريات التي لديها تنبيه عاجل أو معوقات'}
              >
                <span className={`w-2 h-2 rounded-full ${statusFilter === 'URGENT' ? 'bg-white' : 'bg-red-500 animate-ping'}`}></span>
                <span>تنبيه عاجل</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  statusFilter === 'URGENT' ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'
                }`}>
                  {statusCounts.URGENT}
                </span>
              </button>
            </div>
          </div>

          {/* Active Filters Summary Strip */}
          {(activeCategory !== 'ALL' || statusFilter !== 'ALL' || searchQuery.trim() !== '') && (
            <div className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2 rounded-xl bg-[#edece4] border border-[#d2d1c9] text-xs animate-fadeIn">
              <div className="flex items-center gap-2 flex-wrap text-[#0c3e35]">
                <span className="font-bold">التصفية النشطة:</span>
                <span className="text-[#5e736e] font-medium">
                  عرض <strong className="text-[#0c3e35] font-extrabold">{filteredDirectorates.length}</strong> من أصل {categoryCounts.ALL} مديرية
                </span>
                {activeCategory !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#d2d1c9] text-[11px] font-bold text-[#0c3e35] shadow-2xs">
                    القطاع: {
                      activeCategory === 'OPERATIONAL' ? 'التشغيلية والبحرية' :
                      activeCategory === 'ADMINISTRATIVE' ? 'الإدارية والتنظيمية' :
                      activeCategory === 'TECHNICAL' ? 'الفنية والتقنية' :
                      activeCategory === 'AUDIT_LEGAL' ? 'الرقابة والشؤون القانونية' :
                      activeCategory === 'LOGISTICS' ? 'الدعم والآليات' :
                      activeCategory === 'EXECUTIVE_OFFICE' ? 'المكاتب التنفيذية' : activeCategory
                    }
                    <button onClick={() => setActiveCategory('ALL')} className="hover:text-red-700 cursor-pointer p-0.5" title="إلغاء تصفية القطاع"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {statusFilter !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#d2d1c9] text-[11px] font-bold text-[#0c3e35] shadow-2xs">
                    الحالة: {
                      statusFilter === 'COMPLETED' ? 'ملخص منجز / مكتملة' :
                      statusFilter === 'IN_PROGRESS' ? 'قيد العمل والمتابعة' :
                      statusFilter === 'PENDING' ? 'بانتظار الخطة الصباحية' :
                      statusFilter === 'URGENT' ? 'تنبيه عاجل' : statusFilter
                    }
                    <button onClick={() => setStatusFilter('ALL')} className="hover:text-red-700 cursor-pointer p-0.5" title="إلغاء تصفية الحالة"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {searchQuery.trim() !== '' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-[#d2d1c9] text-[11px] font-bold text-[#0c3e35] shadow-2xs">
                    البحث: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')} className="hover:text-red-700 cursor-pointer p-0.5" title="إلغاء البحث"><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>

              <button
                onClick={() => {
                  setActiveCategory('ALL');
                  setStatusFilter('ALL');
                  setSearchQuery('');
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-900 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-red-200 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إلغاء التصفية بالكامل</span>
              </button>
            </div>
          )}
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
        <div className="text-center py-16 text-[#5e736e] bg-white rounded-2xl border border-[#d2d1c9] p-6 shadow-xs">
          <AlertTriangle className="w-10 h-10 text-[#d4af37] mx-auto mb-3" />
          <p className="text-base font-bold text-[#0c3e35] mb-1">لا توجد مديريات مطابقة لمعايير البحث والتصفية المحددة</p>
          <p className="text-xs text-[#5e736e] mb-4">جرب تغيير القطاع المختار أو حالة البطاقات أو مسح كلمات البحث.</p>
          <button
            onClick={() => {
              setActiveCategory('ALL');
              setStatusFilter('ALL');
              setSearchQuery('');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] text-white hover:bg-[#072923] transition cursor-pointer shadow-xs active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط كافة الفلاتر وعرض الجميع</span>
          </button>
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
        currentUser={currentUser}
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
              {!isObserver && (
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
              )}
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
          setTasksModalSearch('');
          setTasksModalDirId(undefined);
          loadTasksCount();
          loadOverview();
        }}
        currentUser={currentUser}
        initialDirectorateId={tasksModalDirId}
        initialSearch={tasksModalSearch}
      />

    </div>
    </>
  );
};
