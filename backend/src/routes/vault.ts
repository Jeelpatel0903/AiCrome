import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

const STUB = { success: true, message: 'Not yet implemented' };

export async function vaultRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /vault/identity — create a new identity
  fastify.post(
    '/vault/identity',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );

  // GET /vault/identities — list all identities for user
  fastify.get(
    '/vault/identities',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );

  // GET /vault/identity/by-name/:name — find identity by name
  fastify.get(
    '/vault/identity/by-name/:name',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );

  // GET /vault/identity/by-site — find identity by site URL
  fastify.get(
    '/vault/identity/by-site',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );

  // PUT /vault/identity/:id — update an identity
  fastify.put(
    '/vault/identity/:id',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );

  // DELETE /vault/identity/:id — delete an identity
  fastify.delete(
    '/vault/identity/:id',
    { preHandler: authMiddleware },
    async (_request, reply) => reply.send(STUB),
  );
}
