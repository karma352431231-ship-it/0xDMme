export type MessageWorkResult = MessageContinuation | void;
export type MessageWork = () => Promise<MessageWorkResult>;

/** A successful bounded turn has more work. This is neither failure nor a retry. */
export class MessageContinuation {
  readonly resume: MessageWork;
  readonly cancel: () => void;
  constructor(resume: MessageWork, cancel: () => void = () => {}) {
    this.resume = resume;
    this.cancel = cancel;
  }
}
