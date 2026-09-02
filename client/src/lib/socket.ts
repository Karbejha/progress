'use client';

import { io, Socket } from 'socket.io-client';
import { User } from '../types';
import { getApiBaseUrl } from '../services/api';

let socket: Socket | null = null;
let currentJoinedUser: User | null = null;

export const joinUserRooms = (user: User | null) => {
  currentJoinedUser = user;
  if (!socket || !socket.connected || !user) return;

  socket.emit('join', {
    userId: user.id,
    role: user.role,
    directorateId: user.directorateId,
  });
  console.log(`🔐 Socket room joined for ${user.fullName} (Role: ${user.role})`);
};

export const getSocket = (): Socket => {
  if (!socket && typeof window !== 'undefined') {
    const socketUrl = getApiBaseUrl().replace(/\/api\/?$/, '');
    socket = io(socketUrl, {
      path: '/socket.io',
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to Ports Real-Time Gateway:', socket?.id);
      if (currentJoinedUser) {
        joinUserRooms(currentJoinedUser);
      }
    });

    socket.io.engine.on('upgrade', (transport) => {
      console.log('⬆️ Socket.IO transport upgraded to:', transport.name);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from Real-Time Gateway:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error.message);
    });
  }

  return socket!;
};