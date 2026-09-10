'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { AchievementsReportResponse, Priority } from '../../types';
import { api } from '../../services/api';
import {
  Printer,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Award,
  Layers,
  Sparkles,
  Filter,
  CheckCheck,
  AlertCircle,
  Building2,
  User as UserIcon,
  RefreshCw,
} from 'lucide-react';
import { initStatusBar } from '../../lib/statusBar';
import { CustomMonthPicker } from '../../components/CustomMonthPicker';
import { CustomDateRangePicker } from '../../components/CustomDateRangePicker';

function DirectorReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL query params
  const initialMonth = searchParams.get('month') || '';
  const initialStartDate = searchParams.get('startDate') || '';
  const initialEndDate = searchParams.get('endDate') || '';
  const initialDirectorateId = searchParams.get('directorateId') || '';
  const initialFilter = searchParams.get('filter') || 'COMPLETED_AND_NEARING';

  // Filters State
  const [periodMode, setPeriodMode] = useState<'MONTH' | 'CUSTOM'>(() => {
    return initialStartDate && initialEndDate ? 'CUSTOM' : 'MONTH';
  });

  const getCurrentMonthStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const getPreviousMonthStr = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || getCurrentMonthStr());
  const [customStartDate, setCustomStartDate] = useState<string>(initialStartDate || '');
  const [customEndDate, setCustomEndDate] = useState<string>(initialEndDate || '');
  const [statusFilter, setStatusFilter] = useState<'COMPLETED_AND_NEARING' | 'COMPLETED' | 'NEARING' | 'ALL'>(
    (initialFilter as any) || 'COMPLETED_AND_NEARING',
  );

  // Data State
  const [data, setData] = useState<AchievementsReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initStatusBar();
    loadReport();
  }, [selectedMonth, customStartDate, customEndDate, statusFilter, periodMode]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        statusFilter,
      };

      if (initialDirectorateId) {
        params.directorateId = initialDirectorateId;
      }

      if (periodMode === 'MONTH') {
        params.month = selectedMonth;
      } else {
        if (customStartDate && customEndDate) {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        } else {
          // fallback to current month if custom dates not fully chosen yet
          params.month = selectedMonth;
        }
      }

      const res = await api.getAchievementsReport(params);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load achievements report', err);
      setError(err?.message || 'تعذر تحميل بيانات التقرير، يرجى التأكد من تسجيل الدخول والمحاولة مجدداً');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      if (window.history.length > 1) {
        router.back();
      } else {
        window.close();
      }
    }
  };

  // Helper for priority badges
  const getPriorityLabel = (priority: Priority) => {
    switch (priority) {
      case 'URGENT':
        return 'طارئة جداً';
      case 'HIGH':
        return 'أولوية عالية';
      case 'NORMAL':
        return 'عادية';
      case 'LOW':
        return 'منخفضة';
      default:
        return 'عادية';
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f3ed] print:bg-white text-[#0c3e35] print:text-black p-3 sm:p-8 print:p-0 print:m-0 font-sans pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
      
      {/* Top Action Bar (hidden when printing) */}
      <div className="max-w-5xl mx-auto mb-6 no-print bg-[#05261e] p-4 sm:p-5 rounded-2xl border border-[#0c3e35] shadow-xl text-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] text-xs font-bold text-white transition cursor-pointer border border-[#d4af37]/30"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للوحة التحكم</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={loadReport}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-[#d4af37] transition cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={loading || !data}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-xs sm:text-sm font-extrabold shadow-lg transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير أو حفظ كـ PDF</span>
            </button>
          </div>
        </div>

        {/* Filters and Time Period Selector Bar */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Period Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[#d4af37] font-bold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>الفترة الزمنية:</span>
            </span>

            <button
              onClick={() => {
                setPeriodMode('MONTH');
                setSelectedMonth(getCurrentMonthStr());
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                periodMode === 'MONTH' && selectedMonth === getCurrentMonthStr()
                  ? 'bg-[#d4af37] text-[#05261e]'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              الشهر الحالي
            </button>

            <button
              onClick={() => {
                setPeriodMode('MONTH');
                setSelectedMonth(getPreviousMonthStr());
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                periodMode === 'MONTH' && selectedMonth === getPreviousMonthStr()
                  ? 'bg-[#d4af37] text-[#05261e]'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              الشهر السابق
            </button>

            {periodMode === 'MONTH' ? (
              <CustomMonthPicker
                value={selectedMonth}
                onChange={(m) => setSelectedMonth(m)}
              />
            ) : null}

            <button
              onClick={() => setPeriodMode(periodMode === 'CUSTOM' ? 'MONTH' : 'CUSTOM')}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer border ${
                periodMode === 'CUSTOM'
                  ? 'bg-[#d4af37] text-[#05261e] border-[#d4af37]'
                  : 'bg-white/10 text-white hover:bg-white/20 border-white/20'
              }`}
            >
              {periodMode === 'CUSTOM' ? 'إلغاء الفترة المخصصة' : 'فترة مخصصة (من - إلى)'}
            </button>
          </div>

          {/* Custom Date Range Component */}
          {periodMode === 'CUSTOM' && (
            <CustomDateRangePicker
              startDate={customStartDate}
              endDate={customEndDate}
              onChange={(start, end) => {
                setCustomStartDate(start);
                setCustomEndDate(end);
              }}
            />
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#d4af37] font-bold flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>عرض:</span>
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-white/15 text-white border border-white/20 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#d4af37] cursor-pointer"
            >
              <option value="COMPLETED_AND_NEARING" className="bg-[#05261e] text-white">المنجزة والمقتربة من الإنجاز (افتراضي)</option>
              <option value="COMPLETED" className="bg-[#05261e] text-white">المنجزة بالكامل فقط (100%)</option>
              <option value="NEARING" className="bg-[#05261e] text-white">المقتربة من الإنجاز (70% - 99%)</option>
              <option value="ALL" className="bg-[#05261e] text-white">كافة المهام بجميع الحالات</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto p-12 bg-white rounded-3xl border border-[#d2d1c9] text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#0c3e35] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-[#0c3e35]">جاري تجميع وتوليد تقرير الإنجازات الرسمي للطباعة...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="max-w-5xl mx-auto p-8 bg-red-50 rounded-3xl border border-red-200 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h3 className="text-base font-bold text-red-900">تعذر عرض التقرير</h3>
          <p className="text-xs text-red-700">{error}</p>
          <button
            onClick={loadReport}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Official Printable Document Container */}
      {!loading && data && (
        <div className="max-w-5xl mx-auto bg-white print:bg-white p-6 sm:p-10 print:p-0 rounded-[28px] print:rounded-none border border-[#d2d1c9] print:border-none shadow-brand-card print:shadow-none space-y-6 print:space-y-4 print:max-w-none print:w-full">
          
          {/* Official Letterhead Header */}
          <div className="border-b-2 border-[#0c3e35] print:border-black pb-4 print:pb-3 flex items-center justify-between">
            <div className="text-right space-y-0.5 text-xs sm:text-sm print:text-[10px] print:leading-tight font-bold text-[#0c3e35] print:text-black">
              <p>الجمهورية العربية السورية</p>
              <p>الهيئة العامة للمنافذ والجمارك</p>
              <p>المديرية العامة للموانئ</p>
              <p className="text-[12px] print:text-[10px] text-[#0c3e35] print:text-black font-extrabold">
                {data.directorate.name}
              </p>
            </div>

            <div className="text-center space-y-1 print:space-y-0.5">
              <div className="w-14 h-14 print:w-11 print:h-11 mx-auto flex items-center justify-center">
                <Image
                  src="/assets/Syrian_logo_icon_dark_green.svg"
                  alt="شعار الموانئ"
                  width={48}
                  height={48}
                  className="w-12 h-12 print:w-10 print:h-10 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/Syrian_logo_icon_black.svg';
                  }}
                />
              </div>
              <h1 className="text-base sm:text-lg print:text-[15px] font-black text-[#0c3e35] print:text-black tracking-tight">
                تقرير الإنجازات والمهام المنجزة والمقتربة من الإنجاز
              </h1>
              <p className="text-xs print:text-[10px] text-[#5e736e] print:text-gray-800 font-bold">
                {data.period.label}
              </p>
            </div>

            <div className="text-left space-y-0.5 text-xs print:text-[9.5px] print:leading-tight text-[#5e736e] print:text-black font-medium">
              <p>الرمز: م.ع.م / {data.directorate.code}</p>
              <p>تاريخ الاستخراج: {new Date().toLocaleDateString('ar-SY')}</p>
              <p>المدير المسؤول: <strong className="text-[#0c3e35] print:text-black">{data.director?.fullName || '-'}</strong></p>
              <p className="text-[10.5px] print:text-[8.5px] text-[#0c3e35] print:text-black font-bold">التصنيف: رسمي / إحصائي</p>
            </div>
          </div>

          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:gap-2 p-3.5 print:py-2 print:px-3 rounded-2xl print:rounded-lg bg-[#f4f3ed] print:bg-gray-100 border border-[#d2d1c9] print:border-gray-300 text-center text-xs">
            <div>
              <span className="text-[#5e736e] print:text-gray-700 block mb-0.5 font-semibold text-[11px] print:text-[9px]">
                معدل الإنجاز العام
              </span>
              <strong className="text-base sm:text-lg print:text-[14px] font-black text-[#0c3e35] print:text-black">
                {data.stats.averageCompletionRate}%
              </strong>
            </div>

            <div>
              <span className="text-[#5e736e] print:text-gray-700 block mb-0.5 font-semibold text-[11px] print:text-[9px]">
                المهام المنجزة كلياً (100%)
              </span>
              <strong className="text-base sm:text-lg print:text-[14px] font-black text-emerald-800 print:text-black">
                {data.stats.completedTasksCount} مهمة
              </strong>
            </div>

            <div>
              <span className="text-[#5e736e] print:text-gray-700 block mb-0.5 font-semibold text-[11px] print:text-[9px]">
                مهام مقتربة من الإنجاز (&gt;= 70%)
              </span>
              <strong className="text-base sm:text-lg print:text-[14px] font-black text-amber-700 print:text-black">
                {data.stats.nearingTasksCount} مهمة
              </strong>
            </div>

            <div>
              <span className="text-[#5e736e] print:text-gray-700 block mb-0.5 font-semibold text-[11px] print:text-[9px]">
                ساعات العمل الموثقة
              </span>
              <strong className="text-base sm:text-lg print:text-[14px] font-black text-[#0c3e35] print:text-black">
                {data.stats.totalHours} ساعة
              </strong>
            </div>
          </div>

          {/* Section: Key Achievements (الإنجازات والنتائج النوعية) */}
          {data.keyAchievements && data.keyAchievements.length > 0 && (
            <div className="space-y-2 print:space-y-1.5 print:break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#d2d1c9] print:border-gray-400 pb-1.5">
                <Award className="w-4 h-4 text-[#d4af37] print:text-black" />
                <h2 className="text-xs sm:text-sm print:text-[11px] font-bold text-[#0c3e35] print:text-black">
                  أبرز الإنجازات والنتائج النوعية المحققة للمديرية خلال الفترة ({data.keyAchievements.length}):
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 print:gap-1.5">
                {data.keyAchievements.map((ach, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2.5 print:p-1.5 rounded-xl print:rounded-md bg-emerald-50/70 print:bg-transparent border border-emerald-200/80 print:border-gray-300 text-xs print:text-[9.5px]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 print:text-black shrink-0 mt-0.5" />
                    <span className="text-[#0c3e35] print:text-black font-semibold leading-relaxed">{ach}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Fully Completed Tasks (المهام المنجزة بالكامل) */}
          {(statusFilter === 'COMPLETED_AND_NEARING' || statusFilter === 'COMPLETED' || statusFilter === 'ALL') && (
            <div className="space-y-2.5 print:space-y-1.5">
              <div className="flex items-center justify-between border-b-2 border-emerald-800 print:border-black pb-1.5">
                <h2 className="text-xs sm:text-sm print:text-[11.5px] font-bold text-emerald-900 print:text-black flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-emerald-700 print:text-black" />
                  <span>المهام المنجزة بالكامل (نسبة إنجاز 100%) - [{data.completedTasks.length} مهمة]:</span>
                </h2>
              </div>

              {data.completedTasks.length === 0 ? (
                <p className="text-xs print:text-[9px] text-gray-500 py-2 text-center bg-gray-50 rounded-xl">
                  لا توجد مهام مكتملة مسجلة في هذا النطاق الزمني
                </p>
              ) : (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-right text-xs print:text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-[#edece4] print:bg-gray-200 border-b-2 border-[#0c3e35] print:border-black text-[#0c3e35] print:text-black">
                        <th className="p-2 print:py-1 print:px-1 font-bold print:w-[25px] text-center">#</th>
                        <th className="p-2 print:py-1 print:px-1.5 font-bold print:w-[220px]">المهمة المنجزة</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[65px]">الأولوية</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[50px]">الساعات</th>
                        <th className="p-2 print:py-1 print:px-1.5 text-center print:w-[80px]">تاريخ الإنجاز</th>
                        <th className="p-2 print:py-1 print:px-1.5 font-bold">ملاحظات ونتائج الإنجاز الفعلي</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[70px]">المصدر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d2d1c9] print:divide-gray-300">
                      {data.completedTasks.map((task, idx) => (
                        <tr key={task.id} className="hover:bg-[#f4f3ed] print:hover:bg-transparent print:even:bg-gray-50/80 print:break-inside-avoid">
                          <td className="p-2 print:py-[3px] print:px-1 font-bold text-[#5e736e] print:text-black text-center">{idx + 1}</td>
                          <td className="p-2 print:py-[3px] print:px-1.5 font-bold text-[#0c3e35] print:text-black">
                            <p>{task.title}</p>
                            {task.description && (
                              <p className="text-[10.5px] print:text-[8px] text-[#5e736e] print:text-gray-700 font-normal mt-0.5">{task.description}</p>
                            )}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded text-[10px] print:text-[8px] font-bold bg-gray-100 text-gray-800 print:bg-transparent print:p-0">
                              {getPriorityLabel(task.priority)}
                            </span>
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center text-[#5e736e] print:text-black font-semibold whitespace-nowrap">
                            {task.estimatedHours} س
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1.5 text-center text-[#5e736e] print:text-black whitespace-nowrap font-medium text-[11px] print:text-[8.5px]">
                            {task.planDate ? new Date(task.planDate).toLocaleDateString('ar-SY') : '-'}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1.5 text-[#0c3e35] print:text-black font-medium leading-tight">
                            {task.completionNote ? (
                              <span className="text-emerald-900 print:text-black">{task.completionNote}</span>
                            ) : (
                              <span className="text-gray-400 print:text-gray-600 text-[10px] print:text-[8px]">تم إنجاز كامل متطلبات المهمة بنجاح</span>
                            )}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] print:text-[8px] font-bold ${
                              task.source === 'EXECUTIVE'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 print:border-none'
                                : 'bg-emerald-50 text-emerald-800'
                            }`}>
                              {task.sourceLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section: Tasks Nearing Completion (المهام المقتربة من الإنجاز) */}
          {(statusFilter === 'COMPLETED_AND_NEARING' || statusFilter === 'NEARING' || statusFilter === 'ALL') && (
            <div className="space-y-2.5 print:space-y-1.5 pt-2">
              <div className="flex items-center justify-between border-b-2 border-amber-600 print:border-black pb-1.5">
                <h2 className="text-xs sm:text-sm print:text-[11.5px] font-bold text-amber-950 print:text-black flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 print:text-black" />
                  <span>المهام المقتربة من الإنجاز (نسبة إنجاز 70% إلى 99%) - [{data.nearingTasks.length} مهمة]:</span>
                </h2>
              </div>

              {data.nearingTasks.length === 0 ? (
                <p className="text-xs print:text-[9px] text-gray-500 py-2 text-center bg-gray-50 rounded-xl">
                  لا توجد مهام في مرحلة اللمسات الأخيرة (70% فما فوق) حالياً
                </p>
              ) : (
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full text-right text-xs print:text-[9px] border-collapse">
                    <thead>
                      <tr className="bg-[#edece4] print:bg-gray-200 border-b-2 border-[#0c3e35] print:border-black text-[#0c3e35] print:text-black">
                        <th className="p-2 print:py-1 print:px-1 font-bold print:w-[25px] text-center">#</th>
                        <th className="p-2 print:py-1 print:px-1.5 font-bold print:w-[220px]">المهمة</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[85px]">نسبة الإنجاز</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[65px]">الأولوية</th>
                        <th className="p-2 print:py-1 print:px-1.5 text-center print:w-[80px]">تاريخ المتابعة</th>
                        <th className="p-2 print:py-1 print:px-1.5 font-bold">ملاحظات التقدم وما تبقى للإنجاز التام</th>
                        <th className="p-2 print:py-1 print:px-1 text-center print:w-[70px]">المصدر</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d2d1c9] print:divide-gray-300">
                      {data.nearingTasks.map((task, idx) => (
                        <tr key={task.id} className="hover:bg-[#f4f3ed] print:hover:bg-transparent print:even:bg-gray-50/80 print:break-inside-avoid">
                          <td className="p-2 print:py-[3px] print:px-1 font-bold text-[#5e736e] print:text-black text-center">{idx + 1}</td>
                          <td className="p-2 print:py-[3px] print:px-1.5 font-bold text-[#0c3e35] print:text-black">
                            <p>{task.title}</p>
                            {task.description && (
                              <p className="text-[10.5px] print:text-[8px] text-[#5e736e] print:text-gray-700 font-normal mt-0.5">{task.description}</p>
                            )}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center whitespace-nowrap">
                            <div className="flex items-center gap-1.5 justify-center">
                              <div className="w-12 print:w-10 bg-gray-200 print:border print:border-gray-400 rounded-full h-2 print:h-1.5 overflow-hidden">
                                <div
                                  className="bg-amber-600 print:bg-black h-full rounded-full"
                                  style={{ width: `${task.completionPercentage}%` }}
                                />
                              </div>
                              <span className="font-extrabold text-[#0c3e35] print:text-black text-[11px] print:text-[9px]">
                                {task.completionPercentage}%
                              </span>
                            </div>
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center whitespace-nowrap">
                            <span className="px-1.5 py-0.5 rounded text-[10px] print:text-[8px] font-bold bg-gray-100 text-gray-800 print:bg-transparent print:p-0">
                              {getPriorityLabel(task.priority)}
                            </span>
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1.5 text-center text-[#5e736e] print:text-black whitespace-nowrap font-medium text-[11px] print:text-[8.5px]">
                            {task.planDate ? new Date(task.planDate).toLocaleDateString('ar-SY') : '-'}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1.5 text-[#0c3e35] print:text-black font-medium leading-tight">
                            {task.completionNote || (
                              <span className="text-gray-500 print:text-gray-700 text-[10px] print:text-[8px]">قيد استكمال اللمسات الأخيرة بنجاح</span>
                            )}
                          </td>
                          <td className="p-2 print:py-[3px] print:px-1 text-center whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9.5px] print:text-[8px] font-bold ${
                              task.source === 'EXECUTIVE'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 print:border-none'
                                : 'bg-[#edece4] text-[#0c3e35]'
                            }`}>
                              {task.sourceLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section: Direct Executive Tasks from General Director (تكليفات المدير العام) */}
          {data.executiveTasks && data.executiveTasks.length > 0 && (
            <div className="space-y-2 print:space-y-1.5 pt-2 print:break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#0c3e35] print:border-black pb-1">
                <Layers className="w-4 h-4 text-[#d4af37] print:text-black" />
                <h2 className="text-xs sm:text-sm print:text-[11px] font-bold text-[#0c3e35] print:text-black">
                  متابعة تكليفات المدير العام للمديرية ({data.executiveTasks.length}):
                </h2>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right text-xs print:text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-[#edece4] print:bg-gray-200 border-b border-[#0c3e35] text-[#0c3e35] print:text-black">
                      <th className="p-1.5 print:py-1 font-bold print:w-[25px] text-center">#</th>
                      <th className="p-1.5 print:py-1 font-bold">عنوان التكليف</th>
                      <th className="p-1.5 print:py-1 text-center print:w-[70px]">نسبة الإنجاز</th>
                      <th className="p-1.5 print:py-1 text-center print:w-[70px]">الحالة</th>
                      <th className="p-1.5 print:py-1 font-bold">ملاحظات التنفيذ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d2d1c9] print:divide-gray-300">
                    {data.executiveTasks.map((et, idx) => (
                      <tr key={et.id} className="print:break-inside-avoid">
                        <td className="p-1.5 print:py-[2px] text-center font-bold text-[#5e736e] print:text-black">{idx + 1}</td>
                        <td className="p-1.5 print:py-[2px] font-bold text-[#0c3e35] print:text-black">
                          {et.title}
                          {et.assignedBy && <span className="text-[10px] print:text-[8px] text-[#5e736e] block font-normal">المكلف: {et.assignedBy}</span>}
                        </td>
                        <td className="p-1.5 print:py-[2px] text-center font-extrabold text-[#0c3e35] print:text-black">{et.completionPercentage}%</td>
                        <td className="p-1.5 print:py-[2px] text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] print:text-[8px] font-bold bg-gray-100 text-gray-800">
                            {et.status === 'COMPLETED' ? 'مكتمل' : 'قيد المتابعة'}
                          </span>
                        </td>
                        <td className="p-1.5 print:py-[2px] text-[#0c3e35] print:text-black">{et.completionNote || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section: Challenges Encountered (المعوقات والتحديات التي تم التعامل معها) */}
          {data.challenges && data.challenges.length > 0 && (
            <div className="space-y-2 print:space-y-1 pt-1 print:break-inside-avoid">
              <div className="flex items-center gap-2 border-b border-[#d2d1c9] pb-1">
                <AlertCircle className="w-4 h-4 text-amber-700 print:text-black" />
                <h2 className="text-xs sm:text-sm print:text-[11px] font-bold text-[#0c3e35] print:text-black">
                  المعوقات والتحديات الموثقة التي تم التعامل معها:
                </h2>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs print:text-[9px] text-[#0c3e35] print:text-black">
                {data.challenges.slice(0, 6).map((c, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {c.date && <strong className="text-[#5e736e] print:text-gray-700 ml-1">[{new Date(c.date).toLocaleDateString('ar-SY')}]:</strong>}
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}



        </div>
      )}

    </div>
  );
}

export default function DirectorReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f4f3ed] text-[#0c3e35] font-sans">
          <p className="text-sm font-bold text-[#0c3e35]">جاري تحميل نموذج التقرير الرسمي...</p>
        </div>
      }
    >
      <DirectorReportContent />
    </Suspense>
  );
}
