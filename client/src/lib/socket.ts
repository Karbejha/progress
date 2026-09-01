'use client';

import { io, Socket } from 'socket.io-client';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// REST API في الإنتاج:
// https://progress.gdp.gov.sy/api
//
// Socket.IO يجب أن يتصل على:
// https://progress.gdp.gov.sy
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket && typeof window !== 'undefined') {
    socket = io(SOCKET_URL, {
      path: '/socket.io',

      autoConnect: true,

      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log(
        '⚡ Connected to Ports Real-Time Gateway:',
        socket?.id,
      );

      console.log(
        '📡 Socket transport:',
        socket?.io.engine.transport.name,
      );
    });

    socket.io.engine.on('upgrade', (transport) => {
      console.log(
        '⬆️ Socket.IO transport upgraded to:',
        transport.name,
      );
    });

    socket.on('disconnect', (reason) => {
      console.log(
        '🔌 Disconnected from Real-Time Gateway:',
        reason,
      );
    });

    socket.on('connect_error', (error) => {
      console.error(
        '❌ Socket.IO connection error:',
        error.message,
      );
    });
  }

  return socket!;
};