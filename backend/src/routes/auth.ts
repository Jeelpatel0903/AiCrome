import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { db, auth as adminAuth } from '../services/firebase';
interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  language: 'english' | 'hinglish' | 'hindi';
  autoScreenshot: boolean;
  askBeforeSubmit: boolean;
  progressNotifications: boolean;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  settings: UserSettings;
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  fontSize: 'medium',
  language: 'hinglish',
  autoScreenshot: true,
  askBeforeSubmit: true,
  progressNotifications: true,
};

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /me — verify token, fetch or create user profile from Firestore
  fastify.get(
    '/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.user;

      const profileRef = db.collection('users').doc(uid).collection('profile').doc('data');
      const profileSnap = await profileRef.get();

      if (profileSnap.exists) {
        const profile = profileSnap.data() as UserProfile;
        return reply.send({ success: true, data: profile });
      }

      // Profile doesn't exist — create it from the Firebase Auth user record
      const firebaseUser = await adminAuth.getUser(uid);

      const newProfile: UserProfile = {
        uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? undefined,
        photoURL: firebaseUser.photoURL ?? undefined,
        createdAt: new Date().toISOString(),
        settings: DEFAULT_SETTINGS,
      };

      await profileRef.set(newProfile);

      return reply.send({ success: true, data: newProfile });
    },
  );

  // POST /logout — clear session (token revocation handled client-side)
  fastify.post(
    '/logout',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      return reply.send({ success: true });
    },
  );
}
