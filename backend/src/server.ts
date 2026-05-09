import './config'; // validates env vars first
import './tools'; // registers all agent tools
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
import { workflowRoutes, workflowSharedRoutes } from './routes/workflows';
import { scheduleRoutes } from './routes/schedules';
import { aiConfigRoutes } from './routes/ai-config';
import { startScheduler } from './services/scheduler';

const server = Fastify({
  logger:
    config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
});

async function start() {
  await server.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (server-to-server), any chrome-extension://, or explicitly listed origins
      if (!origin || origin.startsWith('chrome-extension://') || config.ALLOWED_ORIGINS.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin '${origin}' not allowed`), false);
      }
    },
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

  // Agent config — lets the extension know which model is active and if key is set
  server.get('/agent/config', async () => ({
    model: process.env.AGENT_MODEL ?? 'claude-sonnet-4-5',
    hasAnthropicKey: !!config.ANTHROPIC_API_KEY,
    version: '1.0.0',
  }));

  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(vaultRoutes, { prefix: '/vault' });
  await server.register(memoryRoutes, { prefix: '/memory' });
  await server.register(preferencesRoutes, { prefix: '/preferences' });
  await server.register(agentRoutes, { prefix: '/agent' });
  await server.register(aiConfigRoutes, { prefix: '/ai-config' });
  await server.register(workflowRoutes, { prefix: '/workflows' });
  await server.register(workflowSharedRoutes, { prefix: '/workflows/shared' });
  await server.register(scheduleRoutes, { prefix: '/schedules' });

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
  startScheduler();
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
