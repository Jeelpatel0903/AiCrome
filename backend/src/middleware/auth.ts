import { FastifyRequest, FastifyReply } from 'fastify';
import { auth } from '../services/firebase';
import type { DecodedIdToken } from 'firebase-admin/auth';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: 'Unauthorized: missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const decodedToken = await auth.verifyIdToken(token);
    request.user = decodedToken;
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (
      error.code === 'auth/id-token-expired' ||
      error.code === 'auth/argument-error'
    ) {
      return reply.status(401).send({
        success: false,
        error: 'Session expired, please login again',
      });
    }
    request.log.warn({ err }, 'Token verification failed');
    return reply.status(401).send({
      success: false,
      error: 'Unauthorized: invalid token',
    });
  }
}

// Extend FastifyRequest to include `user`
declare module 'fastify' {
  interface FastifyRequest {
    user: DecodedIdToken;
  }
}
