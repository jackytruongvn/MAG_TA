import { withAuth } from 'next-auth/middleware';

/**
 * Every page except /login requires a Microsoft SSO session.
 * API routes are excluded here because each route handler enforces
 * its own session + role checks (and returns proper 401/403 JSON).
 */
export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
