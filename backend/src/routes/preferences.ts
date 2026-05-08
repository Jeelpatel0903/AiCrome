import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function preferencesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/site', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.get('/site', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.put<{ Params: { id: string } }>('/site/:id', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.delete<{ Params: { id: string } }>('/site/:id', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });
}
