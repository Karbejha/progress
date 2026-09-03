import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { User, Announcement } from '../types';
import { api } from '../services/api';
import { getSocket, joinUserRooms, onSocketStatusChange, forceReconnectSocket, getSocketStatus, SocketConnectionStatus } from '../lib/socket';
import { playSubtleChime, playUrgentAlert, isSoundEnabled, setSoundEnabled } from '../lib/audio';
import {
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  markAnnouncementAsRead,
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
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UsersManagementModal } from './UsersManagementModal';
import { AnnouncementDetailsModal, AnnouncementModalData } from './AnnouncementDetailsModal';
import {
  initNotificationService,
  requestNotificationPermissions,
  notifyCircular,
  notifyExecutiveTask,
  notifyFeedback,
} from '../lib/notifications';

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
  const [socketStatus, setSocketStatus] = useState<SocketConnectionStatus>('disconnected');
  const [socketError, setSocketError] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [testNotifSending, setTestNotifSending] = useState(false);
  const [testNotifSuccess, setTestNotifSuccess] = useState(false);

  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(true);

  const notifRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementModalData | null>(null);

  const isGeneralDirector =
    currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';

  // Real-time socket status listener
  useEffect(() => {
    const unsubscribe = onSocketStatusChange((status, err) => {
      setSocketStatus(status);
      setSocketError(err || null);
      setIsConnected(status === 'connected');
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

  // Initialize Native Android & Web Notifications
  useEffect(() => {
    initNotificationService();
    if (currentUser) {
      requestNotificationPermissions();
    }

    const handleExternalNotificationClick = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === 'announcement') {
        setSelectedAnnouncement({
          id: detail.id,
          isAnnouncement: true,
          type: 'announcement',
          title: detail.title,
          content: detail.content,
          authorName: detail.authorName || 'المدير العام للموانئ',
          authorTitle: detail.authorTitle || 'المدير العام',
          priority: detail.priority || 'NORMAL',
          createdAt: detail.createdAt,
        });
        setShowNotifications(false);
      } else if (detail.type === 'feedback') {
        setSelectedAnnouncement({
          id: detail.id || `feedback-${Date.now()}`,
          isAnnouncement: false,
          type: 'feedback',
          title: detail.title || 'توجيه وتكليف من المدير العام',
          content: detail.content || detail.feedbackText,
          authorName: detail.fromUserName || detail.authorName || 'المدير العام للموانئ',
          authorTitle: 'المدير العام',
          priority: detail.priority || 'HIGH',
          createdAt: detail.createdAt || new Date().toISOString(),
        });
        setShowNotifications(false);
      }
    };

    window.addEventListener('ports:notification_clicked', handleExternalNotificationClick);
    return () => {
      window.removeEventListener('ports:notification_clicked', handleExternalNotificationClick);
    };
  }, [currentUser]);

  // Load read status & comprehensive notifications (Executive tasks, Announcements, Plans, Summaries)
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Join authorized WebSocket rooms
    joinUserRooms(currentUser);

    // Reset and sync read tracking for this user
    setNotifications([]);
    setUnreadCount(0);
    const initialReads = getReadNotificationIds(currentUser.id);
    setReadNotifIds(initialReads);

    const handleReadUpdate = (e: any) => {
      if (e.detail?.userId === currentUser.id) {
        setReadNotifIds(e.detail.readIds || getReadNotificationIds(currentUser.id));
      }
    };

    window.addEventListener('announcements:read_updated', handleReadUpdate);
    window.addEventListener('notifications:read_updated', handleReadUpdate);

    // Fetch existing historical/offline notifications from server
    const fetchInitialNotifications = async () => {
      try {
        const loadedNotifs: LiveNotification[] = [];
        const currentReads = getReadNotificationIds(currentUser.id);

        if (currentUser.role === 'DIRECTOR') {
          // 1. Fetch Announcements
          try {
            const anns = await api.getAnnouncements();
            const targetAnns = anns.filter((a) => a.authorId !== currentUser.id);
            targetAnns.forEach((a) => {
              loadedNotifs.push({
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
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'اليوم',
                fullPayload: a,
              });
            });
          } catch (err) {
            console.debug('Failed to load announcements in header', err);
          }

          // 2. Fetch Executive Tasks assigned to directorate (including offline tasks)
          if (currentUser.directorateId) {
            try {
              const tasks = await api.getExecutiveTasks({ directorateId: currentUser.directorateId });
              tasks.forEach((t) => {
                loadedNotifs.push({
                  id: `exec-task-${t.id}`,
                  title: t.isShared ? 'تكليف مشترك من المدير العام' : 'تكليف من المدير العام',
                  message: `وردك تكليف من المدير العام: "${t.title}"`,
                  content: t.description || t.title,
                  authorName: t.assignedBy?.fullName || 'المدير العام للموانئ',
                  authorTitle: t.assignedBy?.title || 'المدير العام',
                  priority: t.priority,
                  createdAt: t.createdAt,
                  type: 'feedback',
                  time: t.createdAt
                    ? new Date(t.createdAt).toLocaleDateString('ar-SY', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'اليوم',
                  fullPayload: {
                    ...t,
                    title: t.title,
                    content: t.description || t.title,
                    authorName: t.assignedBy?.fullName || 'المدير العام للموانئ',
                  },
                });
              });
            } catch (err) {
              console.debug('Failed to load executive tasks in header', err);
            }
          }
        } else if (currentUser.role === 'GENERAL_DIRECTOR' || currentUser.role === 'ASSISTANT_DIRECTOR') {
          // 1. Fetch Executive Overview (Today's submitted plans and summaries)
          try {
            const overview = await api.getExecutiveOverview();
            if (overview.directorates) {
              overview.directorates.forEach((d) => {
                if (d.hasPlan) {
                  loadedNotifs.push({
                    id: `plan-sub-${d.directorateId}-${overview.date}`,
                    title: 'رفع خطة صباحية',
                    message: `قامت (${d.directorateName}) باعتماد ورفع خطة اليوم (${d.tasksCount || 0} مهام).`,
                    type: 'plan',
                    time: 'اليوم',
                    createdAt: d.planSubmittedAt || overview.date,
                    fullPayload: d,
                  });
                }

                if (d.hasSummary) {
                  loadedNotifs.push({
                    id: `summary-sub-${d.directorateId}-${overview.date}`,
                    title: 'تسليم ملخص الإنجاز',
                    message: `سلّمت (${d.directorateName}) ملخص نهاية الدوام بنسبة إنجاز ${d.completionRate || 0}%.`,
                    priority: d.urgentFlag ? 'URGENT' : 'NORMAL',
                    type: 'summary',
                    time: 'اليوم',
                    createdAt: d.summarySubmittedAt || overview.date,
                    fullPayload: d,
                  });
                }
              });
            }
          } catch (err) {
            console.debug('Failed to load executive overview in header', err);
          }

          // 2. Fetch Executive Task progress updates
          try {
            const allTasks = await api.getExecutiveTasks();
            allTasks
              .filter((t) => t.completionPercentage > 0 || t.status === 'COMPLETED' || t.completionNote)
              .slice(0, 10)
              .forEach((t) => {
                loadedNotifs.push({
                  id: `exec-task-update-${t.id}-${t.updatedAt}`,
                  title: 'تحديث إنجاز تكليف المدير العام',
                  message: `قامت (${t.directorate?.name}) بتحديث التكليف "${t.title}" إلى (${t.completionPercentage}%).`,
                  type: 'task',
                  time: t.updatedAt
                    ? new Date(t.updatedAt).toLocaleDateString('ar-SY', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'مؤخراً',
                  createdAt: t.updatedAt,
                  fullPayload: t,
                });
              });
          } catch (err) {
            console.debug('Failed to load executive task updates in header', err);
          }
        }

        // Sort notifications by date descending
        loadedNotifs.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });

        // Compute unread count
        const unreadItems = loadedNotifs.filter((n) => !currentReads.includes(n.id));
        setUnreadCount(unreadItems.length);

        setNotifications(loadedNotifs);
      } catch (err) {
        console.error('Failed to load initial notifications in header', err);
      }
    };

    fetchInitialNotifications();

    return () => {
      window.removeEventListener('announcements:read_updated', handleReadUpdate);
      window.removeEventListener('notifications:read_updated', handleReadUpdate);
    };
  }, [currentUser]);

  // Real-time Socket Event Listeners with Safe Named Callbacks
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (socket.connected && currentUser) {
      joinUserRooms(currentUser);
    }

    const handleConnect = () => {
      if (currentUser) {
        joinUserRooms(currentUser);
      }
    };

    const addNotif = (notif: Omit<LiveNotification, 'id' | 'time'> & { id?: string }) => {
      const newN: LiveNotification = {
        ...notif,
        id: notif.id || Math.random().toString(),
        time: new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }),
      };
      setNotifications((prev) => [newN, ...prev.filter((p) => p.id !== newN.id).slice(0, 30)]);
      setUnreadCount((c) => c + 1);
    };

    const handlePlanSubmitted = (data: any) => {
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        id: `plan-sub-${data.directorateId || Math.random()}-${new Date().toISOString().split('T')[0]}`,
        title: 'رفع خطة صباحية',
        message: `قامت ${data.directorateName} باعتماد خطة اليوم (${data.tasksCount} مهام).`,
        type: 'plan',
        fullPayload: data,
      });
      playSubtleChime();
    };

    const handleTaskUpdated = (data: any) => {
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        id: `task-up-${data.taskId || Math.random()}`,
        title: 'تحديث حالة مهمة',
        message: `قامت ${data.directorateName} بتحديث: "${data.taskTitle}" (${data.completionPercentage}%).`,
        type: 'task',
        fullPayload: data,
      });
    };

    const handleSummarySubmitted = (data: any) => {
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (!isExec) return;

      addNotif({
        id: `summary-sub-${data.directorateId || Math.random()}-${new Date().toISOString().split('T')[0]}`,
        title: 'تسليم ملخص الإنجاز',
        message: `سلّمت ${data.directorateName} ملخص نهاية الدوام بنسبة ${data.overallCompletionRate}%.`,
        type: 'summary',
        fullPayload: data,
      });
      if (data.urgentFlag) {
        playUrgentAlert();
      } else {
        playSubtleChime();
      }
    };

    const handleFeedbackSent = (data: any) => {
      if (currentUser?.role === 'DIRECTOR' && currentUser?.directorateId && currentUser.directorateId === data.directorateId) {
        addNotif({
          id: `feedback-${Math.random()}`,
          title: 'توجيه من المدير العام',
          message: data.feedbackText,
          content: data.feedbackText,
          authorName: data.fromUserName || 'المدير العام',
          type: 'feedback',
          fullPayload: data,
        });
        playSubtleChime();

        notifyFeedback({
          directorateId: data.directorateId,
          fromUserName: data.fromUserName,
          feedbackText: data.feedbackText,
          rating: data.rating,
        });
      }
    };

    const handleAnnouncementCreated = (data: any) => {
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

      if (data.priority === 'URGENT' || data.priority === 'HIGH') {
        playUrgentAlert();
      } else {
        playSubtleChime();
      }

      notifyCircular({
        id: data.id,
        title: data.title,
        content: data.content,
        authorName: data.authorName || 'المدير العام للموانئ',
        authorTitle: data.authorTitle || 'المدير العام',
        priority: data.priority || 'NORMAL',
        createdAt: data.createdAt || new Date().toISOString(),
      });
    };

    const handleExecutiveTaskCreated = (data: any) => {
      if (currentUser?.role === 'DIRECTOR' && currentUser?.directorateId === data.directorateId) {
        addNotif({
          id: `exec-task-${data.task?.id || Math.random()}`,
          title: data.task?.isShared ? 'تكليف مشترك من المدير العام' : 'تكليف جديد من المدير العام',
          message: `وردك تكليف من المدير العام: "${data.task?.title}"`,
          content: data.task?.description || data.task?.title,
          authorName: data.assignedByName || 'المدير العام',
          priority: data.task?.priority || 'NORMAL',
          type: 'feedback',
          fullPayload: data,
        });
        playUrgentAlert();

        notifyExecutiveTask({
          id: data.task?.id || `${Date.now()}`,
          title: data.task?.title,
          directorateName: data.directorateName,
          assignedByName: data.assignedByName,
          isShared: data.task?.isShared,
        });
      }
    };

    const handleExecutiveTaskUpdated = (data: any) => {
      const isExec = currentUser?.role === 'GENERAL_DIRECTOR' || currentUser?.role === 'ASSISTANT_DIRECTOR';
      if (isExec && data.updatedByRole === 'DIRECTOR') {
        addNotif({
          id: `exec-task-update-${data.task?.id || Math.random()}-${new Date().getTime()}`,
          title: 'تحديث إنجاز تكليف المدير العام',
          message: `قامت (${data.directorateName}) بتحديث التكليف "${data.task?.title}" إلى (${data.task?.completionPercentage}%).`,
          type: 'task',
          fullPayload: data,
        });
        playSubtleChime();
      }
    };

    socket.on('connect', handleConnect);
    socket.on('plan:submitted', handlePlanSubmitted);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('summary:submitted', handleSummarySubmitted);
    socket.on('feedback:sent', handleFeedbackSent);
    socket.on('announcement:created', handleAnnouncementCreated);
    socket.on('executive-task:created', handleExecutiveTaskCreated);
    socket.on('executive-task:updated', handleExecutiveTaskUpdated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('plan:submitted', handlePlanSubmitted);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('summary:submitted', handleSummarySubmitted);
      socket.off('feedback:sent', handleFeedbackSent);
      socket.off('announcement:created', handleAnnouncementCreated);
      socket.off('executive-task:created', handleExecutiveTaskCreated);
      socket.off('executive-task:updated', handleExecutiveTaskUpdated);
    };
  }, [currentUser]);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    const allIds = notifications.map((n) => n.id);
    if (allIds.length > 0) {
      markAllNotificationsAsRead(currentUser.id, allIds);
      setReadNotifIds((prev) => Array.from(new Set([...prev, ...allIds])));

      // Also trigger server-side read for announcements
      notifications
        .filter((n) => n.type === 'announcement' && n.id)
        .forEach((n) => {
          api.markAnnouncementRead(n.id).catch(() => {});
        });
    }

    setUnreadCount(0);
  };

  const handleNotificationClick = (n: LiveNotification) => {
    if (currentUser && n.id) {
      markNotificationAsRead(currentUser.id, n.id);
      setReadNotifIds((prev) => Array.from(new Set([...prev, n.id])));
      setUnreadCount((c) => Math.max(0, c - 1));

      if (n.type === 'announcement') {
        markAnnouncementAsRead(currentUser.id, n.id);
        api.markAnnouncementRead(n.id).catch(() => {});
      }
    }

    if (n.type === 'announcement') {
      setSelectedAnnouncement({
        id: n.id,
        isAnnouncement: true,
        type: 'announcement',
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
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#05261e] border-b border-[#0c3e35] shadow-md transition-all font-sans pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[3.75rem] sm:h-20 py-2 sm:py-0 gap-2">
            
            {/* Logo & Title */}
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center p-1.5 shadow-md shrink-0">
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
                  <span className="text-[9.5px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-[#0c3e35] text-[#d4af37] border border-[#d4af37]/30 whitespace-nowrap">
                    المديرية العامة للموانئ
                  </span>
                  <span className="text-[10px] text-[#8daaa2] hidden md:inline font-medium">
                    • الجمهورية العربية السورية
                  </span>
                </div>
                <h1 className="text-xs sm:text-base md:text-lg font-extrabold text-white tracking-tight mt-0.5 truncate leading-snug">
                  <span className="inline sm:hidden">منظومة المتابعة اليومية</span>
                  <span className="hidden sm:inline">منظومة متابعة الخطط والإنجاز اليومي</span>
                </h1>
              </div>
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 relative shrink-0">
              {currentUser && (
                <>
                  {/* Sound Chimes Toggle Button */}
                  <button
                    onClick={toggleSound}
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border transition cursor-pointer shadow-sm active:scale-95 ${
                      soundOn
                        ? 'bg-[#0c3e35] border-[#d4af37]/30 text-[#d4af37] hover:bg-[#0c4237]'
                        : 'bg-[#05261e] border-[#5e736e]/40 text-[#8daaa2] hover:text-white'
                    }`}
                    title={soundOn ? 'نغمات التنبيه الصوتية مفعلة (انقر للكتم)' : 'نغمات التنبيه الصوتية مكتومة (انقر للتفعيل)'}
                    aria-label="تبديل نغمة التنبيه"
                  >
                    {soundOn ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </button>

                  {/* Real-time Socket Connection Status Badge */}
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className={`flex items-center gap-1.5 px-2 sm:px-2.5 h-8 sm:h-10 rounded-lg sm:rounded-xl border transition cursor-pointer shadow-sm text-[10px] sm:text-xs font-bold active:scale-95 ${
                      socketStatus === 'connected'
                        ? 'bg-[#0c3e35] border-emerald-500/40 text-emerald-300 hover:bg-[#0c4237]'
                        : socketStatus === 'connecting'
                        ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60 animate-pulse'
                        : 'bg-red-950/60 border-red-500/40 text-red-300 hover:bg-red-900/60'
                    }`}
                    title="حالة الاتصال المباشر بالسيرفر (انقر للتفاصيل وإعادة الاتصال)"
                    aria-label="حالة الاتصال المباشر"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        socketStatus === 'connected'
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                          : socketStatus === 'connecting'
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="hidden md:inline">
                      {socketStatus === 'connected' ? 'بث مباشر متصل' : socketStatus === 'connecting' ? 'جاري الاتصال...' : 'البث غير متصل'}
                    </span>
                  </button>

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
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-4.5 sm:min-w-[20px] sm:h-5 px-1 rounded-full bg-red-600 text-white font-black text-[9px] sm:text-[10px] leading-none flex items-center justify-center border-2 border-[#05261e] shadow-md z-10 pointer-events-none select-none">
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

                        {/* Test Notification Banner Inside Dropdown */}
                        <div className="p-2.5 bg-[#f4f3ed] border-b border-[#d2d1c9] flex items-center justify-between gap-2">
                          <button
                            onClick={async () => {
                              setTestNotifSending(true);
                              try {
                                await requestNotificationPermissions();
                                await notifyCircular({
                                  id: 'test-' + Date.now(),
                                  title: 'إشعار تجريبي لاختبار الموبايل',
                                  content: 'تم استقبال هذا التنبيه بنجاح واختبار الصوت والاهتزاز وشريط الإشعارات على هاتفك.',
                                  authorName: 'المدير العام للموانئ',
                                  priority: 'HIGH',
                                  createdAt: new Date().toISOString(),
                                });
                                playUrgentAlert();
                                setTestNotifSuccess(true);
                                setTimeout(() => setTestNotifSuccess(false), 3000);
                              } catch (e) {
                                console.error('Test notification error:', e);
                              } finally {
                                setTestNotifSending(false);
                              }
                            }}
                            disabled={testNotifSending}
                            className={`w-full py-2 px-3 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs active:scale-95 border ${
                              testNotifSuccess
                                ? 'bg-emerald-700 text-white border-emerald-600'
                                : 'bg-[#0c3e35] hover:bg-[#0c4237] text-[#d4af37] border-[#d4af37]/30'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{testNotifSuccess ? 'تم إرسال الإشعار التجريبي لهاتفك بنجاح!' : testNotifSending ? 'جاري الاختبار...' : '🔔 اختبار إشعار الموبايل الفوري (صوت واهتزاز)'}</span>
                          </button>
                        </div>

                        <div className="max-h-80 overflow-y-auto p-3 space-y-2">
                          {notifications.length === 0 ? (
                            <div className="text-center py-8 text-xs text-[#5e736e]">
                              لا توجد تنبيهات جديدة حتى الآن
                            </div>
                          ) : (
                            notifications.map((n) => {
                              const isClickable = n.type === 'announcement' || n.type === 'feedback';
                              const isRead = readNotifIds.includes(n.id);

                              return (
                                <div
                                  key={n.id}
                                  onClick={() => isClickable && handleNotificationClick(n)}
                                  className={`p-3 rounded-2xl border text-xs space-y-1.5 transition ${
                                    !isRead
                                      ? 'bg-amber-50/85 border-amber-300 shadow-xs hover:bg-amber-100/80 cursor-pointer'
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

                                  {isClickable && (
                                    <div className="pt-1 flex items-center justify-between text-[10px] text-[#0c3e35] font-bold border-t border-[#e5e4dc]">
                                      <span>
                                        {n.type === 'announcement'
                                          ? isRead
                                            ? 'انقر لإعادة قراءة نص وتفاصيل التعميم 📖'
                                            : 'انقر لقراءة نص وتفاصيل التعميم 📖'
                                          : 'انقر لعرض تفاصيل التكليف والتوجيه 📖'}
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
                      className="flex items-center gap-1.5 sm:gap-2.5 bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d2d1c9]/20 hover:border-[#d4af37]/40 rounded-lg sm:rounded-xl px-2 sm:px-2.5 h-8 sm:h-10 transition cursor-pointer shadow-sm"
                    >
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md sm:rounded-lg bg-[#05261e] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37] font-bold shrink-0">
                        {isGeneralDirector ? <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d4af37]" /> : <Ship className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#8daaa2]" />}
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
                      <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] sm:absolute sm:inset-auto sm:left-0 sm:top-auto sm:mt-3 w-auto sm:w-64 bg-[#edece4] border border-[#d2d1c9] rounded-2xl sm:rounded-[24px] shadow-2xl overflow-hidden z-50 animate-fadeIn text-right p-2 space-y-1">
                        
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
        currentUser={currentUser}
        onClose={() => setSelectedAnnouncement(null)}
      />

      {/* Socket Status & Troubleshooting Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#edece4] rounded-2xl border border-[#d2d1c9] shadow-2xl max-w-md w-full p-5 text-right font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-[#d2d1c9]">
              <h3 className="text-base font-extrabold text-[#0c3e35] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#d4af37]" />
                <span>حالة الاتصال المباشر بالخادم (Real-time Gateway)</span>
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
                <span className={`px-2.5 py-1 rounded-lg font-extrabold flex items-center gap-1.5 ${
                  socketStatus === 'connected'
                    ? 'bg-emerald-100 text-emerald-800'
                    : socketStatus === 'connecting'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    socketStatus === 'connected' ? 'bg-emerald-600' : socketStatus === 'connecting' ? 'bg-amber-600' : 'bg-red-600'
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

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] leading-relaxed">
                💡 <strong>معلومة:</strong> يعمل هذا الاتصال على استلام التعاميم الإدارية والتكاليف اللحظية فور صدورها من المدير العام وإرسال إشعار فوري لهاتفك المحمول.
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
    </>
  );
};
