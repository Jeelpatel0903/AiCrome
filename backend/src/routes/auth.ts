import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /auth/me — return current user profile
  fastify.get(
    '/auth/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid, email, name, picture } = request.user;
      return reply.send({
        success: true,
        data: {
          uid,
          email: email ?? null,
          displayName: name ?? null,
          photoURL: picture ?? null,
        },
      });
    },
  );

  // POST /auth/logout — clear session (token revocation handled client-side)
  fastify.post(
    '/auth/logout',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    },
  );
}
