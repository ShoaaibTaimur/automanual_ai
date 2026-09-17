import * as crypto from 'crypto';

export enum ProjectStatus {
  CREATED = 'CREATED',
  DISCOVERING = 'DISCOVERING',
  PLAN_READY = 'PLAN_READY',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  EXECUTING = 'EXECUTING',
  RECORDING = 'RECORDING',
  GENERATING_NARRATION = 'GENERATING_NARRATION',
  GENERATING_VOICE = 'GENERATING_VOICE',
  RENDERING_VIDEO = 'RENDERING_VIDEO',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type InteractionType = 'click' | 'navigate' | 'scroll' | 'input' | 'hover';

export interface InteractionEvent {
  id: string;
  type: InteractionType;
  timestamp: number;
  url: string;
  selector?: string;
  elementText?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  inputValue?: string;
  screenshotPath?: string;
  workflowId?: string;
}

export interface ApplicationSection {
  name: string;
  route: string;
  description: string;
  features: string[];
}

export interface DiscoveryData {
  applicationName: string;
  baseUrl: string;
  sections: ApplicationSection[];
  authRequired: boolean;
  discoveredAt: string;
}

export type WorkflowAction = 'navigate' | 'click' | 'input' | 'scroll' | 'explain' | 'hover';

export interface WorkflowStep {
  action: WorkflowAction;
  target?: string;
  description?: string;
  value?: string;
}

export interface WorkflowPlanItem {
  id: string;
  title: string;
  priority: number;
  steps: WorkflowStep[];
}

export interface ExplorationPlan {
  title: string;
  estimatedDuration: number;
  workflows: WorkflowPlanItem[];
}

export interface NarrationSegment {
  workflowId: string;
  startEventIndex: number;
  endEventIndex: number;
  text: string;
  audioPath?: string;
  duration?: number;
  startTime?: number;
}

export interface VideoTimelineItem {
  start: number;
  end: number;
  type: 'intro' | 'navigation' | 'interaction' | 'explanation' | 'outro';
  action?: string;
  target?: string;
  narration?: string;
  audioPath?: string;
  zoomTarget?: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface CreateProjectDto {
  name: string;
  baseUrl: string;
  authRequired: boolean;
  username?: string;
  password?: string;
}

export interface AuthDetectionResult {
  isAuthPage: boolean;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  formSelector?: string;
  formType?: 'login' | 'mfa' | 'unknown';
  pageTitle?: string;
}

export interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  storageStatePath?: string;
  error?: string;
}

export interface BrowserSessionOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  recordVideoDir?: string;
  storageStatePath?: string;
  slowMo?: number;
}

// AES-256-GCM Encryption Helpers
export function encryptCredentials(plainText: string, secretKeyHex: string): string {
  if (!secretKeyHex || secretKeyHex.length < 32) {
    throw new Error('ENCRYPTION_KEY must be a valid hex string of at least 32 characters');
  }
  const key = Buffer.from(secretKeyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredentials(encryptedPayload: string, secretKeyHex: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }
  const [ivHex, tagHex, contentHex] = parts;
  const key = Buffer.from(secretKeyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(contentHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
