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

  // GET /stats — return counts of memories, workflows, and schedules for user
  fastify.get('/stats', { preHandler: authMiddleware }, async (request, reply) => {
    const { uid } = request.user;

    const [memoriesSnap, workflowsSnap, schedulesSnap] = await Promise.all([
      db.collection('memories').doc(uid).collection('items').get(),
      db.collection('workflows').doc(uid).collection('items').get(),
      db.collection('schedules').doc(uid).collection('items').get(),
    ]);

    return reply.send({
      success: true,
      data: {
        memories: memoriesSnap.size,
        workflows: workflowsSnap.size,
        schedules: schedulesSnap.size,
        activeSchedules: schedulesSnap.docs.filter((d) => d.data().isActive).length,
      },
    });
  });

  // POST /logout — clear session (token revocation handled client-side)
  fastify.post(
    '/logout',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      return reply.send({ success: true });
    },
  );

  // PUT /settings — update user settings
  fastify.put<{ Body: Partial<UserSettings> }>(
    '/settings',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { uid } = request.user;
      const body = request.body;

      const profileRef = db.collection('users').doc(uid).collection('profile').doc('data');
      const profileSnap = await profileRef.get();

      if (!profileSnap.exists) {
        return reply.status(404).send({ success: false, error: 'Profile not found' });
      }

      const profile = profileSnap.data() as UserProfile;
      const validThemes = ['dark', 'light', 'system'] as const;
      const validFontSizes = ['small', 'medium', 'large'] as const;
      const validLanguages = ['english', 'hinglish', 'hindi'] as const;

      const updates: Partial<UserSettings> = {};
      if (body.theme !== undefined && (validThemes as readonly string[]).includes(body.theme)) updates.theme = body.theme;
      if (body.fontSize !== undefined && (validFontSizes as readonly string[]).includes(body.fontSize)) updates.fontSize = body.fontSize;
      if (body.language !== undefined && (validLanguages as readonly string[]).includes(body.language)) updates.language = body.language;
      if (body.autoScreenshot !== undefined) updates.autoScreenshot = Boolean(body.autoScreenshot);
      if (body.askBeforeSubmit !== undefined) updates.askBeforeSubmit = Boolean(body.askBeforeSubmit);
      if (body.progressNotifications !== undefined) updates.progressNotifications = Boolean(body.progressNotifications);

      const newSettings = { ...profile.settings, ...updates };
      await profileRef.update({ settings: newSettings });

      return reply.send({ success: true, data: { ...profile, settings: newSettings } });
    },
  );
}
