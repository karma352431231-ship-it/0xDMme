import type { AttachmentSelection } from '../attachments/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
export interface MediaSubmission {
  peer: string;
  text: string;
  reply: string | null;
  viewOnce: boolean;
  selections: readonly AttachmentSelection[];
}
export interface SubmissionItem {
  id: string;
  peer: string;
  text: string;
  reply: string | null;
  viewOnce: boolean;
  selection: AttachmentSelection | null;
  createdAt: number;
  signal?: AbortSignal;
}
export interface StagedMedia {
  id: string;
  peer: string;
  createdAt: number;
  content: AttachmentContent | null;
}
export interface SubmittedMedia extends StagedMedia {
  viewOnce: boolean;
  phase: 'queued' | 'staging' | 'sending' | 'saved' | 'accepted' | 'failed';
  progress: number | null;
}
