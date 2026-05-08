import './config'; // validates env vars first
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { vaultRoutes } from './routes/vault';
import { memoryRoutes } from './routes/memory';
import { preferencesRoutes } from './routes/preferences';
import { agentRoutes } from './routes/agent';

const server = Fastify({
  logger:
    config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
});

async function start() {
  await server.register(cors, {
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await server.register(websocket);

  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  }));

  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(vaultRoutes, { prefix: '/vault' });
  await server.register(memoryRoutes, { prefix: '/memory' });
  await server.register(preferencesRoutes, { prefix: '/preferences' });
  await server.register(agentRoutes, { prefix: '/agent' });

  server.setErrorHandler((error, _request, reply) => {
    server.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      success: false,
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  const shutdown = async () => {
    server.log.info('Shutting down server...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.listen({ port: config.PORT, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
