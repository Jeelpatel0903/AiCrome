import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';

interface OverrideRule {
  triggerKeyword: string;
  targetField: string;
  setValue: string;
}

interface SitePreference {
  id: string;
  userId: string;
  sitePattern: string;
  defaults: Record<string, string>;
  overrideRules: OverrideRule[];
  createdAt: string;
  updatedAt: string;
}

interface SitePreferenceDocument {
  id: string;
  userId: string;
  sitePattern: string;
  defaults: Record<string, string>;
  overrideRules: OverrideRule[];
  createdAt: string;
  updatedAt: string;
}

interface SiteCreateBody {
  sitePattern: string;
  defaults?: Record<string, string>;
  overrideRules?: OverrideRule[];
}

interface SiteUpdateBody {
  sitePattern?: string;
  defaults?: Record<string, string>;
  overrideRules?: OverrideRule[];
}

interface SiteQuery {
  url?: string;
}

function toPreference(doc: SitePreferenceDocument): SitePreference {
  return {
    id: doc.id,
    userId: doc.userId,
    sitePattern: doc.sitePattern,
    defaults: doc.defaults,
    overrideRules: doc.overrideRules,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function preferencesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // POST /site — create a new site preference
  fastify.post<{ Body: SiteCreateBody }>('/site', async (request, reply) => {
    const { uid: userId } = request.user;
    const { sitePattern, defaults = {}, overrideRules = [] } = request.body;

    if (!sitePattern || typeof sitePattern !== 'string' || !sitePattern.trim()) {
      return reply.status(400).send({ success: false, error: 'sitePattern is required' });
    }

    const trimmedPattern = sitePattern.trim();
    const sitesRef = db.collection('sitePreferences').doc(userId).collection('sites');

    // Check for duplicate sitePattern
    const snapshot = await sitesRef.get();
    const duplicate = snapshot.docs.find(
      (doc) => (doc.data() as SitePreferenceDocument).sitePattern === trimmedPattern,
    );
    if (duplicate) {
      return reply.status(400).send({ success: false, error: 'sitePattern already exists' });
    }

    const now = new Date().toISOString();
    const docData: SitePreferenceDocument = {
      id: '',
      userId,
      sitePattern: trimmedPattern,
      defaults,
      overrideRules,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await sitesRef.add(docData);
    await docRef.update({ id: docRef.id });
    const finalDoc: SitePreferenceDocument = { ...docData, id: docRef.id };

    return reply.status(201).send({ success: true, data: toPreference(finalDoc) });
  });

  // GET /site — find best matching preference or list all
  fastify.get<{ Querystring: SiteQuery }>('/site', async (request, reply) => {
    const { uid: userId } = request.user;
    const { url } = request.query;

    const sitesRef = db.collection('sitePreferences').doc(userId).collection('sites');
    const snapshot = await sitesRef.get();

    const prefs: SitePreferenceDocument[] = snapshot.docs.map((doc) => {
      const data = doc.data() as SitePreferenceDocument;
      if (!data.id) data.id = doc.id;
      return data;
    });

    if (!url || !url.trim()) {
      // Return all preferences
      return reply.send({ success: true, data: prefs.map(toPreference) });
    }

    const normalizedUrl = url.trim().toLowerCase();

    // Find all matching preferences
    const matches = prefs.filter((pref) => {
      const pattern = pref.sitePattern.toLowerCase();
      return normalizedUrl.includes(pattern) || pattern.includes(normalizedUrl);
    });

    if (matches.length === 0) {
      return reply.send({ success: true, data: null });
    }

    // Pick the most specific match (longest sitePattern)
    const best = matches.reduce((prev, curr) =>
      curr.sitePattern.length > prev.sitePattern.length ? curr : prev,
    );

    return reply.send({ success: true, data: toPreference(best) });
  });

  // PUT /site/:id — update site preference
  fastify.put<{ Params: { id: string }; Body: SiteUpdateBody }>('/site/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;
    const body = request.body;

    const docRef = db.collection('sitePreferences').doc(userId).collection('sites').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Site preference not found' });
    }

    const existing = docSnap.data() as SitePreferenceDocument;
    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const now = new Date().toISOString();
    const updates: Partial<SitePreferenceDocument> = { updatedAt: now };

    if (body.sitePattern !== undefined) updates.sitePattern = body.sitePattern.trim();

    // Deep merge for defaults
    if (body.defaults !== undefined) {
      updates.defaults = { ...existing.defaults, ...body.defaults };
    }

    // Replace entire overrideRules array
    if (body.overrideRules !== undefined) {
      updates.overrideRules = body.overrideRules;
    }

    await docRef.update(updates);

    const updated: SitePreferenceDocument = { ...existing, ...updates };
    return reply.send({ success: true, data: toPreference(updated) });
  });

  // DELETE /site/:id — hard delete
  fastify.delete<{ Params: { id: string } }>('/site/:id', async (request, reply) => {
    const { uid: userId } = request.user;
    const { id } = request.params;

    const docRef = db.collection('sitePreferences').doc(userId).collection('sites').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return reply.status(404).send({ success: false, error: 'Site preference not found' });
    }

    const existing = docSnap.data() as SitePreferenceDocument;
    if (existing.userId !== userId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    await docRef.delete();
    return reply.send({ success: true });
  });
}
