import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { User } from '../types';
import { api } from '../services/api';
import { getSocket, joinUserRooms, onSocketStatusChange, forceReconnectSocket, getSocketStatus, SocketConnectionStatus } from '../lib/socket';
import { playSubtleChime, playUrgentAlert, isSoundEnabled, setSoundEnabled } from '../lib/audio';
import {
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markAnnouncementAsRead,
  syncReadNotificationsFromServer,
  flushPendingNotificationReads,
} from '../lib/announcements';
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
  Volume2,
  VolumeX,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
  Info,
  ListTodo,
  Eye,
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UsersManagementModal } from './UsersManagementModal';
import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import { NotificationDetailsModal, NotificationDetailItem } from './NotificationDetailsModal';
import { QuickTodoDrawer } from './QuickTodoDrawer';
import { App } from '@capacitor/app';
import { InboxNotification, PersistedNotification, toInboxNotification, mergeInboxNotifications, isInboxNotificationRead } from '../lib/notificationInbox';
import { Capacitor } from '@capacitor/core';
import {
  initNotificationService,
  requestNotificationPermissions,
  subscribeToNotificationClicks,
  notifyGeneric,
} from '../lib/notifications';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  activeView?: 'DASHBOARD' | 'TODOS';
  onViewChange?: (view: 'DASHBOARD' | 'TODOS') => void;
}

