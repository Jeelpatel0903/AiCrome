import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db } from '../services/firebase';
import { encrypt, decrypt } from '../services/encryption';
interface IdentityPublic {
  id: string;
  userId: string;
  name: string;
  siteUrl: string;
  username: string;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdentityCreateBody {
  name: string;
  siteUrl: string;
  username: string;
  password: string;
}

interface IdentityUpdateBody {
  name?: string;
  siteUrl?: string;
  username?: string;
  password?: string;
}

interface IdentityDocument {
  userId: string;
  name: string;
  siteUrl: string;
  username: string;
  passwordEncrypted: string;
  createdAt: string;
  updatedAt: string;
  lastUsed: string | null;
  deletedAt: string | null;
}

function toPublic(id: string, doc: IdentityDocument): IdentityPublic {
  return {
    id,
    userId: doc.userId,
    name: doc.name,
    siteUrl: doc.siteUrl,
    username: doc.username,
    lastUsed: doc.lastUsed ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export async function vaultRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /vault/identity — create a new identity
  fastify.post<{ Body: IdentityCreateBody }>(
    '/vault/identity',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { name, siteUrl, username, password } = request.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.status(400).send({ success: false, error: 'name is required' });
      }
      if (!siteUrl || typeof siteUrl !== 'string' || !isValidUrl(siteUrl)) {
        return reply.status(400).send({ success: false, error: 'siteUrl must be a valid URL' });
      }
      if (!username || typeof username !== 'string' || !username.trim()) {
        return reply.status(400).send({ success: false, error: 'username is required' });
      }
      if (!password || typeof password !== 'string' || !password.trim()) {
        return reply.status(400).send({ success: false, error: 'password is required' });
      }

      // Check for duplicate name (case-insensitive)
      const itemsRef = db.collection('identities').doc(userId).collection('items');
      const existing = await itemsRef
        .where('deletedAt', '==', null)
        .get();

      const duplicate = existing.docs.find(
        (doc) => (doc.data() as IdentityDocument).name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        return reply.status(400).send({ success: false, error: 'Identity name already exists' });
      }

      const now = new Date().toISOString();
      const passwordEncrypted = encrypt(password);

      const docData: IdentityDocument = {
        userId,
        name: name.trim(),
        siteUrl,
        username: username.trim(),
        passwordEncrypted,
        createdAt: now,
        updatedAt: now,
        lastUsed: null,
        deletedAt: null,
      };

      const docRef = await itemsRef.add(docData);

      return reply.status(201).send({
        success: true,
        data: toPublic(docRef.id, docData),
      });
    },
  );

  // GET /vault/identities — list all identities for user
  fastify.get(
    '/vault/identities',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;

      const itemsRef = db.collection('identities').doc(userId).collection('items');
      const snapshot = await itemsRef.where('deletedAt', '==', null).get();

      const identities: IdentityPublic[] = snapshot.docs
        .map((doc) => toPublic(doc.id, doc.data() as IdentityDocument))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      return reply.send({ success: true, data: identities });
    },
  );

  // GET /vault/identity/by-name/:name — find identity by name (case-insensitive, returns decrypted password)
  fastify.get<{ Params: { name: string } }>(
    '/vault/identity/by-name/:name',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { name } = request.params;

      const itemsRef = db.collection('identities').doc(userId).collection('items');
      const snapshot = await itemsRef.where('deletedAt', '==', null).get();

      const match = snapshot.docs.find(
        (doc) => (doc.data() as IdentityDocument).name.toLowerCase() === name.toLowerCase(),
      );

      if (!match) {
        return reply.status(404).send({ success: false, error: 'Identity not found' });
      }

      const doc = match.data() as IdentityDocument;
      const decryptedPassword = decrypt(doc.passwordEncrypted);

      return reply.send({
        success: true,
        data: {
          ...toPublic(match.id, doc),
          password: decryptedPassword,
        },
      });
    },
  );

  // GET /vault/identity/by-site — find identities by site URL
  fastify.get<{ Querystring: { url?: string } }>(
    '/vault/identity/by-site',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { url } = request.query;

      if (!url || typeof url !== 'string' || !url.trim()) {
        return reply.status(400).send({ success: false, error: 'url query parameter is required' });
      }

      const itemsRef = db.collection('identities').doc(userId).collection('items');
      const snapshot = await itemsRef.where('deletedAt', '==', null).get();

      const searchUrl = url.trim().toLowerCase();
      const matches: IdentityPublic[] = snapshot.docs
        .filter((doc) => {
          const identity = doc.data() as IdentityDocument;
          const siteUrl = identity.siteUrl.toLowerCase();
          return siteUrl.includes(searchUrl) || searchUrl.includes(siteUrl);
        })
        .map((doc) => toPublic(doc.id, doc.data() as IdentityDocument));

      return reply.send({ success: true, data: matches });
    },
  );

  // PUT /vault/identity/:id — update an identity
  fastify.put<{ Params: { id: string }; Body: IdentityUpdateBody }>(
    '/vault/identity/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { id } = request.params;
      const body = request.body;

      const docRef = db.collection('identities').doc(userId).collection('items').doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return reply.status(404).send({ success: false, error: 'Identity not found' });
      }

      const existing = docSnap.data() as IdentityDocument;

      // Verify ownership
      if (existing.userId !== userId) {
        return reply.status(403).send({ success: false, error: 'Forbidden' });
      }

      if (existing.deletedAt !== null) {
        return reply.status(404).send({ success: false, error: 'Identity not found' });
      }

      // Validate siteUrl if provided
      if (body.siteUrl !== undefined && !isValidUrl(body.siteUrl)) {
        return reply.status(400).send({ success: false, error: 'siteUrl must be a valid URL' });
      }

      const updates: Partial<IdentityDocument> = {
        updatedAt: new Date().toISOString(),
      };

      if (body.name !== undefined) updates.name = body.name.trim();
      if (body.siteUrl !== undefined) updates.siteUrl = body.siteUrl;
      if (body.username !== undefined) updates.username = body.username.trim();
      if (body.password !== undefined) updates.passwordEncrypted = encrypt(body.password);

      await docRef.update(updates);

      const updated: IdentityDocument = { ...existing, ...updates };

      return reply.send({
        success: true,
        data: toPublic(id, updated),
      });
    },
  );

  // DELETE /vault/identity/:id — soft delete an identity
  fastify.delete<{ Params: { id: string } }>(
    '/vault/identity/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid: userId } = request.user;
      const { id } = request.params;

      const docRef = db.collection('identities').doc(userId).collection('items').doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return reply.status(404).send({ success: false, error: 'Identity not found' });
      }

      const existing = docSnap.data() as IdentityDocument;

      // Verify ownership
      if (existing.userId !== userId) {
        return reply.status(403).send({ success: false, error: 'Forbidden' });
      }

      if (existing.deletedAt !== null) {
        return reply.status(404).send({ success: false, error: 'Identity not found' });
      }

      await docRef.update({ deletedAt: new Date().toISOString() });

      return reply.send({ success: true, message: 'Identity deleted' });
    },
  );
}
