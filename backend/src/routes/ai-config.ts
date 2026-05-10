import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';
import { encrypt } from '../services/encryption';
import { validateProviderModel } from '../services/ai-provider';
import { config } from '../config';
import type { AIProvider, AIConfigPublic } from '@devflow/shared';

interface PutBody {
  provider: AIProvider;
  model: string;
  apiKey: string;
}

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'deepseek', 'github'];

export async function aiConfigRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /ai-config — returns current config without exposing the API key
  fastify.get('/', { preHandler: authMiddleware }, async (request, reply) => {
    const { uid } = request.user;

    const docRef = db.collection('aiConfig').doc(uid).collection('settings').doc('active');
    const snap = await docRef.get();

    if (snap.exists) {
      const data = snap.data()!;
      if (data.enabled as boolean) {
        return reply.send({
          success: true,
          data: {
            provider: data.provider as AIProvider,
            model: data.model as string,
            hasKey: !!(data.encryptedApiKey as string),
            source: 'db',
            enabled: true,
          } satisfies AIConfigPublic,
        });
      }
    }

    // No active DB config — report env fallback status
    return reply.send({
      success: true,
      data: {
        provider: 'anthropic',
        model: process.env.AGENT_MODEL ?? 'claude-sonnet-4-5',
        hasKey: !!config.ANTHROPIC_API_KEY,
        source: 'env',
        enabled: false,
      } satisfies AIConfigPublic,
    });
  });

  // PUT /ai-config — save provider + model + API key
  fastify.put<{ Body: PutBody }>('/', { preHandler: authMiddleware }, async (request, reply) => {
    const { uid } = request.user;
    const { provider, model, apiKey } = request.body;

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return reply.status(400).send({ success: false, error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }

    // Validate model belongs to this provider
    if (!validateProviderModel(provider, model)) {
      return reply.status(400).send({ success: false, error: `Model '${model}' is not valid for provider '${provider}'` });
    }

    // Validate API key
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return reply.status(400).send({ success: false, error: 'apiKey is required' });
    }

    const encryptedApiKey = encrypt(apiKey.trim());
    const now = new Date().toISOString();

    const docRef = db.collection('aiConfig').doc(uid).collection('settings').doc('active');
    const snap = await docRef.get();

    await docRef.set({
      provider,
      model,
      encryptedApiKey,
      enabled: true,
      createdAt: snap.exists ? (snap.data()!.createdAt as string) : now,
      updatedAt: now,
    });

    fastify.log.info({ uid, provider, model, source: 'db' }, 'AI config updated');

    return reply.send({ success: true });
  });

  // DELETE /ai-config — soft-disable DB config, revert to env var fallback
  fastify.delete('/', { preHandler: authMiddleware }, async (request, reply) => {
    const { uid } = request.user;

    const docRef = db.collection('aiConfig').doc(uid).collection('settings').doc('active');
    const snap = await docRef.get();

    if (snap.exists) {
      await docRef.update({ enabled: false, updatedAt: new Date().toISOString() });
    }

    fastify.log.info({ uid }, 'AI config reset to env fallback');
    return reply.send({ success: true });
  });
}
