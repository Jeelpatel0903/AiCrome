import { WebSocket } from 'ws';

// Map userId → WebSocket connection
const connections = new Map<string, WebSocket>();

export function registerConnection(userId: string, ws: WebSocket): void {
  connections.set(userId, ws);
  ws.on('close', () => connections.delete(userId));
}

export function sendToUser(
  userId: string,
  message: {
    sessionId: string;
    type: string;
    message: string;
    timestamp: string;
  },
): boolean {
  const ws = connections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Bridge: receive browser action results from extension
// Map requestId → resolve function
const pendingBridgeRequests = new Map<
  string,
  (result: { success: boolean; data?: Record<string, unknown>; error?: string }) => void
>();

export function registerBridgeRequest(
  requestId: string,
  resolve: (result: {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }) => void,
): void {
  pendingBridgeRequests.set(requestId, resolve);
  // Auto-cleanup after 65 seconds (matches 60s tool timeout + buffer)
  setTimeout(() => {
    if (pendingBridgeRequests.has(requestId)) {
      pendingBridgeRequests.delete(requestId);
      resolve({ success: false, error: 'Bridge request timed out' });
    }
  }, 65000);
}

export function resolveBridgeRequest(
  requestId: string,
  result: { success: boolean; data?: Record<string, unknown>; error?: string },
): boolean {
  const resolve = pendingBridgeRequests.get(requestId);
  if (resolve) {
    pendingBridgeRequests.delete(requestId);
    resolve(result);
    return true;
  }
  return false;
}

// ─── User Q&A: agent asks a question and waits for the user to answer ────────
const pendingUserAnswers = new Map<string, (answer: string) => void>();

export function registerUserQuestion(
  questionId: string,
  resolve: (answer: string) => void,
): void {
  pendingUserAnswers.set(questionId, resolve);
  // Auto-expire after 10 minutes with an empty string so the agent can continue
  setTimeout(() => {
    if (pendingUserAnswers.has(questionId)) {
      pendingUserAnswers.delete(questionId);
      resolve('');
    }
  }, 10 * 60 * 1000);
}

export function resolveUserAnswer(questionId: string, answer: string): boolean {
  const resolve = pendingUserAnswers.get(questionId);
  if (resolve) {
    pendingUserAnswers.delete(questionId);
    resolve(answer);
    return true;
  }
  return false;
}
