'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, Calendar, User, AlertTriangle, CheckCircle2, Eye, Clock, CheckCheck, Building2, Users } from 'lucide-react';
import { api } from '../services/api';
import { User as UserType, AnnouncementReadersResponse } from '../types';

export interface AnnouncementModalData {
  id?: string;
  title: string;
  content: string;
  authorName?: string;
  authorTitle?: string;
  priority?: string;
  createdAt?: string;
  type?: 'announcement' | 'feedback' | 'task' | string;
  isAnnouncement?: boolean;
}

interface AnnouncementDetailsModalProps {
  data: AnnouncementModalData | null;
  currentUser?: UserType | null;
  onClose: () => void;
}

export const AnnouncementDetailsModal: React.FC<AnnouncementDetailsModalProps> = ({
  data,
  currentUser,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [readersData, setReadersData] = useState<AnnouncementReadersResponse | null>(null);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [activeTab, setActiveTab] = useState<'CONTENT' | 'READERS'>('CONTENT');

  const isExecutive =
    currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';

  const isAnnouncement =
    data?.isAnnouncement === true ||
    (data?.isAnnouncement !== false && (!data?.type || data?.type === 'announcement'));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!data || !data.id || !isAnnouncement) return;

    // Record server-side read receipt if director
    if (currentUser && currentUser.role === 'DIRECTOR') {
      api.markAnnouncementRead(data.id).catch((err) => {
        console.debug('Announcement read receipt skipped/failed:', err?.message || err);
      });
    }

    // Load leadership reader stats if executive
    if (isExecutive && data.id) {
      setLoadingReaders(true);
      api
        .getAnnouncementReaders(data.id)
        .then((res) => {
          setReadersData(res);
        })
        .catch((err) => {
          console.debug('Failed to load announcement readership stats:', err?.message || err);
          setReadersData(null);
        })
        .finally(() => {
          setLoadingReaders(false);
        });
    }
  }, [data?.id, isAnnouncement, currentUser?.id, isExecutive]);

  useEffect(() => {
    if (!data) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [data, onClose]);

  if (!mounted || !data) return null;

  const formattedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('ar-SY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : new Date().toLocaleDateString('ar-SY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const getPriorityBadge = (p?: string, type?: string) => {
    if (type === 'feedback') {
      return (
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          توجيه وملاحظات إدارية
        </span>
      );
    }
    switch (p) {
      case 'URGENT':
        return (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            تعميم عاجل جداً
          </span>
        );
      case 'HIGH':
        return (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            أولوية مرتفعة
          </span>
        );
      default:
        return (
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
            تعميم إداري رسمي
          </span>
        );
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="p-6 bg-[#05261e] text-white flex items-center justify-between border-b border-[#0c3e35] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-2 shadow-md shrink-0">
              <Image
                src="/assets/Syrian_logo_icon_gold.svg"
                alt="شعار المديرية العامة للموانئ"
                width={36}
                height={36}
                className="object-contain w-auto h-auto"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                  الجمهورية العربية السورية • المديرية العامة للموانئ
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-1">
                {isAnnouncement ? 'تفاصيل التعميم الإداري الرسمي' : 'تفاصيل التوجيه والملاحظات الإدارية'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Tabs (Only visible for Executive leadership on Announcements) */}
        {isExecutive && isAnnouncement && (
          <div className="flex items-center gap-2 px-6 pt-4 bg-[#edece4] border-b border-[#d2d1c9] shrink-0">
            <button
              onClick={() => setActiveTab('CONTENT')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer border-t border-x ${activeTab === 'CONTENT'
                  ? 'bg-white text-[#0c3e35] border-[#d2d1c9] border-b-transparent shadow-xs'
                  : 'text-[#5e736e] hover:text-[#0c3e35] border-transparent'
                }`}
            >
              نص التعميم الرسمي
            </button>
            <button
              onClick={() => setActiveTab('READERS')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t border-x ${activeTab === 'READERS'
                  ? 'bg-white text-[#0c3e35] border-[#d2d1c9] border-b-transparent shadow-xs'
                  : 'text-[#5e736e] hover:text-[#0c3e35] border-transparent'
                }`}
            >
              <Eye className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>سجل القراءة والاطلاع</span>
              {readersData?.stats && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#0c3e35] text-[#d4af37] text-[10px]">
                  {readersData.stats.readCount} / {readersData.stats.totalDirectorates}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 bg-[#edece4]">

          {activeTab === 'CONTENT' ? (
            <>
              {/* Metadata Block */}
              <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[#0c3e35] font-bold">
                    <User className="w-4 h-4 text-[#d4af37]" />
                    <span>الجهة المصدرة: <strong>{data.authorName || 'المدير العام للموانئ'}</strong> {data.authorTitle ? `(${data.authorTitle})` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#5e736e]">
                    <Calendar className="w-4 h-4 text-[#8daaa2]" />
                    <span>تاريخ وتوقيت الصدور: {formattedDate}</span>
                  </div>
                </div>

                <div>{getPriorityBadge(data.priority, data.type)}</div>
              </div>

              {/* Announcement Official Paper Document */}
              <div className="p-6 sm:p-8 rounded-[24px] bg-white border-2 border-[#0c3e35]/30 space-y-4 shadow-sm relative">

                {/* Corner Decorative Watermark */}
                <div className="absolute top-4 left-4 opacity-10 pointer-events-none">
                  <Image
                    src="/assets/Syrian_logo_icon_gold.svg"
                    alt="شعار"
                    width={80}
                    height={80}
                    className="w-auto h-auto"
                  />
                </div>

                <div className="border-b border-[#e5e4dc] pb-3">
                  <h3 className="text-base sm:text-lg font-black text-[#0c3e35] leading-snug">
                    {data.title}
                  </h3>
                </div>

                {/* Circular Full Content Text */}
                <div className="text-xs sm:text-sm text-[#0c3e35] leading-relaxed whitespace-pre-line font-medium text-justify">
                  {data.content}
                </div>

                <div className="pt-6 border-t border-[#e5e4dc] flex items-center justify-between text-xs text-[#5e736e]">
                  <span className="font-bold text-[#0c3e35]">المديرية العامة للموانئ - مكتب المدير العام</span>
                  <span className="text-[11px] text-[#8daaa2]">نسخة معتمدة وموزعة إلكترونياً ومسجلة</span>
                </div>
              </div>
            </>
          ) : (
            /* Readers Log Tab for Executive Leadership */
            <div className="space-y-5">
              {loadingReaders ? (
                <div className="text-center py-12 text-xs font-bold text-[#5e736e]">
                  جاري جلب بيانات سجل القراءة والاطلاع...
                </div>
              ) : readersData ? (
                <>
                  {/* Readership Summary KPI Bar */}
                  <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] shadow-xs space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-[#0c3e35]">
                      <span>نسبة اطلاع المديريات على هذا التعميم:</span>
                      <span className="text-sm font-black text-[#0c3e35]">
                        {readersData.stats.readPercentage}% ({readersData.stats.readCount} من أصل {readersData.stats.totalDirectorates})
                      </span>
                    </div>
                    <div className="w-full bg-[#edece4] h-3 rounded-full overflow-hidden border border-[#d2d1c9]">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${readersData.stats.readPercentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* List 1: Read by */}
                    <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] shadow-xs space-y-3">
                      <div className="flex items-center gap-2 text-emerald-800 font-extrabold pb-2 border-b border-[#e5e4dc]">
                        <CheckCheck className="w-4 h-4 text-emerald-600" />
                        <span>تمت القراءة ({readersData.readers.length})</span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {readersData.readers.length === 0 ? (
                          <p className="text-center py-4 text-[#8daaa2]">لم يتم تسجيل أي قراءة حتى الآن</p>
                        ) : (
                          readersData.readers.map((r, i) => (
                            <div key={i} className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
                              <div className="flex items-center justify-between font-bold text-[#0c3e35]">
                                <span>{r.directorateName}</span>
                                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                                  {new Date(r.readAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#5e736e]">
                                المسؤول: {r.userName} ({r.userTitle})
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* List 2: Not read yet */}
                    <div className="p-4 rounded-2xl bg-white border border-[#d2d1c9] shadow-xs space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 font-extrabold pb-2 border-b border-[#e5e4dc]">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>بانتظار الاطلاع ({readersData.unreadDirectorates.length})</span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {readersData.unreadDirectorates.length === 0 ? (
                          <div className="p-4 text-center text-emerald-700 font-bold bg-emerald-50 rounded-xl border border-emerald-200">
                            🎉 ممتاز! اطلعت كافة المديريات على هذا التعميم
                          </div>
                        ) : (
                          readersData.unreadDirectorates.map((u, i) => (
                            <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                              <div className="flex items-center justify-between font-bold text-[#0c3e35]">
                                <span>{u.directorateName}</span>
                                <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                                  لم يُفتح بعد
                                </span>
                              </div>
                              <p className="text-[11px] text-[#5e736e]">
                                المدير المسؤول: {u.directorName}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2d1c9] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">

          </div>

          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white text-xs font-bold transition shadow-md cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
