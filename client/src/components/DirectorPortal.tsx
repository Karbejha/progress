'use client';

import React, { useState, useEffect } from 'react';
import { User, DailyPlan, PlanTask, Priority, TaskStatus } from '../types';
import { api } from '../services/api';
import { DynamicIcon } from './Icons';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Plus,
  Trash2,
  Sparkles,
  Calendar,
  Layers,
  History,
  Star,
  Shield,
  Check,
  Megaphone,
  X,
} from 'lucide-react';

import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import { Announcement } from '../types';
import { getSocket } from '../lib/socket';
import { getReadAnnouncementIds, markAnnouncementAsRead } from '../lib/announcements';

interface DirectorPortalProps {
  currentUser: User;
}

export const DirectorPortal: React.FC<DirectorPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'PLAN' | 'TRACK' | 'SUMMARY' | 'HISTORY'>('PLAN');
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [history, setHistory] = useState<DailyPlan[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
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

  // Form states
  const [generalFocus, setGeneralFocus] = useState('');
  const [tasks, setTasks] = useState<
    { title: string; description: string; priority: Priority; estimatedHours: number }[]
  >([
    { title: '', description: '', priority: 'NORMAL', estimatedHours: 2.0 },
  ]);

  // Summary wizard states
  const [summaryText, setSummaryText] = useState('');
  const [achievements, setAchievements] = useState<string[]>(['']);
  const [challenges, setChallenges] = useState('');
  const [directorNotes, setDirectorNotes] = useState('');
  const [urgentFlag, setUrgentFlag] = useState(false);
  const [tomorrowPlanPreview, setTomorrowPlanPreview] = useState('');

  const todayFormatted = new Date().toLocaleDateString('ar-SY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    loadTodayData();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('feedback:sent', (payload: any) => {
      if (payload.directorateId === currentUser.directorateId) {
        showToast(`وصلك توجيه جديد وملاحظات من المدير العام!`);
        loadTodayData();
      }
    });

    socket.on('announcement:created', (payload: any) => {
      showToast(`تم نشر تعميم إداري عام جديد من المدير العام: "${payload.title}"`);
      api.getAnnouncements().then((res) => setAnnouncements(res)).catch(() => {});
    });

    return () => {
      socket.off('feedback:sent');
      socket.off('announcement:created');
    };
  }, [currentUser]);

  const loadTodayData = async () => {
    try {
      setLoading(true);
      const [currentPlan, anns] = await Promise.all([
        api.getMyTodayPlan(),
        api.getAnnouncements().catch(() => []),
      ]);
      setPlan(currentPlan);
      setAnnouncements(anns);

      if (currentPlan) {
        setGeneralFocus(currentPlan.generalFocus || '');
        if (currentPlan.tasks && currentPlan.tasks.length > 0) {
          setTasks(
            currentPlan.tasks.map((t) => ({
              title: t.title,
              description: t.description || '',
              priority: t.priority,
              estimatedHours: t.estimatedHours,
            }))
          );
        }
        if (currentPlan.dailySummary) {
          const s = currentPlan.dailySummary;
          setSummaryText(s.summaryText || '');
          setAchievements(s.achievements && s.achievements.length > 0 ? s.achievements : ['']);
          setChallenges(s.challenges || '');
          setDirectorNotes(s.directorNotes || '');
          setUrgentFlag(s.urgentFlag || false);
          setTomorrowPlanPreview(s.tomorrowPlanPreview || '');
        }
      }
    } catch (err) {
      console.error('Failed to load director plan', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const hist = await api.getDirectorHistory();
      setHistory(hist);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Plan actions
  const handleAddTask = () => {
    setTasks([...tasks, { title: '', description: '', priority: 'NORMAL', estimatedHours: 1.5 }]);
  };

  const handleRemoveTask = (index: number) => {
    setTasks(tasks.filter((_, idx) => idx !== index));
  };

  const handleTaskChange = (index: number, field: string, value: any) => {
    const updated = [...tasks];
    (updated[index] as any)[field] = value;
    setTasks(updated);
  };

  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const validTasks = tasks.filter((t) => t.title.trim().length > 0);
    if (validTasks.length === 0) {
      alert('يرجى إضافة مهمة واحدة على الأقل في الخطة اليومية');
      return;
    }

    try {
      setSaving(true);
      const res = await api.submitPlan({
        generalFocus,
        tasks: validTasks,
      });
      setPlan(res);
      showToast('تم اعتماد وإرسال الخطة الصباحية للمدير العام بنجاح!');
      setActiveTab('TRACK');
    } catch (err) {
      console.error('Failed to submit plan', err);
      alert('حدث خطأ أثناء حفظ الخطة');
    } finally {
      setSaving(false);
    }
  };

  // Live task update
  const handleUpdateTaskStatus = async (
    taskId: string,
    status: TaskStatus,
    completionPercentage: number,
    completionNote?: string
  ) => {
    try {
      await api.updateTaskStatus(taskId, {
        status,
        completionPercentage,
        completionNote,
      });
      loadTodayData();
      showToast('تم تحديث حالة المهمة فوراً');
    } catch (err) {
      console.error('Failed to update task', err);
    }
  };

  // Summary submission
  const handleSubmitSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summaryText.trim()) {
      alert('يرجى تدوين ملخص ما تم إنجازه اليوم');
      return;
    }

    try {
      setSaving(true);
      const cleanAchievements = achievements.filter((a) => a.trim().length > 0);
      await api.submitDailySummary({
        summaryText,
        achievements: cleanAchievements,
        challenges,
        directorNotes,
        urgentFlag,
        tomorrowPlanPreview,
      });
      loadTodayData();
      showToast('تم إرسال ملخص الإنجاز المسائي للمدير العام بنجاح!');
    } catch (err) {
      console.error('Failed to submit summary', err);
      alert('حدث خطأ أثناء إرسال ملخص الإنجاز');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-7 animate-fadeIn pb-16">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-[#0c3e35] text-white px-5 py-3 rounded-2xl shadow-2xl animate-bounce border border-[#d4af37]">
          <CheckCircle2 className="w-5 h-5 text-[#d4af37]" />
          <span className="font-bold text-sm">{successToast}</span>
        </div>
      )}

      {/* Directorate Banner */}
      <div className="p-7 rounded-[28px] bg-[#05261e] border border-[#0c3e35] shadow-brand-card relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-white">
        <div className="relative z-10 flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] shadow-md shrink-0">
            <DynamicIcon name={currentUser.directorate?.icon} className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                {currentUser.directorate?.name || 'المديرية المعنية'}
              </span>
              <span className="text-xs text-[#8daaa2] font-medium">
                • {todayFormatted}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white mt-1">
              بوابة إعداد الخطة وتوثيق الإنجاز اليومي
            </h2>
            <p className="text-xs text-[#8daaa2] mt-0.5">
              المدير المسؤول: <strong className="text-white">{currentUser.fullName}</strong> ({currentUser.title})
            </p>
          </div>
        </div>

        {/* Quick status pill */}
        <div className="relative z-10 bg-[#0c3e35] border border-[#d2d1c9]/20 p-4 rounded-2xl text-xs space-y-1.5 min-w-[220px]">
          <div className="flex items-center justify-between text-[#8daaa2]">
            <span>حالة خطة اليوم:</span>
            {plan ? (
              <span className="text-[#d4af37] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تم إرسال الخطة
              </span>
            ) : (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                بانتظار الإعداد
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[#8daaa2]">
            <span>ملخص الإنجاز:</span>
            {plan?.dailySummary ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                منجز ({plan.dailySummary.overallCompletionRate}%)
              </span>
            ) : (
              <span className="text-slate-400">
                بانتظار نهاية الدوام
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Official General Announcements Bar (Only if unread) */}
      {(() => {
        const unreadAnnouncements = announcements.filter(
          (a) => !readAnnouncementIds.includes(a.id)
        );

        if (unreadAnnouncements.length === 0) return null;

        const currentAnn = unreadAnnouncements[0];

        return (
          <div
            onClick={() => {
              markAnnouncementAsRead(currentUser.id, currentAnn.id);
              setSelectedAnnouncement({
                id: currentAnn.id,
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
              <div className="w-9 h-9 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
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
                انقر لقراءة نص التعميم
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

      {/* Directives from General Director */}
      {plan?.feedbacks && plan.feedbacks.length > 0 && (
        <div className="p-5 rounded-[22px] bg-[#05261e] border-2 border-[#d4af37] text-white space-y-2 shadow-md">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#d4af37] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#d4af37]" />
              توجيه وملاحظات واردة من المدير العام على خطة/إنجاز المديرية:
            </h4>
            <span className="text-[11px] text-[#8daaa2]">
              {new Date(plan.feedbacks[0].createdAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-[#edece4] leading-relaxed font-medium">
            {plan.feedbacks[0].feedbackText}
          </p>
          {plan.feedbacks[0].rating && (
            <div className="flex items-center gap-1 text-[#d4af37] pt-1">
              <span className="text-[11px] text-[#8daaa2] ml-1">تقييم الإدارة:</span>
              {Array.from({ length: plan.feedbacks[0].rating }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-[#d4af37] text-[#d4af37]" />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-3 border-b border-[#d2d1c9] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('PLAN')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'PLAN'
              ? 'bg-[#0c3e35] text-white shadow-md'
              : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>1. الخطة الصباحية (بداية الدوام)</span>
        </button>

        <button
          onClick={() => setActiveTab('TRACK')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'TRACK'
              ? 'bg-[#0c3e35] text-white shadow-md'
              : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>2. متابعة المهام (خلال الدوام)</span>
          {plan?.tasks && (
            <span className="px-2 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-extrabold">
              {plan.tasks.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SUMMARY')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'SUMMARY'
              ? 'bg-[#0c3e35] text-white shadow-md'
              : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>3. ملخص الإنجاز (نهاية الدوام)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('HISTORY');
            loadHistory();
          }}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'HISTORY'
              ? 'bg-[#0c3e35] text-white shadow-md'
              : 'bg-white text-[#5e736e] hover:text-[#0c3e35] border border-[#d2d1c9]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجل إنجازات المديرية</span>
        </button>
      </div>

      {/* Tab 1: Morning Plan Builder */}
      {activeTab === 'PLAN' && (
        <form onSubmit={handleSubmitPlan} className="bg-[#edece4] p-7 rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-6">
          <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0c3e35] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0c3e35]" />
                إعداد الخطة اليومية لمديرية {currentUser.directorate?.name}
              </h3>
              <p className="text-xs text-[#5e736e] mt-1 font-medium">
                سجل المهام الرئيسية المستهدفة اليوم ليتمكن المدير العام من متابعتها ودعمكم.
              </p>
            </div>
            {plan && (
              <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                الخطة معتمدة
              </span>
            )}
          </div>

          {/* General Focus */}
          <div>
            <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
              التركيز والهدف العام لخطة اليوم (اختياري وموجز):
            </label>
            <input
              type="text"
              placeholder="مثال: استكمال معاينة سفن الرصيف 4 وإصدار تراخيص الصيد الموسمية..."
              value={generalFocus}
              onChange={(e) => setGeneralFocus(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
            />
          </div>

          {/* Dynamic Tasks List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#0c3e35] flex items-center gap-1.5">
                <span>المهام المجدولة لتنفيذها اليوم:</span>
              </label>
              <button
                type="button"
                onClick={handleAddTask}
                className="flex items-center gap-1 text-xs font-bold px-3.5 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#0c3e35] hover:text-white transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مهمة جديدة</span>
              </button>
            </div>

            <div className="space-y-3">
              {tasks.map((task, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#0c3e35] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="عنوان المهمة (مثلاً: تدقيق معاملات تسجيل زوارق النزهة)..."
                      value={task.title}
                      onChange={(e) => handleTaskChange(idx, 'title', e.target.value)}
                      className="flex-1 p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] font-medium"
                    />
                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTask(idx)}
                        className="p-2 rounded-xl text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="حذف المهمة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="تفاصيل إضافية أو النتيجة المتوقعة (اختياري)..."
                        value={task.description}
                        onChange={(e) => handleTaskChange(idx, 'description', e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={task.priority}
                        onChange={(e) => handleTaskChange(idx, 'priority', e.target.value as Priority)}
                        className="flex-1 p-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs focus:outline-none focus:border-[#0c3e35] cursor-pointer font-bold"
                      >
                        <option value="URGENT">عاجل جداً</option>
                        <option value="HIGH">أولوية مرتفعة</option>
                        <option value="NORMAL">أولوية عادية</option>
                        <option value="LOW">منخفضة</option>
                      </select>

                      <div className="flex items-center gap-1 bg-[#f4f3ed] border border-[#d2d1c9] px-2.5 py-2 rounded-xl text-xs text-[#0c3e35] shrink-0 font-bold">
                        <input
                          type="number"
                          min="0.5"
                          max="12"
                          step="0.5"
                          value={task.estimatedHours}
                          onChange={(e) => handleTaskChange(idx, 'estimatedHours', parseFloat(e.target.value))}
                          className="w-10 bg-transparent text-center text-[#0c3e35] focus:outline-none font-bold"
                        />
                        <span>ساعة</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#d2d1c9]">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ والإرسال...' : 'اعتماد وإرسال الخطة الصباحية للمدير العام'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Live Tracking During the Day */}
      {activeTab === 'TRACK' && (
        <div className="bg-[#edece4] p-7 rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-6">
          <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0c3e35] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0c3e35]" />
                تحديث ومتابعة المهام خلال ساعات الدوام
              </h3>
              <p className="text-xs text-[#5e736e] mt-1 font-medium">
                انقر على حالة أي مهمة أو حدد نسبة إنجازها لتنعكس مباشرة في لوحة المدير العام.
              </p>
            </div>
          </div>

          {plan?.tasks && plan.tasks.length > 0 ? (
            <div className="space-y-4">
              {plan.tasks.map((task, idx) => (
                <div
                  key={task.id}
                  className="p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-[#0c3e35] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-[#0c3e35] leading-tight">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-[#5e736e] mt-1">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[#0c3e35] font-bold bg-[#edece4] px-2.5 py-1 rounded-lg border border-[#d2d1c9]">
                      {task.estimatedHours} س
                    </span>
                  </div>

                  {/* Status Toggle Buttons */}
                  <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-[#e5e4dc]">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-[#0c3e35]">الحالة:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(task.id, 'PENDING', 0)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          task.status === 'PENDING'
                            ? 'bg-[#0c3e35] text-white shadow-xs'
                            : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
                        }`}
                      >
                        قيد الانتظار
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(task.id, 'IN_PROGRESS', 50)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          task.status === 'IN_PROGRESS'
                            ? 'bg-[#0c3e35] text-white shadow-xs'
                            : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
                        }`}
                      >
                        قيد التنفيذ (50%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(task.id, 'COMPLETED', 100)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          task.status === 'COMPLETED'
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
                        }`}
                      >
                        تم الإنجاز (100%)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskStatus(task.id, 'DELAYED', task.completionPercentage)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          task.status === 'DELAYED'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
                        }`}
                      >
                        مؤجلة
                      </button>
                    </div>

                    {/* Progress Slider */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#0c3e35] font-extrabold">{task.completionPercentage}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={task.completionPercentage}
                        onChange={(e) =>
                          handleUpdateTaskStatus(
                            task.id,
                            parseInt(e.target.value) === 100 ? 'COMPLETED' : parseInt(e.target.value) > 0 ? 'IN_PROGRESS' : 'PENDING',
                            parseInt(e.target.value)
                          )
                        }
                        className="w-28 accent-[#0c3e35] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#d2d1c9]">
                <span className="text-xs text-[#0c3e35] font-bold">
                  هل أنهيتم أعمال اليوم؟ انتقل الآن لملخص الإنجاز المسائي.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('SUMMARY')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <span>ملخص الإنجاز المسائي</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[#5e736e] text-xs">
              لم يتم إنشاء خطة صباحية لليوم بعد. يرجى التوجه لتبويب الخطة أولاً.
            </div>
          )}
        </div>
      )}

      {/* Tab 3: End-of-Day Summary Wizard */}
      {activeTab === 'SUMMARY' && (
        <form onSubmit={handleSubmitSummary} className="bg-[#edece4] p-7 rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-6">
          <div className="flex items-center justify-between border-b border-[#d2d1c9] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#0c3e35] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#d4af37]" />
                ملخص إنجاز نهاية الدوام الرسمي
              </h3>
              <p className="text-xs text-[#5e736e] mt-1 font-medium">
                وثّق ما تم تحقيقه اليوم، واذكر المعوقات وأي طلبات تدخل عاجلة من الإدارة العليا.
              </p>
            </div>
          </div>

          {/* Main Summary Field */}
          <div>
            <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
              ملخص شامل للأعمال المنفذة اليوم (مطلوب):
            </label>
            <textarea
              required
              rows={3}
              placeholder="اكتب ملخصاً موجزاً عما حققته المديرية اليوم (مثال: تم إنجاز معاينات الميناء بكفاءة وإصدار 10 دفاتر بحارة)..."
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
            />
          </div>

          {/* Key Achievements Bullet points */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#0c3e35]">
                أبرز الإنجازات المحققة (نقاط سريعة):
              </label>
              <button
                type="button"
                onClick={() => setAchievements([...achievements, ''])}
                className="text-xs text-[#0c3e35] hover:text-[#072923] font-bold cursor-pointer"
              >
                + إضافة نقطة إنجاز
              </button>
            </div>

            {achievements.map((ach, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-[#0c3e35] font-bold text-xs">•</span>
                <input
                  type="text"
                  placeholder="مثال: إنهاء التدقيق الفني للسفينة أوغاريت 2..."
                  value={ach}
                  onChange={(e) => {
                    const upd = [...achievements];
                    upd[idx] = e.target.value;
                    setAchievements(upd);
                  }}
                  className="flex-1 p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] text-xs placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] font-medium"
                />
              </div>
            ))}
          </div>

          {/* Challenges & Bottlenecks */}
          <div>
            <label className="block text-xs font-bold text-[#0c3e35] mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              المعوقات أو التحديات التي واجهت عمل المديرية اليوم (إن وجدت):
            </label>
            <textarea
              rows={2}
              placeholder="مثال: عطل كهربائي في إحدى الرافعات، أو نقص في نماذج المعاملات..."
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              className="w-full p-3 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] transition font-medium"
            />
          </div>

          {/* Urgent Flag & Requests for General Director */}
          <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgentFlag}
                  onChange={(e) => setUrgentFlag(e.target.checked)}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-red-800">
                  تحديد كتنبيه عاجل يتطلب تدخل وتوجيه المدير العام
                </span>
              </label>
            </div>

            <div>
              <input
                type="text"
                placeholder="ملاحظات أو احتياجات عاجلة تتطلب قرار المدير العام مباشرة..."
                value={directorNotes}
                onChange={(e) => setDirectorNotes(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-red-200 text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-red-400 font-medium"
              />
            </div>
          </div>

          {/* Tomorrow's Plan Preview */}
          <div>
            <label className="block text-xs font-bold text-[#0c3e35] mb-1.5">
              نظرة أولية لأبرز مهام الغد:
            </label>
            <input
              type="text"
              placeholder="مثال: الانتقال للمعاينة الميدانية في حوض طرطوس واستكمال التقرير..."
              value={tomorrowPlanPreview}
              onChange={(e) => setTomorrowPlanPreview(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] text-xs focus:outline-none focus:border-[#0c3e35] font-medium"
            />
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-[#d2d1c9]">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{saving ? 'جاري الإرسال...' : 'إرسال ملخص الإنجاز المسائي للمدير العام'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 4: History */}
      {activeTab === 'HISTORY' && (
        <div className="bg-[#edece4] p-7 rounded-[28px] border border-[#d2d1c9] shadow-brand-card space-y-6">
          <div className="border-b border-[#d2d1c9] pb-4">
            <h3 className="text-base font-bold text-[#0c3e35] flex items-center gap-2">
              <History className="w-5 h-5 text-[#0c3e35]" />
              سجل الخطط والإنجازات السابقة لمديرية {currentUser.directorate?.name}
            </h3>
            <p className="text-xs text-[#5e736e] mt-1 font-medium">
              أرشيف الأيام السابقة خاص بمديريتكم حصراً.
            </p>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-12 text-[#5e736e] text-xs">
              لا توجد تقارير سابقة مسجلة حتى الآن
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="p-5 rounded-2xl bg-white border border-[#d2d1c9] space-y-3 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0c3e35] flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#0c3e35]" />
                      {new Date(h.planDate).toLocaleDateString('ar-SY', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
                      نسبة الإنجاز: {h.dailySummary?.overallCompletionRate || 0}%
                    </span>
                  </div>

                  {h.generalFocus && (
                    <p className="text-xs text-[#0c3e35]">
                      <strong>التركيز:</strong> {h.generalFocus}
                    </p>
                  )}

                  {h.dailySummary?.summaryText && (
                    <div className="p-3 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-xs text-[#0c3e35]">
                      <strong>ملخص الإنجاز:</strong> {h.dailySummary.summaryText}
                    </div>
                  )}

                  {h.feedbacks && h.feedbacks.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#05261e] text-white text-xs border border-[#d4af37]/40">
                      <strong className="text-[#d4af37]">توجيه المدير العام:</strong> {h.feedbacks[0].feedbackText}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Announcement Details Dialog */}
      <AnnouncementDetailsModal
        data={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />

    </div>
  );
};
