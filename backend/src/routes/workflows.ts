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

    await docRef.delete();

    return reply.send({ success: true });
  });
}
