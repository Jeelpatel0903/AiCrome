import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';

type MemoryType = 'preference' | 'fact' | 'rule' | 'identity_hint';

interface Memory {
  id: string;
  userId: string;
  content: string;
  type: MemoryType;
  sitePattern?: string;
  tags: string[];
  lastUsed?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

const VALID_TYPES: MemoryType[] = ['preference', 'fact', 'rule', 'identity_hint'];

interface MemoryDocument {
  id: string;
  userId: string;
  content: string;
  type: MemoryType;
  sitePattern?: string;
  tags: string[];
  lastUsed?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

interface MemoryCreateBody {
  content: string;
  type: MemoryType;
  sitePattern?: string;
  tags?: string[];
}

interface MemoryUpdateBody {
  content?: string;
  type?: MemoryType;
  sitePattern?: string;
  tags?: string[];
}

interface SearchQuery {
  q?: string;
  url?: string;
}

interface AllQuery {
  page?: string;
  pageSize?: string;
  type?: string;
}

function toMemory(doc: MemoryDocument): Memory {
  return {
    id: doc.id,
    userId: doc.userId,
    content: doc.content,
    type: doc.type,
    sitePattern: doc.sitePattern,
    tags: doc.tags,
    lastUsed: doc.lastUsed,
    useCount: doc.useCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function autoExtractTags(content: string, userTags: string[]): string[] {
  const words = content.split(/\s+/);
  const extracted = words
    .filter((w) => w.length > 4)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 4);
  const merged = Array.from(new Set([...extracted, ...userTags.map((t) => t.toLowerCase())]));
  return merged;
}

function scoreMemory(
  mem: MemoryDocument,
  queryWords: string[],
  url: string | undefined,
): number {
  let score = 0;

  // keyword_match
  if (queryWords.length > 0) {
    const contentLower = mem.content.toLowerCase();
    const matchingWords = queryWords.filter((w) => contentLower.includes(w));
    score += (matchingWords.length / queryWords.length) * 40;
  }

  // site_pattern_match
  if (mem.sitePattern && url) {
    const normalizedUrl = url.replace(/^https?:\/\//, '').toLowerCase();
    const pattern = mem.sitePattern.toLowerCase();
    if (normalizedUrl.includes(pattern) || pattern.includes(normalizedUrl)) {
      score += 30;
    }
  }

  // recency
  if (mem.lastUsed) {
    const daysSince = (Date.now() - new Date(mem.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) score += 20;
    else if (daysSince < 7) score += 15;
    else if (daysSince < 30) score += 10;
  }

  // use_frequency
  score += Math.min(mem.useCount * 2, 10);

  return score;
}

export async function memoryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // POST / — create or update memory (duplicate detection)
  fastify.post<{ Body: MemoryCreateBody }>('/', async (request, reply) => {
    const { uid: userId } = request.user;
    const { content, type, sitePattern, tags = [] } = request.body;

    // Validate
    if (!content || typeof content !== 'string' || !content.trim()) {
      return reply.status(400).send({ success: false, error: 'content is required' });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return reply.status(400).send({
        success: false,
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const trimmedContent = content.trim();
    const itemsRef = db.collection('memories').doc(userId).collection('items');

    // Duplicate detection (case-insensitive)
    const snapshot = await itemsRef.get();
    const duplicate = snapshot.docs.find(
      (doc) =>
        (doc.data() as MemoryDocument).content.toLowerCase() === trimmedContent.toLowerCase(),
    );

    const now = new Date().toISOString();

    if (duplicate) {
      // Update existing
      const existing = duplicate.data() as MemoryDocument;
      const updates = {
        updatedAt: now,
        lastUsed: now,
        useCount: existing.useCount + 1,
      };
      await duplicate.ref.update(updates);
      const updated: MemoryDocument = { ...existing, ...updates };
      return reply.status(201).send({ success: true, data: toMemory(updated) });
    }

    // Create new
    const autoTags = autoExtractTags(trimmedContent, tags);
    const docData: MemoryDocument = {
      id: '', // will be set after creation
      userId,
      content: trimmedContent,
      type,
      sitePattern: sitePattern ?? undefined,
      tags: autoTags,
      useCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await itemsRef.add(docData);
    await docRef.update({ id: docRef.id });
    const finalDoc: MemoryDocument = { ...docData, id: docRef.id };

    return reply.status(201).send({ success: true, data: toMemory(finalDoc) });
  });

  // GET /search — relevance-based search
  fastify.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    const { uid: userId } = request.user;
    const { q, url } = request.query;

    if (!q || !q.trim()) {
      return reply.send({ success: true, data: [] });
    }

    const queryWords = q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const itemsRef = db.collection('memories').doc(userId).collection('items');
    const snapshot = await itemsRef.get();

    interface ScoredMemory {
      memory: MemoryDocument;
      score: number;
    }

    const scored: ScoredMemory[] = snapshot.docs
      .map((doc) => {
        const mem = doc.data() as MemoryDocument;
        if (!mem.id) mem.id = doc.id;
        return { memory: mem, score: scoreMemory(mem, queryWords, url) };
      })
      .filter((item) => item.score >= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return reply.send({ success: true, data: scored.map((s) => toMemory(s.memory)) });
  });

  // GET /all — paginated list with optional type filter
  fastify.get<{ Querystring: AllQuery }>('/all', async (request, reply) => {
    const { uid: userId } = request.user;
    const { page: pageStr, pageSize: pageSizeStr, type } = request.query;

    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeStr ?? '20', 10) || 20));

    const itemsRef = db.collection('memories').doc(userId).collection('items');
    const snapshot = await itemsRef.get();

    let memories: MemoryDocument[] = snapshot.docs.map((doc) => {
      const data = doc.data() as MemoryDocument;
      if (!data.id) data.id = doc.id;
      return data;
    });

    // Filter by type if provided
    if (type && VALID_TYPES.includes(type as MemoryType)) {
      memories = memories.filter((m) => m.type === type);
    }

    // Sort by updatedAt descending
    memories.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    const total = memories.length;
    const start = (page - 1) * pageSize;
    const paginated = memories.slice(start, start + pageSize);

    return reply.send({
      success: true,
      data: paginated.map(toMemory),
      total,
      page,
      pageSize,
    });
  });

  // POST /usage/:id — track usage
  fastify.post<{ Params: { id: string } }>('/usage/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('memories').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Memory not found' });
    }

    const existing = docSnap.data() as MemoryDocument;
    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    await docRef.update({
      useCount: existing.useCount + 1,
      lastUsed: now,
    });

    return reply.send({ success: true });
  });

  // PUT /:id — update memory
  fastify.put<{ Params: { id: string }; Body: MemoryUpdateBody }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;
    const body = request.body;

    if (body.type !== undefined && !VALID_TYPES.includes(body.type)) {
      return reply.status(400).send({
        success: false,
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const docRef = db.collection('memories').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Memory not found' });
    }

    const existing = docSnap.data() as MemoryDocument;
    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    const updates: Partial<MemoryDocument> = { updatedAt: now };

    if (body.content !== undefined) updates.content = body.content.trim();
    if (body.type !== undefined) updates.type = body.type;
    if (body.sitePattern !== undefined) updates.sitePattern = body.sitePattern;
    if (body.tags !== undefined) updates.tags = body.tags;

    await docRef.update(updates);

    const updated: MemoryDocument = { ...existing, ...updates };
    return reply.send({ success: true, data: toMemory(updated) });
  });

  // DELETE /:id — hard delete
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('memories').doc(userId).collection('items').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Memory not found' });
    }

    const existing = docSnap.data() as MemoryDocument;
    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    await docRef.delete();
    return reply.send({ success: true });
  });
}
