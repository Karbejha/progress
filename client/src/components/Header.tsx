'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { User, Announcement } from '../types';
import { api } from '../services/api';
import { getSocket } from '../lib/socket';
import { getReadAnnouncementIds, markAnnouncementAsRead, markAllAnnouncementsAsRead } from '../lib/announcements';
import {
  Shield,
  Ship,
  LogOut,
  Bell,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  KeyRound,
  Users,
  ChevronDown,
  Clock,
  ChevronLeft,
  Megaphone,
  CheckCheck,
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UsersManagementModal } from './UsersManagementModal';
import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
}

interface LiveNotification {
  id: string;
  title: string;
  message: string;
  content?: string;
  authorName?: string;
  authorTitle?: string;
  priority?: string;
  createdAt?: string;
  type: 'plan' | 'task' | 'summary' | 'feedback' | 'announcement';
  time: string;
  fullPayload?: any;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);

  const notifRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);

  const isGeneralDirector =
    currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Load read status & announcements
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Reset notifications when switching user
    setNotifications([]);
    setUnreadCount(0);
    setReadAnnouncementIds(getReadAnnouncementIds(currentUser.id));

    const handleReadUpdate = (e: any) => {
      if (e.detail?.userId === currentUser.id) {
        setReadAnnouncementIds(e.detail.readIds || getReadAnnouncementIds(currentUser.id));
      }
    };

    window.addEventListener('announcements:read_updated', handleReadUpdate);

    // Fetch existing announcements from server (for non-author/non-executive users who should receive alerts)
    const fetchInitialAnnouncements = async () => {
      try {
        // Executive leadership (General Director / Assistant) issues circulars and should not receive alerts for their own circulars
        if (currentUser.role === 'GENERAL_DIRECTOR' || currentUser.role === 'ASSISTANT_DIRECTOR') {
          return;
        }

        const anns = await api.getAnnouncements();
        // Filter out announcements authored by the current user
        const targetAnns = anns.filter((a) => a.authorId !== currentUser.id);
        const currentRead = getReadAnnouncementIds(currentUser.id);

        const annNotifs: LiveNotification[] = targetAnns.map((a) => ({
          id: a.id,
          title: 'تعميم إداري رسمي',
          message: a.title,
          content: a.content,
          authorName: a.author?.fullName || 'المدير العام للموانئ',
          authorTitle: a.author?.title || 'المدير العام',
          priority: a.priority,
          createdAt: a.createdAt,
          type: 'announcement',
          time: a.createdAt
            ? new Date(a.createdAt).toLocaleDateString('ar-SY', {
                month: 'short',
                day: 'numeric',
              })
            : 'اليوم',
          fullPayload: a,
        }));

        const unreadAnns = targetAnns.filter((a) => !currentRead.includes(a.id));
        setUnreadCount(unreadAnns.length);

        setNotifications((prev) => {
          const prevMap = new Map(prev.map((p) => [p.id, p]));
          annNotifs.forEach((an) => prevMap.set(an.id, an));
          return Array.from(prevMap.values());
        });
      } catch (err) {
        console.error('Failed to load initial announcements in header', err);
      }
    };

    fetchInitialAnnouncements();

    return () => {
      window.removeEventListener('announcements:read_updated', handleReadUpdate);
    };
  }, [currentUser]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) {
      setIsConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    const addNotif = (notif: Omit<LiveNotification, 'id' | 'time'> & { id?: string }) => {
      const newN: LiveNotification = {
        ...notif,
        id: notif.id || Math.random().toString(),
        time: new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }),
      };
      setNotifications((prev) => [newN, ...prev.filter((p) => p.id !== newN.id).slice(0, 25)]);
      setUnreadCount((c) => c + 1);
    };

    socket.on('plan:submitted', (data: any) => {
      // Only notify executive leadership (General Director / Assistant Director)
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        title: 'رفع خطة صباحية',
        message: `قامت ${data.directorateName} باعتماد خطة اليوم (${data.tasksCount} مهام).`,
        type: 'plan',
        fullPayload: data,
      });
    });

    socket.on('task:updated', (data: any) => {
      // Only notify executive leadership (General Director / Assistant Director)
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        title: 'تحديث حالة مهمة',
        message: `قامت ${data.directorateName} بتحديث: "${data.taskTitle}" (${data.completionPercentage}%).`,
        type: 'task',
        fullPayload: data,
      });
    });

    socket.on('summary:submitted', (data: any) => {
      // Only notify executive leadership (General Director / Assistant Director)
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        title: 'تسليم ملخص الإنجاز',
        message: `سلّمت ${data.directorateName} ملخص نهاية الدوام بنسبة ${data.overallCompletionRate}%.`,
        type: 'summary',
        fullPayload: data,
      });
    });

    socket.on('feedback:sent', (data: any) => {
      // Only notify the targeted directorate's director (never notify the executive leadership who sent it)
      if (currentUser?.role === 'DIRECTOR' && currentUser?.directorateId && currentUser.directorateId === data.directorateId) {
        addNotif({
          title: 'توجيه من المدير العام',
          message: data.feedbackText,
          content: data.feedbackText,
          authorName: data.fromUserName || 'المدير العام',
          type: 'feedback',
          fullPayload: data,
        });
      }
    });

    socket.on('announcement:created', (data: any) => {
      // Do not notify the executive leadership or the author of the circular
      if (currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR') return;
      if (data.authorId && data.authorId === currentUser?.id) return;

      addNotif({
        id: data.id,
        title: 'تعميم إداري رسمي',
        message: data.title,
        content: data.content,
        authorName: data.authorName || 'المدير العام للموانئ',
        authorTitle: 'المدير العام',
        priority: data.priority || 'NORMAL',
        createdAt: data.createdAt || new Date().toISOString(),
        type: 'announcement',
        fullPayload: data,
      });
    });

    socket.on('executive-task:created', (data: any) => {
      if (currentUser?.role === 'DIRECTOR' && currentUser?.directorateId === data.directorateId) {
        addNotif({
          id: data.task?.id,
          title: 'تكليف رئاسي جديد',
          message: `وردك تكليف من المدير العام: "${data.task?.title}"`,
          content: data.task?.description || data.task?.title,
          authorName: data.assignedByName || 'المدير العام',
          priority: data.task?.priority || 'NORMAL',
          type: 'feedback',
          fullPayload: data,
        });
      }
    });

    socket.on('executive-task:updated', (data: any) => {
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (isExec && data.updatedByRole === 'DIRECTOR') {
        addNotif({
          id: data.task?.id,
          title: 'تحديث إنجاز تكليف رئاسي',
          message: `قامت (${data.directorateName}) بتحديث التكليف "${data.task?.title}" إلى (${data.task?.completionPercentage}%).`,
          type: 'task',
          fullPayload: data,
        });
      }
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('plan:submitted');
      socket.off('task:updated');
      socket.off('summary:submitted');
      socket.off('feedback:sent');
      socket.off('announcement:created');
      socket.off('executive-task:created');
      socket.off('executive-task:updated');
    };
  }, [currentUser]);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
    if (!showNotifications) {
      setUnreadCount(0);
    }
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    const annIds = notifications
      .filter((n) => n.type === 'announcement' && n.id)
      .map((n) => n.id);

    if (annIds.length > 0) {
      markAllAnnouncementsAsRead(currentUser.id, annIds);
      setReadAnnouncementIds((prev) => Array.from(new Set([...prev, ...annIds])));
    }

    setUnreadCount(0);
  };

  const handleNotificationClick = (n: LiveNotification) => {
    if (n.type === 'announcement') {
      if (currentUser && n.id) {
        markAnnouncementAsRead(currentUser.id, n.id);
      }
      setSelectedAnnouncement({
        id: n.id,
        title: n.fullPayload?.title || n.message,
        content: n.fullPayload?.content || n.content || n.message,
        authorName: n.fullPayload?.authorName || n.authorName || 'المدير العام للموانئ',
        authorTitle: n.authorTitle || 'المدير العام',
        priority: n.fullPayload?.priority || n.priority || 'NORMAL',
        createdAt: n.createdAt,
      });
      setShowNotifications(false);
    } else if (n.type === 'feedback') {
      setSelectedAnnouncement({
        id: n.id,
        title: 'توجيه وملاحظات من المدير العام',
        content: n.content || n.message,
        authorName: n.authorName || 'المدير العام للموانئ',
        authorTitle: 'المدير العام',
        priority: 'HIGH',
        createdAt: n.createdAt,
      });
      setShowNotifications(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#05261e] border-b border-[#0c3e35] shadow-md transition-all font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            
            {/* Logo & Title */}
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-1.5 shadow-md">
                <Image
                  src="/assets/Syrian_logo_icon_gold.svg"
                  alt="شعار الجمهورية العربية السورية - الموانئ"
                  width={36}
                  height={36}
                  className="object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30">
                    المديرية العامة للموانئ
                  </span>
                  <span className="text-[11px] text-[#8daaa2] hidden sm:inline font-medium">
                    • الجمهورية العربية السورية
                  </span>
                </div>
                <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-0.5">
                  منظومة متابعة الخطط والإنجاز اليومي
                </h1>
              </div>
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-3 relative">
              {currentUser && (
                <>
                  {/* Notifications Bell */}
                  <div ref={notifRef} className="relative">
                    <button
                      onClick={handleOpenNotifications}
                      className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#0c3e35] border border-[#d2d1c9]/20 text-[#d4af37] hover:bg-[#0c4237] hover:border-[#d4af37]/40 transition cursor-pointer shadow-sm active:scale-95"
                      title="التنبيهات اللحظية"
                      aria-label="التنبيهات اللحظية"
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white font-black text-[10px] leading-none flex items-center justify-center border-2 border-[#05261e] shadow-md z-10 pointer-events-none select-none">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                      <div className="absolute left-0 mt-3 w-80 sm:w-96 bg-[#edece4] border border-[#d2d1c9] rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fadeIn text-right">
                        <div className="p-3.5 sm:p-4 bg-[#05261e] text-white flex items-center justify-between border-b border-[#0c3e35] gap-2">
                          <h4 className="text-xs font-bold flex items-center gap-1.5 text-[#d4af37] shrink-0">
                            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                            التنبيهات اللحظية المباشرة
                          </h4>
                          <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                              <button
                                onClick={handleMarkAllAsRead}
                                className="text-[11px] font-bold text-[#d4af37] hover:text-white px-2.5 py-1 rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/30 hover:border-[#d4af37] transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap"
                                title="تحديد كافة التنبيهات والتعاميم كمقروءة"
                              >
                                <CheckCheck className="w-3.5 h-3.5 text-[#d4af37]" />
                                <span>تحديد الكل كمقروء</span>
                              </button>
                            )}
                            <button
                              onClick={() => setShowNotifications(false)}
                              className="p-1.5 rounded-lg text-[#8daaa2] hover:text-white hover:bg-white/10 transition cursor-pointer"
                              title="إغلاق"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="max-h-80 overflow-y-auto p-3 space-y-2">
                          {notifications.length === 0 ? (
                            <div className="text-center py-8 text-xs text-[#5e736e]">
                              لا توجد تنبيهات جديدة حتى الآن
                            </div>
                          ) : (
                            notifications.map((n) => {
                              const isClickable = n.type === 'announcement' || n.type === 'feedback';
                              const isAnnRead = n.type === 'announcement' && readAnnouncementIds.includes(n.id);

                              return (
                                <div
                                  key={n.id}
                                  onClick={() => isClickable && handleNotificationClick(n)}
                                  className={`p-3 rounded-2xl border text-xs space-y-1.5 transition ${
                                    n.type === 'announcement'
                                      ? isAnnRead
                                        ? 'bg-white/80 border-[#d2d1c9] hover:bg-[#edece4] cursor-pointer'
                                        : 'bg-amber-50/80 border-amber-300 shadow-xs hover:bg-amber-100/70 cursor-pointer'
                                      : isClickable
                                      ? 'bg-white border-[#d2d1c9] hover:border-[#0c3e35] hover:bg-[#f4f3ed] cursor-pointer'
                                      : 'bg-white border-[#d2d1c9]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-[#0c3e35] flex items-center gap-1.5">
                                      {n.type === 'plan' && <Clock className="w-3.5 h-3.5 text-[#0c3e35]" />}
                                      {n.type === 'task' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                                      {n.type === 'summary' && <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />}
                                      {n.type === 'feedback' && <Shield className="w-3.5 h-3.5 text-[#d4af37]" />}
                                      {n.type === 'announcement' && <Megaphone className="w-3.5 h-3.5 text-[#d4af37]" />}
                                      {n.title}
                                    </span>
                                    
                                    <div className="flex items-center gap-1.5">
                                      {n.type === 'announcement' && (
                                        isAnnRead ? (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#edece4] text-[#5e736e]">
                                            تمت القراءة
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white animate-pulse">
                                            جديد
                                          </span>
                                        )
                                      )}
                                      <span className="text-[10px] text-[#8daaa2] font-medium">{n.time}</span>
                                    </div>
                                  </div>
                                  
                                  <p className="text-xs text-[#0c3e35] leading-relaxed font-medium">
                                    {n.message}
                                  </p>

                                  {isClickable && (
                                    <div className="pt-1 flex items-center justify-between text-[10px] text-[#0c3e35] font-bold border-t border-[#e5e4dc]">
                                      <span>
                                        {n.type === 'announcement'
                                          ? isAnnRead
                                            ? 'انقر لإعادة قراءة نص وتفاصيل التعميم 📖'
                                            : 'انقر لقراءة نص وتفاصيل التعميم 📖'
                                          : 'انقر لعرض كامل التفاصيل'}
                                      </span>
                                      <ChevronLeft className="w-3 h-3 text-[#0c3e35]" />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Profile Menu */}
                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => {
                        setShowUserMenu(!showUserMenu);
                        setShowNotifications(false);
                      }}
                      className="flex items-center gap-2.5 bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d2d1c9]/20 hover:border-[#d4af37]/40 rounded-xl px-2.5 h-10 transition cursor-pointer shadow-sm"
                    >
                      <div className="w-7 h-7 rounded-lg bg-[#05261e] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] font-bold shrink-0">
                        {isGeneralDirector ? <Shield className="w-3.5 h-3.5 text-[#d4af37]" /> : <Ship className="w-3.5 h-3.5 text-[#8daaa2]" />}
                      </div>
                      <div className="hidden sm:block text-right">
                        <p className="text-xs font-bold text-white leading-tight">
                          {currentUser.fullName}
                        </p>
                        <p className="text-[10px] text-[#d4af37] font-medium leading-tight">
                          {currentUser.title}
                        </p>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8daaa2] shrink-0" />
                    </button>

                    {/* User Dropdown */}
                    {showUserMenu && (
                      <div className="absolute left-0 mt-3 w-64 bg-[#edece4] border border-[#d2d1c9] rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fadeIn text-right p-2 space-y-1">
                        
                        {/* Option 1: Manage Users (for General Director / Assistant) */}
                        {isGeneralDirector && (
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowUsersModal(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-[#0c3e35] hover:bg-white transition cursor-pointer"
                          >
                            <Users className="w-4 h-4 text-[#0c3e35]" />
                            <span>إدارة المستخدمين والمدراء</span>
                          </button>
                        )}

                        {/* Option 2: Change Own Password */}
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowPasswordModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-[#0c3e35] hover:bg-white transition cursor-pointer"
                        >
                          <KeyRound className="w-4 h-4 text-[#0c3e35]" />
                          <span>تغيير كلمة المرور الخاصة</span>
                        </button>

                        <div className="border-t border-[#d2d1c9] my-1" />

                        {/* Option 3: Logout */}
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onLogout();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-700 hover:bg-red-50 transition cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 text-red-600" />
                          <span>تسجيل الخروج</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      {/* Users Management Modal */}
      <UsersManagementModal
        isOpen={showUsersModal}
        onClose={() => setShowUsersModal(false)}
      />

      {/* Announcement Full Details Dialog */}
      <AnnouncementDetailsModal
        data={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </>
  );
};
