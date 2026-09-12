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
    try {
      socket.disconnect();
    } catch {}
    socket = null;
  }

  if (!socket) {
    cachedTargetUrl = targetSocketUrl;
    notifyStatusChange('connecting');

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
      notifyStatusChange('connected');

      // Immediately join rooms for current user upon connection
      if (currentJoinedUser && socket) {
        socket.emit('join', {
          userId: currentJoinedUser.id,
          role: currentJoinedUser.role,
          directorateId: currentJoinedUser.directorateId,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      notifyStatusChange('disconnected', reason);

      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        setTimeout(() => {
          socket?.connect();
        }, 1000);
      }
    });

    socket.on('connect_error', (error) => {
      notifyStatusChange('error', error.message);
    });

    // Reconnect automatically when app returns from background / network reconnects
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && socket && !socket.connected) {
        notifyStatusChange('connecting');
        socket.connect();
      }
    });

    window.addEventListener('online', () => {
      if (socket && !socket.connected) {
        notifyStatusChange('connecting');
        socket.connect();
      }
    });
  }

  return socket;
};