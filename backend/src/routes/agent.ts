import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/run', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.post<{ Params: { sessionId: string } }>('/cancel/:sessionId', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });
}
