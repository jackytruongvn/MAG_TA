import type { DefaultSession } from 'next-auth';
import type { Role } from '@/types';

declare module 'next-auth' {
  interface Session {
    user: {
      role: Role;
    } & DefaultSession['user'];
  }
}
