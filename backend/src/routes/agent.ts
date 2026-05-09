import { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { IncomingMessage } from 'http';
import { authMiddleware } from '../middleware/auth';
import { runAgent, cancelSession } from '../services/agent';
import {
  registerConnection,
  sendToUser,
  registerBridgeRequest,
  resolveBridgeRequest,
} from '../services/websocket';
import { randomUUID } from 'crypto';

// Body type for POST /run
interface RunBody {
  command: string;
  currentUrl?: string;
  sessionId?: string; // optional: frontend can pre-generate to avoid race condition
}

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // WebSocket endpoint for real-time progress + bridge
  // @ts-expect-error @fastify/websocket augmentation doesn't apply across workspace hoisting boundaries
  fastify.get('/ws', { websocket: true }, (connection: SocketStream, request: FastifyRequest) => {
    const rawUrl = (request.raw as IncomingMessage).url ?? '';
    const url = new URL(rawUrl, 'http://localhost');
    const userId = url.searchParams.get('userId');
    if (!userId) {
      connection.socket.close(1008, 'userId required');
      return;
    }

    registerConnection(userId, connection.socket);

    connection.socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          requestId?: string;
          success?: boolean;
          data?: Record<string, unknown>;
          error?: string;
        };
        if (msg.type === 'bridge_result' && msg.requestId) {
          resolveBridgeRequest(msg.requestId, {
            success: msg.success ?? false,
            data: msg.data,
            error: msg.error,
          });
        }
      } catch {
        /* ignore parse errors */
      }
    });
  });

  // POST /run — start agent
  fastify.post<{ Body: RunBody }>(
    '/run',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { command, currentUrl, sessionId: clientSessionId } = request.body;

      if (!command || typeof command !== 'string' || !command.trim()) {
        return reply.status(400).send({ success: false, error: 'command is required' });
      }

      // Use the frontend-provided sessionId if present (avoids WebSocket race condition),
      // otherwise generate one here.
      const sessionId = clientSessionId ?? randomUUID();

      const sendProgress = async (type: string, message: string): Promise<void> => {
        sendToUser(userId, {
          sessionId,
          type,
          message,
          timestamp: new Date().toISOString(),
        });
      };

      const sendBridgeAction = async (
        action: string,
        actionParams: Record<string, unknown>,
      ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
        const requestId = randomUUID();
        return new Promise<{
          success: boolean;
          data?: Record<string, unknown>;
          error?: string;
        }>((resolve) => {
          registerBridgeRequest(requestId, resolve);
          sendToUser(userId, {
            sessionId,
            type: 'bridge_request',
            message: JSON.stringify({ requestId, action, params: actionParams }),
            timestamp: new Date().toISOString(),
          });
        });
      };

      // Run agent in background (don't await)
      void runAgent({
        command: command.trim(),
        sessionId,
        userId,
        currentUrl,
        sendProgress,
        sendBridgeAction,
      });

      return reply.send({ success: true, sessionId });
    },
  );

  // POST /cancel/:sessionId
  fastify.post<{ Params: { sessionId: string } }>(
    '/cancel/:sessionId',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { sessionId } = request.params;
      const cancelled = cancelSession(sessionId);
      return reply.send({
        success: cancelled,
        message: cancelled ? 'Session cancellation requested' : 'Session not found',
      });
    },
  );
}
