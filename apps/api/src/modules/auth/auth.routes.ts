import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@automarket/shared';
import { defineRoutes } from '../../core/http/router.js';
import { authController } from './auth.controller.js';

export default defineRoutes('/auth', (r) => {
  r.post('/register', { auth: 'public', body: registerSchema }, authController.register);
  r.post('/login', { auth: 'public', body: loginSchema }, authController.login);
  r.post('/refresh', { auth: 'public' }, authController.refresh);
  r.post('/logout', { auth: 'public' }, authController.logout);
  r.get('/me', { auth: 'user' }, authController.me);
  r.post(
    '/forgot-password',
    { auth: 'public', body: forgotPasswordSchema },
    authController.forgotPassword,
  );
  r.post(
    '/reset-password',
    { auth: 'public', body: resetPasswordSchema },
    authController.resetPassword,
  );
});