type LiveNotification = InboxNotification;

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  activeView = 'DASHBOARD',
  onViewChange,
}) => {
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('disconnected');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ serverConfigured: boolean; registeredDevices: number; platforms: string[] } | null>(null);
  const [pushStatusError, setPushStatusError] = useState(false);

  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const unreadCount = notifications.filter((n) => !isInboxNotificationRead(n, readNotifIds)).length;
  const notificationsRef = React.useRef(notifications);
  notificationsRef.current = notifications;

  // TO-DO List state
  const [pendingTodosCount, setPendingTodosCount] = useState(0);
  const [showQuickTodoDrawer, setShowQuickTodoDrawer] = useState(false);

  const notifRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);
  const [selectedNotificationDetail, setSelectedNotificationDetail] = useState<NotificationDetailItem | null>(null);

  const isGeneralDirector =
    currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
  const isObserver = currentUser?.role === 'OBSERVER';

  useEffect(() => {
    if (!showStatusModal || !currentUser) return;
    let active = true;
    setPushStatus(null);
    setPushStatusError(false);
    api.getPushNotificationStatus().then((status) => {
      if (active) setPushStatus(status);
    }).catch(() => { if (active) setPushStatusError(true); });
    return () => { active = false; };
  }, [showStatusModal, currentUser?.id]);

  // Real-time socket status listener
  useEffect(() => {
    const unsubscribe = onSocketStatusChange((status, err) => {
      setSocketStatus(status);
      setSocketError(err || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
    const handleSoundToggle = (e: any) => {
      setSoundOn(e.detail?.enabled ?? isSoundEnabled());
    };
    window.addEventListener('ports_sound_toggled', handleSoundToggle);
    return () => window.removeEventListener('ports_sound_toggled', handleSoundToggle);
  }, []);

  // Fetch and track uncompleted TO-DO items count
  const loadTodosCount = async () => {
    if (!currentUser) return;
    try {
      const res = await api.getTodos({ isCompleted: 'false' });
      setPendingTodosCount(res.stats?.pending ?? res.todos?.length ?? 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadTodosCount();
    const handleTodoUpdate = () => {
      loadTodosCount();
    };
    window.addEventListener('ports:todos_updated', handleTodoUpdate);
    return () => window.removeEventListener('ports:todos_updated', handleTodoUpdate);
  }, [currentUser]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      playSubtleChime();
    }
  };

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

  // Push clicks can arrive before React mounts after a cold start.
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const unsubscribe = subscribeToNotificationClicks(async (event) => {
      const detail = event.detail;
      if (!detail || (detail.userId && detail.userId !== currentUser.id)) return;
      const notificationId = detail.notificationId || detail.dbId;
      let item = notificationsRef.current.find((n) => n.id === notificationId);
      if (!item && notificationId) {
        try {
          const record = await api.getNotification(notificationId);
          if (!active) return;
          if (record) item = toInboxNotification(record);
        } catch (error) {
          console.warn('Could not load clicked notification:', error);
        }
      }
      if (!active) return;
      if (!item) {
        let metadata = detail.metadata || {};
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
        }
        item = toInboxNotification({
          id: notificationId || detail.id || detail.referenceId,
          type: detail.type || 'feedback',
          title: detail.title || 'إشعار جديد',
          message: detail.message || detail.body || '',
          referenceId: detail.referenceId || detail.id,
          metadata: { ...detail, ...metadata },
          createdAt: detail.createdAt || new Date().toISOString(),
        });
      }
      handleNotificationClick(item);
    });
    void initNotificationService().then(() => requestNotificationPermissions()).catch(console.warn);
    return () => { active = false; unsubscribe(); };
  }, [currentUser?.id]);

  // The inbox and live events use the same database IDs. Reconciliation never
  // replays old unread notifications into the phone's notification tray.
  useEffect(() => {
    setNotifications([]);
    setReadNotifIds(currentUser ? getReadNotificationIds(currentUser.id) : []);
    setSelectedAnnouncement(null);
    setSelectedNotificationDetail(null);
    if (!currentUser) { joinUserRooms(null); return; }

    let active = true;
    let refreshing = false;
    let refreshRequested = false;
    const seenIds = new Set<string>();
    const socket = getSocket();
    const updateReads = () => {
      if (active) setReadNotifIds(getReadNotificationIds(currentUser.id));
    };
    const handleReadUpdate = (event: any) => {
      if (event.detail?.userId === currentUser.id) updateReads();
    };
    const refresh = async () => {
      if (refreshing) { refreshRequested = true; return; }
      refreshing = true;
      try {
        do {
          refreshRequested = false;
          void flushPendingNotificationReads(currentUser.id);
          const [records, reads] = await Promise.allSettled([
            api.getNotifications(150), api.getReadNotificationKeys(),
          ]);
          if (!active) return;
          if (reads.status === 'fulfilled') {
            syncReadNotificationsFromServer(currentUser.id, reads.value);
            updateReads();
          }
          if (records.status === 'fulfilled') {
            const items = records.value.map(toInboxNotification);
            items.forEach((n: LiveNotification) => seenIds.add(n.id));
            setNotifications((previous) => mergeInboxNotifications(previous, items));
          } else {
            console.warn('Could not refresh notification inbox:', records.reason);
          }
        } while (active && refreshRequested);
      } finally { refreshing = false; }
    };
    const handleCreated = (record: PersistedNotification) => {
      if (!active || !record?.id || record.userId !== currentUser.id) return;
      const item = toInboxNotification(record);
      const alreadySeen = seenIds.has(item.id);
      seenIds.add(item.id);
      setNotifications((previous) => mergeInboxNotifications(previous, [item]));
      if (!alreadySeen && !isInboxNotificationRead(item, getReadNotificationIds(currentUser.id))) {
        void notifyGeneric(record).catch(console.warn);
        if (!Capacitor.isNativePlatform()) {
          if (item.priority === 'URGENT' || item.priority === 'HIGH') playUrgentAlert();
          else playSubtleChime();
        }
      }
    };
    const handleServerReads = (data: { readKeys?: string[] }) => {
      if (!active || !Array.isArray(data?.readKeys)) return;
      syncReadNotificationsFromServer(currentUser.id, data.readKeys);
      updateReads();
    };
    const handleConnect = () => { void refresh(); };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const handleTodoUpdated = () => window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    // Business events also trigger reconciliation during rolling server upgrades.
    const refreshEvents = ['plan:submitted', 'task:updated', 'summary:submitted',
      'feedback:sent', 'announcement:created', 'executive-task:created', 'executive-task:updated'];
    socket.on('connect', handleConnect);
    socket.on('notification:created', handleCreated);
    socket.on('notifications:read', handleServerReads);
    socket.on('todo:updated', handleTodoUpdated);
    refreshEvents.forEach((name) => socket.on(name, handleConnect));
    window.addEventListener('announcements:read_updated', handleReadUpdate);
    window.addEventListener('notifications:read_updated', handleReadUpdate);
    window.addEventListener('ports:push_received', handleConnect);
    window.addEventListener('online', handleConnect);
    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
    const appStateListener = Capacitor.isNativePlatform()
      ? App.addListener('appStateChange', (state) => { if (state.isActive) void refresh(); })
      : null;
    const interval = setInterval(handleVisible, 40000);
    joinUserRooms(currentUser);
    void refresh();
    return () => {
      active = false;
      socket.off('connect', handleConnect);
      socket.off('notification:created', handleCreated);
      socket.off('notifications:read', handleServerReads);
      socket.off('todo:updated', handleTodoUpdated);
      refreshEvents.forEach((name) => socket.off(name, handleConnect));
      window.removeEventListener('announcements:read_updated', handleReadUpdate);
      window.removeEventListener('notifications:read_updated', handleReadUpdate);
      window.removeEventListener('ports:push_received', handleConnect);
      window.removeEventListener('online', handleConnect);
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
      void appStateListener?.then((listener) => listener.remove()).catch(console.warn);
      clearInterval(interval);
    };
  }, [currentUser?.id]);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    markAllNotificationsAsRead(currentUser.id, notifications.map((n) => n.id));
    notifications.filter((n) => n.type === 'announcement').forEach((n) => {
      const announcementId = n.fullPayload?.referenceId || n.id;
      markAnnouncementAsRead(currentUser.id, announcementId);
    });
    setReadNotifIds(getReadNotificationIds(currentUser.id));
  };

  const handleNotificationClick = (n: LiveNotification) => {
    if (currentUser && n.id) {
      markNotificationAsRead(currentUser.id, n.id);
      if (n.type === 'announcement') {
        markAnnouncementAsRead(currentUser.id, n.fullPayload?.referenceId || n.id);
      }
      setReadNotifIds(getReadNotificationIds(currentUser.id));
    }

    if (n.type === 'announcement') {
      setSelectedAnnouncement({
        id: n.fullPayload?.referenceId || n.id,
        isAnnouncement: true,
        type: 'announcement',
        title: n.fullPayload?.title || n.message,
        content: n.fullPayload?.content || n.content || n.message,
        authorName: n.fullPayload?.authorName || n.authorName || 'المدير العام للموانئ',
        authorTitle: n.authorTitle || 'المدير العام',
        priority: n.fullPayload?.priority || n.priority || 'NORMAL',
        createdAt: n.createdAt,
        attachments: n.fullPayload?.attachments || (n as any).attachments,
      });
      setShowNotifications(false);
    } else if (n.type === 'feedback') {
      setSelectedAnnouncement({
        id: n.id,
        isAnnouncement: false,
        type: 'feedback',
        title: n.title || 'توجيه وتكليف من المدير العام',
        content: n.content || n.message,
        authorName: n.authorName || 'المدير العام للموانئ',
        authorTitle: 'المدير العام',
        priority: n.priority || 'HIGH',
        createdAt: n.createdAt,
      });
      setShowNotifications(false);
    } else {
      // Handles 'task' (executive task updates), 'plan', 'summary', and all other notification types!
      setSelectedNotificationDetail({
        id: n.id,
        title: n.title,
        message: n.message,
        content: n.content,
        type: n.type,
        time: n.time,
        createdAt: n.createdAt,
        priority: n.priority,
        authorName: n.authorName,
        authorTitle: n.authorTitle,
        fullPayload: n.fullPayload,
      });
      setShowNotifications(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#05261e] border-b border-[#0c3e35] shadow-md transition-all font-sans pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[3.75rem] sm:h-20 py-2 sm:py-0 gap-2">

            {/* Logo & Title */}
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1 sm:flex-initial">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-1.5 shadow-md shrink-0">
                <Image
                  src="/assets/Syrian_logo_icon_gold.svg"
                  alt="شعار الجمهورية العربية السورية - الموانئ"
                  width={36}
                  height={36}
                  className="object-contain w-auto h-auto"
                  priority
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[9px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 whitespace-nowrap leading-none">
                    المديرية العامة للموانئ
                  </span>
                  <span className="text-[10px] text-[#8daaa2] hidden md:inline font-medium">
                    • الجمهورية العربية السورية
                  </span>
                </div>
                <h1 className="text-xs sm:text-base md:text-lg font-extrabold text-white tracking-tight mt-0.5 whitespace-nowrap leading-snug">
                  <span className="inline sm:hidden">منظومة المتابعة اليومية</span>
                  <span className="hidden sm:inline">منظومة متابعة الخطط والإنجاز اليومي</span>
                </h1>
              </div>
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 relative shrink-0">
              {currentUser && (
                <>
                  {/* Sound Chimes Toggle Button (Desktop & Tablet) */}
                  <button
                    onClick={toggleSound}
                    className={`hidden sm:flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border transition cursor-pointer shadow-sm active:scale-95 ${soundOn
                      ? 'bg-[#0c3e35] border-[#d4af37]/30 text-[#d4af37] hover:bg-[#0c4237]'
                      : 'bg-[#05261e] border-[#5e736e]/40 text-[#8daaa2] hover:text-white'
                      }`}
                    title={soundOn ? 'نغمات التنبيه الصوتية مفعلة (انقر للكتم)' : 'نغمات التنبيه الصوتية مكتومة (انقر للتفعيل)'}
                    aria-label="تبديل نغمة التنبيه"
                  >
                    {soundOn ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </button>

                  {/* Real-time Socket Connection Status Badge (Desktop & Tablet) */}
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className={`hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 h-8 sm:h-10 rounded-lg sm:rounded-xl border transition cursor-pointer shadow-sm text-[10px] sm:text-xs font-bold active:scale-95 ${socketStatus === 'connected'
                      ? 'bg-[#0c3e35] border-emerald-500/40 text-emerald-300 hover:bg-[#0c4237]'
                      : socketStatus === 'connecting'
                        ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60 animate-pulse'
                        : 'bg-red-950/60 border-red-500/40 text-red-300 hover:bg-red-900/60'
                      }`}
                    title="حالة الاتصال المباشر بالسيرفر (انقر للتفاصيل وإعادة الاتصال)"
                    aria-label="حالة الاتصال المباشر"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${socketStatus === 'connected'
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                        : socketStatus === 'connecting'
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                        }`}
                    />
                    <span className="hidden md:inline">
                      {socketStatus === 'connected' ? 'متصل' : socketStatus === 'connecting' ? 'جاري الاتصال...' : 'البث غير متصل'}
                    </span>
                  </button>

                  {/* TO-DO Agenda Button */}
                  <div className="relative flex items-center">
                    <button
                      onClick={() => {
                        if (onViewChange) {
                          onViewChange(activeView === 'TODOS' ? 'DASHBOARD' : 'TODOS');
                        } else {
                          window.location.href = activeView === 'TODOS' ? '/' : '/todos';
                        }
                      }}
                      className={`relative flex items-center justify-center sm:gap-1.5 w-8 h-8 sm:w-auto sm:px-3 sm:h-10 rounded-lg sm:rounded-xl border transition cursor-pointer shadow-xs active:scale-95 ${
                        activeView === 'TODOS'
                          ? 'bg-[#d4af37] text-[#05261e] border-[#d4af37] font-black'
                          : 'bg-[#0c3e35] text-[#d4af37] border-[#d2d1c9]/20 hover:border-[#d4af37]/40 hover:bg-[#0c4237]'
                      }`}
                      title="أجندة المهام اليومية (TO-DO)"
                      aria-label="أجندة المهام اليومية"
                    >
                      <ListTodo className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline text-xs font-extrabold">
                        {activeView === 'TODOS' ? 'الرئيسية' : 'أجندة المهام'}
                      </span>
                      {pendingTodosCount > 0 && activeView !== 'TODOS' && (
                        <span className="absolute -top-1 -right-1 sm:static sm:mr-1 min-w-[17px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full bg-[#d4af37] text-[#031814] font-black text-[9.5px] sm:text-xs leading-none flex items-center justify-center border border-[#05261e] sm:border-0 shadow-xs tabular-nums select-none">
                          {pendingTodosCount > 99 ? '99+' : pendingTodosCount}
                        </span>
                      )}
                    </button>

                    {/* Quick Drawer Icon Trigger */}
                    <button
                      onClick={() => setShowQuickTodoDrawer(true)}
                      className="hidden md:flex items-center justify-center -mr-1.5 w-5 h-5 rounded-full bg-[#05261e] border border-[#d4af37]/40 text-[#d4af37] hover:bg-[#0c3e35] hover:scale-110 transition text-[11px] font-black cursor-pointer shadow-xs z-10"
                      title="فتح المفكرة السريعة"
                    >
                      +
                    </button>
                  </div>

                  {/* Notifications Bell */}
                  <div ref={notifRef} className="relative">
                    <button
                      onClick={handleOpenNotifications}
                      className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#0c3e35] border border-[#d2d1c9]/20 text-[#d4af37] hover:bg-[#0c4237] hover:border-[#d4af37]/40 transition cursor-pointer shadow-sm active:scale-95"
                      title="التنبيهات اللحظية"
                      aria-label="التنبيهات اللحظية"
                    >
                      <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white font-bold text-[10px] sm:text-[11px] leading-none flex items-center justify-center border-2 border-[#05261e] shadow-md z-10 pointer-events-none select-none tabular-nums">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                      <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] sm:absolute sm:inset-auto sm:left-0 sm:top-auto sm:mt-3 w-auto sm:w-96 bg-[#edece4] border border-[#d2d1c9] rounded-2xl sm:rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fadeIn text-right">
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
                              const isRead = isInboxNotificationRead(n, readNotifIds);

                              return (
                                <div
                                  key={n.id}
                                  onClick={() => handleNotificationClick(n)}
                                  className={`p-3 rounded-2xl border text-xs space-y-1.5 transition cursor-pointer active:scale-[0.99] ${!isRead
                                    ? 'bg-amber-50/90 border-amber-300 shadow-xs hover:bg-amber-100/90 hover:border-amber-400'
                                    : 'bg-white border-[#d2d1c9] hover:border-[#0c3e35] hover:bg-[#f4f3ed]'
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
                                      {isRead ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#edece4] text-[#5e736e]">
                                          تمت القراءة
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white animate-pulse">
                                          جديد
                                        </span>
                                      )}
                                      <span className="text-[10px] text-[#8daaa2] font-medium">{n.time}</span>
                                    </div>
                                  </div>

                                  <p className="text-xs text-[#0c3e35] leading-relaxed font-medium">
                                    {n.message}
                                  </p>

                                  <div className="pt-1 flex items-center justify-between text-[10px] text-[#0c3e35] font-bold border-t border-[#e5e4dc]">
                                    <span>
                                      {n.type === 'announcement'
                                        ? isRead
                                          ? 'انقر لإعادة قراءة نص وتفاصيل التعميم 📖'
                                          : 'انقر لقراءة نص وتفاصيل التعميم 📖'
                                        : n.type === 'feedback'
                                          ? 'انقر لعرض تفاصيل التوجيه والتكليف 📖'
                                          : n.type === 'task'
                                            ? 'انقر لعرض تفاصيل التكليف ومتابعة الإنجاز 📖'
                                            : n.type === 'plan'
                                              ? 'انقر لعرض تفاصيل الخطة المرفوعة 📖'
                                              : 'انقر لعرض تفاصيل ملخص الإنجاز 📖'}
                                    </span>
                                    <ChevronLeft className="w-3 h-3 text-[#0c3e35]" />
                                  </div>
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
                      className="flex items-center gap-1.5 sm:gap-2.5 bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d2d1c9]/20 hover:border-[#d4af37]/40 rounded-lg sm:rounded-xl px-2 sm:px-2.5 h-8 sm:h-10 transition cursor-pointer shadow-sm active:scale-95"
                    >
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-[#05261e] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] font-bold shrink-0 relative">
                        {isGeneralDirector ? (
                          <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d4af37]" />
                        ) : isObserver ? (
                          <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d4af37]" />
                        ) : (
                          <Ship className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#8daaa2]" />
                        )}
                        {/* Live Socket Status Dot on Mobile */}
                        <span
                          className={`sm:hidden absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#05261e] ${
                            socketStatus === 'connected'
                              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
                              : socketStatus === 'connecting'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-xs font-bold text-white leading-tight">
                          {currentUser.fullName}
                        </p>
                        <p className="text-[10px] text-[#d4af37] font-medium leading-tight">
                          {currentUser.title}
                        </p>
                      </div>
                      <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#8daaa2] shrink-0" />
                    </button>

                    {/* User Dropdown */}
                    {showUserMenu && (
                      <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] sm:absolute sm:inset-auto sm:left-0 sm:top-auto sm:mt-3 w-auto sm:w-72 bg-[#edece4] border border-[#d2d1c9] rounded-2xl sm:rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fadeIn text-right p-2.5 space-y-1.5">

                        {/* Mobile User Info Banner */}
                        <div className="md:hidden p-3 rounded-xl bg-[#05261e] text-white border border-[#0c3e35]">
                          <p className="text-xs font-extrabold text-white leading-tight">{currentUser.fullName}</p>
                          <p className="text-[11px] text-[#d4af37] font-bold mt-0.5 leading-tight">{currentUser.title}</p>
                          {currentUser.directorate?.name && (
                            <p className="text-[10px] text-[#8daaa2] font-medium mt-1">
                              {currentUser.directorate.name}
                            </p>
                          )}
                        </div>

                        {/* Mobile: Socket Connection Status Row */}
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowStatusModal(true);
                          }}
                          className="sm:hidden w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-[#0c3e35] bg-white/70 hover:bg-white border border-[#d2d1c9]/50 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                socketStatus === 'connected'
                                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                  : socketStatus === 'connecting'
                                    ? 'bg-amber-500 animate-pulse'
                                    : 'bg-red-500'
                              }`}
                            />
                            <span>البث المباشر:</span>
                          </span>
                          <span className={`text-[11px] font-black ${
                            socketStatus === 'connected' ? 'text-emerald-700' : socketStatus === 'connecting' ? 'text-amber-700' : 'text-red-600'
                          }`}>
                            {socketStatus === 'connected' ? 'متصل لحظياً' : socketStatus === 'connecting' ? 'جاري الاتصال...' : 'غير متصل'}
                          </span>
                        </button>

                        {/* Mobile: Sound Chimes Toggle */}
                        <button
                          onClick={toggleSound}
                          className="sm:hidden w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-[#0c3e35] bg-white/70 hover:bg-white border border-[#d2d1c9]/50 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            {soundOn ? <Volume2 className="w-4 h-4 text-[#0c3e35]" /> : <VolumeX className="w-4 h-4 text-[#8daaa2]" />}
                            <span>نغمات التنبيه الصوتية</span>
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            soundOn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                          }`}>
                            {soundOn ? 'مفعلة' : 'مكتومة'}
                          </span>
                        </button>

                        {/* Option 1: Manage Users (for General Director / Assistant) */}
                        {isGeneralDirector && (
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowUsersModal(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-[#0c3e35] hover:bg-white transition cursor-pointer"
                          >
                            <Users className="w-4 h-4 text-[#0c3e35]" />
                            <span>إدارة المستخدمين والمدراء</span>
                          </button>
                        )}

                        {/* Option: Open TO-DO Agenda */}
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            if (onViewChange) {
                              onViewChange('TODOS');
                            } else {
                              window.location.href = '/todos';
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-[#0c3e35] hover:bg-white transition cursor-pointer"
                        >
                          <ListTodo className="w-4 h-4 text-[#0c3e35]" />
                          <span>أجندة المهام اليومية (TO-DO)</span>
                          {pendingTodosCount > 0 && (
                            <span className="mr-auto min-w-[20px] h-5 px-1.5 rounded-full bg-[#d4af37] text-[#031814] text-[11px] font-bold leading-none flex items-center justify-center shadow-xs tabular-nums">
                              {pendingTodosCount}
                            </span>
                          )}
                        </button>

                        {/* Option 2: Change Own Password */}
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowPasswordModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-[#0c3e35] hover:bg-white transition cursor-pointer"
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
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-700 hover:bg-red-50 transition cursor-pointer"
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
        currentUser={currentUser}
        onClose={() => setSelectedAnnouncement(null)}
      />

      {/* Comprehensive Notification Details Dialog (Tasks, Plans, Summaries) */}
      <NotificationDetailsModal
        data={selectedNotificationDetail}
        isOpen={Boolean(selectedNotificationDetail)}
        onClose={() => setSelectedNotificationDetail(null)}
      />

      {/* Socket Status & Troubleshooting Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#edece4] rounded-2xl border border-[#d2d1c9] shadow-2xl max-w-md w-full p-5 text-right font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-[#d2d1c9]">
              <h3 className="text-base font-extrabold text-[#0c3e35] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#d4af37]" />
                <span>حالة الاتصال والإشعارات</span>
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="p-1 rounded-lg text-gray-500 hover:text-black hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#d2d1c9]">
                <span className="text-[#5e736e] font-bold">حالة الاتصال اللحظي:</span>
                <span className={`px-2.5 py-1 rounded-lg font-extrabold flex items-center gap-1.5 ${socketStatus === 'connected'
                  ? 'bg-emerald-100 text-emerald-800'
                  : socketStatus === 'connecting'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-600' : socketStatus === 'connecting' ? 'bg-amber-600' : 'bg-red-600'
                    }`} />
                  {socketStatus === 'connected' ? 'متصل بنجاح (Online)' : socketStatus === 'connecting' ? 'جاري محاولة الاتصال...' : 'غير متصل (Disconnected)'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white border border-[#d2d1c9] space-y-1">
                <div className="text-[#5e736e] font-bold">رابط السيرفر المباشر:</div>
                <div className="font-mono text-[11px] text-[#0c3e35] break-all dir-ltr text-left bg-gray-100 p-2 rounded-lg">
                  {getSocketStatus().targetUrl || 'غير محدد'}
                </div>
              </div>

              {socketError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  <strong>رسالة الخطأ:</strong> {socketError}
                </div>
              )}

              <div className="p-3 rounded-xl bg-white border border-[#d2d1c9] space-y-2">
                <div className="text-[#0c3e35] font-bold">إشعارات الهاتف أثناء إغلاق التطبيق</div>
                {pushStatus ? (
                  <>
                    <div>خدمة الإرسال: {pushStatus.serverConfigured ? 'مهيأة' : 'تحتاج إلى إعداد على الخادم'}</div>
                    <div>الأجهزة المرتبطة بحسابك: {pushStatus.registeredDevices}</div>
                    <p className="text-[#5e736e] leading-relaxed">يلزم السماح بالإشعارات في إعدادات الهاتف. هذه الحالة تعرض الإعداد والارتباط؛ تأكيد الاستلام يحتاج تجربة على الهاتف.</p>
                  </>
                ) : <p className="text-[#5e736e]">{pushStatusError ? 'تعذر التحقق من حالة إشعارات الهاتف' : 'جاري التحقق...'}</p>}
                {!Capacitor.isNativePlatform() && (
                  <p className="text-[#5e736e] leading-relaxed">الإشعارات أثناء الإغلاق متاحة في تطبيق Android. إشعارات المتصفح تتطلب بقاء الصفحة مفتوحة.</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#d2d1c9]">
              <button
                onClick={() => {
                  forceReconnectSocket();
                }}
                className="flex-1 py-2.5 px-4 bg-[#0c3e35] hover:bg-[#0c4237] text-[#d4af37] font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-sm active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة الاتصال الفوري بالسيرفر</span>
              </button>
              <button
                onClick={() => setShowStatusModal(false)}
                className="py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Slide-Over Todo Drawer */}
      {currentUser && (
        <QuickTodoDrawer
          isOpen={showQuickTodoDrawer}
          onClose={() => setShowQuickTodoDrawer(false)}
          currentUser={currentUser}
          onOpenFullView={() => {
            setShowQuickTodoDrawer(false);
            if (onViewChange) {
              onViewChange('TODOS');
            } else {
              window.location.href = '/todos';
            }
          }}
        />
      )}
    </>
  );
};
