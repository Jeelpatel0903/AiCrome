import * as admin from 'firebase-admin';
import { config } from '../config';

let serviceAccount: admin.ServiceAccount;

try {
  serviceAccount = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT) as admin.ServiceAccount;
} catch {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON. Ensure it is a valid single-line JSON string.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestoreDb = admin.firestore();
firestoreDb.settings({ ignoreUndefinedProperties: true });

export const db = firestoreDb;
export const auth = admin.auth();
