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
