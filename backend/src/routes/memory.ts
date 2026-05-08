import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function memoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post('/', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.get('/search', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.get('/all', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.put<{ Params: { id: string } }>('/:id', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (_request, reply) => {
    return reply.status(501).send({ success: false, message: 'Not yet implemented' });
  });
}
