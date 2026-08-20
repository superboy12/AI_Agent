import { io } from 'socket.io-client';

// In production it will connect to the same host
const URL = import.meta.env.PROD ? undefined : 'http://localhost:3000';

export const socket = io(URL as string, {
  autoConnect: true
});
