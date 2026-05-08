import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';

interface WorkflowStep {
  id: string;
  command: string;
}

interface WorkflowDocument {
  id: string;
  userId: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  runCount: number;
  lastRun?: string;
  isShared: boolean;
  shareId?: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowCreateBody {
  name: string;
  description?: string;
  steps?: WorkflowStep[];
}

interface WorkflowUpdateBody {
  name?: string;
  description?: string;
  steps?: WorkflowStep[];
}

export async function workflowRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // GET / — list all workflows for user, sorted by updatedAt descending
  fastify.get('/', async (request, reply) => {
    const { uid: userId } = request.user;

    const itemsRef = db.collection('workflows').doc(userId).collection('items');
    const snapshot = await itemsRef.get();

    const workflows: WorkflowDocument[] = snapshot.docs
      .map((doc) => {
        const data = doc.data() as WorkflowDocument;
        if (!data.id) data.id = doc.id;
        return data;
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return reply.send({ success: true, data: workflows });
  });

  // POST / — create workflow
  fastify.post<{ Body: WorkflowCreateBody }>('/', async (request, reply) => {
    const { uid: userId } = request.user;
    const { name, description, steps = [] } = request.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({ success: false, error: 'name is required' });
    }

    const now = new Date().toISOString();

    const docData: WorkflowDocument = {
      id: '',
      userId,
      name: name.trim(),
      description: description ?? undefined,
      steps,
      runCount: 0,
      isShared: false,
      shareId: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const itemsRef = db.collection('workflows').doc(userId).collection('items');
    const docRef = await itemsRef.add(docData);
    await docRef.update({ id: docRef.id });

    const finalDoc: WorkflowDocument = { ...docData, id: docRef.id };

    return reply.status(201).send({ success: true, data: finalDoc });
  });

  // PUT /:id — update name/description/steps (partial, ownership check)
  fastify.put<{ Params: { id: string }; Body: WorkflowUpdateBody }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;
    const body = request.body;

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const existing = docSnap.data() as WorkflowDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    const updates: Partial<WorkflowDocument> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.steps !== undefined) updates.steps = body.steps;

    await docRef.update(updates);

    const updated: WorkflowDocument = { ...existing, ...updates };

    return reply.send({ success: true, data: updated });
  });

  // POST /:id/run — increment runCount + set lastRun = now
  fastify.post<{ Params: { id: string } }>('/:id/run', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const existing = docSnap.data() as WorkflowDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    const updates = {
      runCount: existing.runCount + 1,
      lastRun: now,
      updatedAt: now,
    };

    await docRef.update(updates);

    const updated: WorkflowDocument = { ...existing, ...updates };

    return reply.send({ success: true, data: updated });
  });

  // DELETE /:id — hard delete (ownership check)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const existing = docSnap.data() as WorkflowDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    // Clean up share entry if present
    if (existing.isShared && existing.shareId) {
      await db.collection('sharedWorkflows').doc(existing.shareId).delete();
    }

    await docRef.delete();

    return reply.send({ success: true });
  });

  // POST /:id/share — generate a share link
  fastify.post<{ Params: { id: string } }>('/:id/share', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const existing = docSnap.data() as WorkflowDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const shareId = existing.shareId ?? randomUUID();
    const now = new Date().toISOString();

    await docRef.update({ isShared: true, shareId, updatedAt: now });
    await db.collection('sharedWorkflows').doc(shareId).set({ userId, workflowId: id });

    return reply.send({
      success: true,
      data: { shareId, shareUrl: `https://devflow.ai/shared/${shareId}` },
    });
  });

  // POST /:id/unshare — remove sharing
  fastify.post<{ Params: { id: string } }>('/:id/unshare', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const existing = docSnap.data() as WorkflowDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();

    if (existing.shareId) {
      await db.collection('sharedWorkflows').doc(existing.shareId).delete();
    }

    await docRef.update({ isShared: false, shareId: null, updatedAt: now });

    return reply.send({ success: true });
  });
}

// Public routes (no auth) — registered separately so they don't pick up the preHandler hook
export async function workflowSharedRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /shared/:shareId — public access to a shared workflow
  fastify.get<{ Params: { shareId: string } }>('/:shareId', async (request, reply) => {
    const { shareId } = request.params;

    const shareRef = db.collection('sharedWorkflows').doc(shareId);
    const shareSnap = await shareRef.get();

    if (!shareSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Shared workflow not found' });
    }

    const { userId, workflowId } = shareSnap.data() as { userId: string; workflowId: string };

    const docRef = db.collection('workflows').doc(userId).collection('items').doc(workflowId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Workflow not found' });
    }

    const workflow = docSnap.data() as WorkflowDocument;

    if (!workflow.isShared) {
      return reply.status(404).send({ success: false, error: 'Shared workflow not found' });
    }

    // Return public-safe fields only
    return reply.send({
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        steps: workflow.steps,
        runCount: workflow.runCount,
      },
    });
  });
}
