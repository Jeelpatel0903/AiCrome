import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1, 'FIREBASE_SERVICE_ACCOUNT is required'),
  ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be a 64-character hex string'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  FRONTEND_URL: z.string().optional().default('https://devflow.ai'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Environment variable validation failed:');
  const errors = result.error.flatten().fieldErrors;
  for (const [field, messages] of Object.entries(errors)) {
    console.error(`  - ${field}: ${messages?.join(', ')}`);
  }
  process.exit(1);
}

export const config = {
  PORT: parseInt(result.data.PORT, 10),
  NODE_ENV: result.data.NODE_ENV,
  ANTHROPIC_API_KEY: result.data.ANTHROPIC_API_KEY,
  FIREBASE_SERVICE_ACCOUNT: result.data.FIREBASE_SERVICE_ACCOUNT,
  ENCRYPTION_KEY: result.data.ENCRYPTION_KEY,
  ALLOWED_ORIGINS: result.data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
  FRONTEND_URL: result.data.FRONTEND_URL,
} as const;
