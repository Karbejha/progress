'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ExecutiveOverviewResponse } from '../../types';
import { api } from '../../services/api';
import { Printer, ArrowRight } from 'lucide-react';

function ReportContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const [data, setData] = useState<ExecutiveOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [dateParam]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await api.getExecutiveOverview(dateParam);
      setData(res);
    } catch (err) {
      console.error('Failed to load report data', err);
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = new Date(dateParam).toLocaleDateString('ar-SY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f3ed] text-[#0c3e35] font-sans">
        <p className="text-sm font-bold text-[#0c3e35]">جاري إعداد وتجميع التقرير اليومي الرسمي...</p>
      </div>
    );
  }

  const kpis = data?.kpis;
  const directorates = data?.directorates || [];

  return (
    <div className="min-h-screen bg-[#f4f3ed] print:bg-white text-[#0c3e35] print:text-black p-4 sm:p-8 font-sans">
      
      {/* Top Action Bar (hidden when printing) */}
      <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between no-print bg-[#05261e] p-4 rounded-2xl border border-[#0c3e35] shadow-lg text-white">
        <button
          onClick={() => window.close()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] text-xs font-bold text-white transition cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع للوحة التحكم</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[#d4af37]">تاريخ التقرير: <strong>{formattedDate}</strong></span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#c5a059] text-[#05261e] text-xs font-extrabold shadow-md transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة أو حفظ كملف PDF</span>
          </button>
        </div>
      </div>

      {/* Official Printable Document */}
      <div className="max-w-5xl mx-auto bg-white print:bg-white p-8 sm:p-12 rounded-[28px] print:rounded-none border border-[#d2d1c9] print:border-none shadow-brand-card print:shadow-none space-y-8">
        
        {/* Official Letterhead Header */}
        <div className="border-b-2 border-[#0c3e35] print:border-black pb-6 flex items-center justify-between">
          <div className="text-right space-y-1 text-xs sm:text-sm font-bold text-[#0c3e35] print:text-black">
            <p>الجمهورية العربية السورية</p>
            <p>المديرية العامة للموانئ</p>
            <p className="text-[11px] text-[#5e736e] print:text-gray-700">مكتب المدير العام</p>
          </div>

          <div className="text-center space-y-1.5">
            <div className="w-14 h-14 mx-auto flex items-center justify-center">
              <Image
                src="/assets/Syrian_logo_icon_dark_green.svg"
                alt="شعار الموانئ"
                width={48}
                height={48}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/Syrian_logo_icon_black.svg';
                }}
              />
            </div>
            <h1 className="text-base sm:text-lg font-black text-[#0c3e35] print:text-black">
              تقرير الإيجاز اليومي للخطط ونسب الإنجاز
            </h1>
            <p className="text-xs text-[#5e736e] print:text-gray-700 font-bold">{formattedDate}</p>
          </div>

          <div className="text-left space-y-1 text-xs text-[#5e736e] print:text-gray-700 font-medium">
            <p>الرقم: م.ع.م / {new Date(dateParam).getMonth() + 1}</p>
            <p>التاريخ: {dateParam}</p>
            <p>السرية: داخلي / رسمي</p>
          </div>
        </div>

        {/* Executive KPI Summary */}
        {kpis && (
          <div className="grid grid-cols-4 gap-3 p-4 rounded-2xl bg-[#f4f3ed] print:bg-gray-100 border border-[#d2d1c9] print:border-gray-300 text-center text-xs">
            <div>
              <span className="text-[#5e736e] print:text-gray-600 block mb-1 font-semibold">المديريات الملتزمة بالخطة</span>
              <strong className="text-base font-extrabold text-[#0c3e35] print:text-black">{kpis.plansSubmittedCount} / {kpis.totalDirectorates}</strong>
            </div>
            <div>
              <span className="text-[#5e736e] print:text-gray-600 block mb-1 font-semibold">ملخصات الإنجاز المسلمة</span>
              <strong className="text-base font-extrabold text-emerald-800 print:text-black">{kpis.summariesSubmittedCount} / {kpis.totalDirectorates}</strong>
            </div>
            <div>
              <span className="text-[#5e736e] print:text-gray-600 block mb-1 font-semibold">معدل الإنجاز الكلي</span>
              <strong className="text-base font-extrabold text-[#0c3e35] print:text-black">{kpis.averageCompletionRate}%</strong>
            </div>
            <div>
              <span className="text-[#5e736e] print:text-gray-600 block mb-1 font-semibold">تنبيهات ومعوقات طارئة</span>
              <strong className={`text-base font-extrabold ${kpis.urgentIssuesCount > 0 ? 'text-red-700' : 'text-[#0c3e35] print:text-black'}`}>
                {kpis.urgentIssuesCount}
              </strong>
            </div>
          </div>
        )}

        {/* Comprehensive Table of Directorates */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#edece4] print:bg-gray-200 border-b-2 border-[#0c3e35] print:border-black text-[#0c3e35] print:text-black">
                <th className="p-2.5 font-bold">#</th>
                <th className="p-2.5 font-bold">المديرية / المكتب</th>
                <th className="p-2.5 font-bold">المدير المسؤول</th>
                <th className="p-2.5 font-bold">الخطة الصباحية</th>
                <th className="p-2.5 font-bold">ملخص الإنجاز الفعلي</th>
                <th className="p-2.5 font-bold text-center">نسبة الإنجاز</th>
                <th className="p-2.5 font-bold">المعوقات والتوجيهات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d2d1c9] print:divide-gray-300">
              {directorates.map((dir, idx) => (
                <tr key={dir.directorateId} className="hover:bg-[#f4f3ed] print:hover:bg-transparent">
                  <td className="p-2.5 font-bold text-[#5e736e] print:text-gray-700">{idx + 1}</td>
                  <td className="p-2.5 font-bold text-[#0c3e35] print:text-black min-w-[140px]">
                    {dir.directorateName}
                  </td>
                  <td className="p-2.5 text-[#5e736e] print:text-gray-800 whitespace-nowrap font-medium">
                    {dir.director?.fullName || '-'}
                  </td>
                  <td className="p-2.5 text-[#5e736e] print:text-gray-800 max-w-[200px]">
                    {dir.generalFocus || (dir.hasPlan ? `${dir.tasksCount} مهام مجدولة` : 'لم ترفع خطة')}
                  </td>
                  <td className="p-2.5 text-[#0c3e35] print:text-black max-w-[220px]">
                    {dir.summaryText || (dir.hasSummary ? 'تم توثيق الإنجاز' : 'بانتظار التسليم')}
                  </td>
                  <td className="p-2.5 text-center font-extrabold">
                    <span className={dir.completionRate >= 80 ? 'text-emerald-800 print:text-green-800' : 'text-[#0c3e35]'}>
                      {dir.completionRate}%
                    </span>
                  </td>
                  <td className="p-2.5 text-[#5e736e] print:text-gray-800 max-w-[200px]">
                    {dir.challenges && (
                      <p className="text-amber-800 print:text-amber-900 text-[11px] mb-1 font-bold">
                        <strong>معوق:</strong> {dir.challenges}
                      </p>
                    )}
                    {dir.feedbacks && dir.feedbacks.length > 0 && (
                      <p className="text-[#0c3e35] print:text-black text-[11px] font-bold">
                        <strong>توجيه المدير العام:</strong> {dir.feedbacks[0].feedbackText}
                      </p>
                    )}
                    {!dir.challenges && (!dir.feedbacks || dir.feedbacks.length === 0) && '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signatures & Executive Approval Block */}
        <div className="pt-12 grid grid-cols-2 text-center text-xs font-bold text-[#0c3e35] print:text-black">
          <div className="space-y-12">
            <p>معاون المدير العام للموانئ</p>
            <p className="font-mono text-[#5e736e] print:text-gray-600">..................................................</p>
          </div>
          <div className="space-y-12">
            <p>المدير العام للمديرية العامة للموانئ</p>
            <p className="font-mono text-[#5e736e] print:text-gray-600">..................................................</p>
          </div>
        </div>

      </div>

    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f4f3ed] text-[#0c3e35] font-sans font-bold">
          جاري تحميل التقرير...
        </div>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
