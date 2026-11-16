import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../errors.js';
import { logger } from '../../logger.js';

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, err.message);
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'That already exists' } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  }
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    return res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'That file is too large' } });
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
};
