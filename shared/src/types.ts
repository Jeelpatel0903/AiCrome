// ==================== AGENT ====================
export interface AgentCommand {
  command: string;
  sessionId: string;
  userId: string;
  currentUrl?: string;
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ProgressUpdate {
  sessionId: string;
  type: 'tool_start' | 'tool_success' | 'tool_error' | 'message' | 'asking' | 'complete';
  toolName?: string;
  message: string;
  timestamp: string;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ==================== MEMORY ====================
export type MemoryType = 'preference' | 'fact' | 'rule' | 'identity_hint';

export interface Memory {
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

export interface SitePreference {
  id: string;
  userId: string;
  sitePattern: string;
  defaults: Record<string, string>;
  overrideRules: OverrideRule[];
  createdAt: string;
  updatedAt: string;
}

export interface OverrideRule {
  triggerKeyword: string;
  targetField: string;
  setValue: string;
}

// ==================== IDENTITY ====================
export interface Identity {
  id: string;
  userId: string;
  name: string;
  siteUrl: string;
  username: string;
  passwordEncrypted: string;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface IdentityPublic {
  id: string;
  userId: string;
  name: string;
  siteUrl: string;
  username: string;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== WORKFLOW ====================
export type WorkflowStepType = 'navigate' | 'click' | 'type' | 'select' | 'addRow' | 'submit' | 'scroll' | 'wait';

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  selector?: string;
  value?: string;
  description: string;
  isVariable: boolean;
  variableName?: string;
  screenshot?: string;
  timestamp: string;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  tags: string[];
  steps: WorkflowStep[];
  variables: WorkflowVariable[];
  lastRun?: string;
  runCount: number;
  isShared: boolean;
  shareId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVariable {
  name: string;
  description?: string;
  defaultValue?: string;
}

// ==================== SCHEDULE ====================
export interface ScheduledTask {
  id: string;
  userId: string;
  command: string;
  cronExpression: string;
  humanReadable: string;
  isActive: boolean;
  lastRun?: string;
  lastRunStatus?: 'success' | 'failure';
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  userId: string;
  startedAt: string;
  completedAt?: string;
  status: 'success' | 'failure' | 'running';
  error?: string;
}

// ==================== TOOLS ====================
export type ToolCategory = 'navigation' | 'observation' | 'interaction' | 'form' | 'memory' | 'identity' | 'communication' | 'workflow' | 'schedule';

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
}

export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string };
}

// ==================== API RESPONSES ====================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ==================== CHROME BRIDGE ====================
export interface BridgeMessage {
  action: BridgeAction;
  params: Record<string, unknown>;
  requestId: string;
}

export type BridgeAction = 'click' | 'type' | 'select' | 'scroll' | 'pressKey' | 'getDOM' | 'highlight' | 'navigate' | 'screenshot';

export interface BridgeResponse {
  requestId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ==================== AUTH ====================
export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  language: 'english' | 'hinglish' | 'hindi';
  autoScreenshot: boolean;
  askBeforeSubmit: boolean;
  progressNotifications: boolean;
}

// ==================== AI CONFIG =============

export type AIProvider = 'anthropic' | 'openai' | 'deepseek' | 'github';

export interface ModelInfo {
  id: string;    // e.g. 'claude-sonnet-4-5'
  label: string; // e.g. 'Claude Sonnet 4.5'
}

export interface ProviderConfig {
  label: string;
  models: ModelInfo[];
}

export const PROVIDER_MODELS: Record<AIProvider, ProviderConfig> = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-5',        label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-7',          label: 'Claude Opus 4.7' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5' },
    ],
  },
  openai: {
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  github: {
    label: 'GitHub Models',
    models: [
      { id: 'gpt-4o',                label: 'GPT-4o' },
      { id: 'gpt-4o-mini',           label: 'GPT-4o Mini' },
      { id: 'o1-mini',               label: 'o1 Mini' },
      { id: 'Meta-Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B' },
      { id: 'Meta-Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B' },
      { id: 'Mistral-large',         label: 'Mistral Large' },
    ],
  },
};

/** Full config resolved at runtime (API key decrypted — backend only) */
export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  source: 'db' | 'env';
}

/** Safe public shape returned by GET /ai-config (key never exposed) */
export interface AIConfigPublic {
  provider: AIProvider;
  model: string;
  hasKey: boolean;
  source: 'db' | 'env';
  enabled: boolean;
}

// ==================== SNAPSHOT + REFS ====================
export interface ElementRef {
  ref: string;
  tag: string;
  role: string;
  name: string;
  type?: string;
  value?: string;
  disabled: boolean;
  visible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  cssSelector: string;
  xpath: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: string;
  elements: ElementRef[];
  scrollY: number;
  pageHeight: number;
  viewportHeight: number;
}

// ==================== ACTION POLICY ====================
export type ActionRisk = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface ActionPolicy {
  action: string;
  risk: ActionRisk;
  reason: string;
  requiresConfirmation: boolean;
  params?: Record<string, unknown>;
}

export type BrowserAction =
  | { type: 'click'; ref: string }
  | { type: 'type'; ref: string; text: string }
  | { type: 'navigate'; url: string }
  | { type: 'select'; ref: string; option: string }
  | { type: 'pressKey'; key: string }
  | { type: 'scroll'; direction: 'up' | 'down'; amount?: number }
  | { type: 'wait'; condition: Record<string, unknown> }
  | { type: 'snapshot' }
  | { type: 'screenshot' };

export function classifyActionRisk(action: BrowserAction): ActionRisk {
  switch (action.type) {
    case 'snapshot':
    case 'screenshot':
      return 'safe';
    case 'scroll':
      return 'safe';
    case 'type':
      return 'low';
    case 'click':
      return 'low';
    case 'pressKey':
      return action.key === 'Enter' || action.key === 'Return' ? 'medium' : 'low';
    case 'navigate': {
      const url = action.url.toLowerCase();
      if (url.includes('delete') || url.includes('remove') || url.includes('cancel')) return 'high';
      return 'medium';
    }
    case 'select':
      return 'low';
    case 'wait':
      return 'safe';
    default:
      return 'medium';
  }
}

// ==================== BATCH EXECUTION ====================
export interface BatchCommand {
  actions: BrowserAction[];
  bail: boolean;  // stop on first failure
}

export interface BatchResult {
  results: Array<{ action: BrowserAction; success: boolean; data?: Record<string, unknown>; error?: string }>;
  allSucceeded: boolean;
  stoppedEarly: boolean;
}

// ==================== DOMAIN GUARD ====================
export interface DomainRule {
  pattern: string;  // "*.example.com" or "example.com" or "*"
  action: 'allow' | 'block';
}

export interface DomainGuardConfig {
  rules: DomainRule[];
  defaultAction: 'allow' | 'block';
}
