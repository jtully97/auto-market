import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/pricing'];

/** Redirect signed-out visitors to /login and signed-in visitors away from auth pages. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has('am_refresh');
  const isPublic = PUBLIC.includes(pathname);

  if (!signedIn && !isPublic) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
