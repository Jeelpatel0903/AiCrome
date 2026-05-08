import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';

interface ScheduleDocument {
  id: string;
  userId: string;
  command: string;
  cronExpression: string;
  humanReadable: string;
  isActive: boolean;
  lastRun?: string;
  lastRunStatus?: 'success' | 'failure';
  createdAt: string;
  updatedAt: string;
}

interface ScheduleCreateBody {
  command: string;
  cronExpression: string;
  humanReadable?: string;
}

interface ScheduleUpdateBody {
  command?: string;
  cronExpression?: string;
  humanReadable?: string;
  isActive?: boolean;
  lastRun?: string;
  lastRunStatus?: 'success' | 'failure';
}

export async function scheduleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // GET / — list all schedules for user, sorted by createdAt descending
  fastify.get('/', async (request, reply) => {
    const { uid: userId } = request.user;

    const itemsRef = db.collection('schedules').doc(userId).collection('items');
    const snapshot = await itemsRef.get();

    const schedules: ScheduleDocument[] = snapshot.docs
      .map((doc) => {
        const data = doc.data() as ScheduleDocument;
        if (!data.id) data.id = doc.id;
        return data;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return reply.send({ success: true, data: schedules });
  });

  // POST / — create schedule
  fastify.post<{ Body: ScheduleCreateBody }>('/', async (request, reply) => {
    const { uid: userId } = request.user;
    const { command, cronExpression, humanReadable } = request.body;

    if (!command || typeof command !== 'string' || !command.trim()) {
      return reply.status(400).send({ success: false, error: 'command is required' });
    }

    if (!cronExpression || typeof cronExpression !== 'string' || !cronExpression.trim()) {
      return reply.status(400).send({ success: false, error: 'cronExpression is required' });
    }

    const now = new Date().toISOString();

    const docData: ScheduleDocument = {
      id: '',
      userId,
      command: command.trim(),
      cronExpression: cronExpression.trim(),
      humanReadable: humanReadable ?? '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const itemsRef = db.collection('schedules').doc(userId).collection('items');
    const docRef = await itemsRef.add(docData);
    await docRef.update({ id: docRef.id });

    const finalDoc: ScheduleDocument = { ...docData, id: docRef.id };

    return reply.status(201).send({ success: true, data: finalDoc });
  });

  // PUT /:id — update any field including isActive (partial, ownership check)
  fastify.put<{ Params: { id: string }; Body: ScheduleUpdateBody }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;
    const body = request.body;

    const docRef = db.collection('schedules').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Schedule not found' });
    }

    const existing = docSnap.data() as ScheduleDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    const updates: Partial<ScheduleDocument> = { updatedAt: now };

    if (body.command !== undefined) updates.command = body.command.trim();
    if (body.cronExpression !== undefined) updates.cronExpression = body.cronExpression.trim();
    if (body.humanReadable !== undefined) updates.humanReadable = body.humanReadable;
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    if (body.lastRun !== undefined) updates.lastRun = body.lastRun;
    if (body.lastRunStatus !== undefined) updates.lastRunStatus = body.lastRunStatus;

    await docRef.update(updates);

    const updated: ScheduleDocument = { ...existing, ...updates };

    return reply.send({ success: true, data: updated });
  });

  // DELETE /:id — hard delete (ownership check)
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('schedules').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Schedule not found' });
    }

    const existing = docSnap.data() as ScheduleDocument;

    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    await docRef.delete();

    return reply.send({ success: true });
  });
}
