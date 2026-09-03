'use client';

import { io, Socket } from 'socket.io-client';
import { User } from '../types';
import { getApiBaseUrl } from '../services/api';

export type SocketConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

let socket: Socket | null = null;
let currentJoinedUser: User | null = null;
let cachedTargetUrl: string = '';
let connectionStatus: SocketConnectionStatus = 'disconnected';
let lastErrorMessage: string | null = null;
const statusListeners = new Set<(status: SocketConnectionStatus, error?: string | null) => void>();

function notifyStatusChange(status: SocketConnectionStatus, error?: string | null) {
  connectionStatus = status;
  lastErrorMessage = error || null;
  statusListeners.forEach((listener) => {
    try {
      listener(status, lastErrorMessage);
    } catch (e) {
      console.error('Error in socket status listener:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('ports:socket_status_changed', {
        detail: { status, error: lastErrorMessage, socketId: socket?.id, url: cachedTargetUrl },
      })
    );
  }
}

export const onSocketStatusChange = (
  listener: (status: SocketConnectionStatus, error?: string | null) => void
): (() => void) => {
  statusListeners.add(listener);
  listener(connectionStatus, lastErrorMessage);
  return () => {
    statusListeners.delete(listener);
  };
};

export const getSocketStatus = () => {
  return {
    isConnected: socket?.connected || false,
    status: connectionStatus,
    lastError: lastErrorMessage,
    socketId: socket?.id || null,
    targetUrl: cachedTargetUrl,
    joinedUser: currentJoinedUser?.fullName || null,
  };
};

export const joinUserRooms = (user: User | null) => {
  currentJoinedUser = user;
  const s = getSocket();
  if (!s || !user) return;

  if (s.connected) {
    s.emit('join', {
      userId: user.id,
      role: user.role,
      directorateId: user.directorateId,
    });
    console.log(`🔐 Socket room joined for ${user.fullName} (Role: ${user.role}) on socket ${s.id}`);
  } else {
    // If socket isn't connected yet, ensure connection attempt is active
    s.connect();
  }
};

export const forceReconnectSocket = (): Socket => {
  if (socket) {
    try {
      socket.disconnect();
    } catch {}
    socket = null;
  }
  return getSocket();
};

export const getSocket = (): Socket => {
  if (typeof window === 'undefined') return null as any;

  const targetSocketUrl = getApiBaseUrl().replace(/\/api\/?$/, '');

  // If the server URL in settings changed, recreate socket connection to the new URL
  if (socket && cachedTargetUrl && cachedTargetUrl !== targetSocketUrl) {
    console.log(`🔄 Server API URL changed from "${cachedTargetUrl}" to "${targetSocketUrl}". Reconnecting socket...`);
    try {
      socket.disconnect();
    } catch {}
    socket = null;
  }

  if (!socket) {
    cachedTargetUrl = targetSocketUrl;
    notifyStatusChange('connecting');

    console.log(`🔌 Initializing Ports Real-Time Gateway to: ${targetSocketUrl}`);
    socket = io(targetSocketUrl, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });

    socket.on('connect', () => {
      console.log(`⚡ Connected to Ports Real-Time Gateway! ID: ${socket?.id} (URL: ${cachedTargetUrl})`);
      notifyStatusChange('connected');

      // Immediately join rooms for current user upon connection
      if (currentJoinedUser && socket) {
        socket.emit('join', {
          userId: currentJoinedUser.id,
          role: currentJoinedUser.role,
          directorateId: currentJoinedUser.directorateId,
        });
        console.log(`🔐 Auto-joined socket rooms for ${currentJoinedUser.fullName}`);
      }
    });

    socket.io.engine.on('upgrade', (transport) => {
      console.log('⬆️ Socket.IO transport upgraded to:', transport.name);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from Real-Time Gateway:', reason);
      notifyStatusChange('disconnected', reason);

      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        setTimeout(() => {
          socket?.connect();
        }, 1000);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error.message);
      notifyStatusChange('error', error.message);
    });

    // Reconnect automatically when app returns from background / network reconnects
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket && !socket.connected) {
        console.log('📱 App resumed from background - reconnecting real-time socket...');
        notifyStatusChange('connecting');
        socket.connect();
      }
    });

    window.addEventListener('online', () => {
      console.log('🌐 Network online detected - reconnecting real-time socket...');
      if (socket && !socket.connected) {
        notifyStatusChange('connecting');
        socket.connect();
      }
    });
  }

  return socket;
};