import {
  mentionSpans,
  mentionToken,
} from '../../shared/public-mentions/index.ts';
import type {
  MentionSpan,
  PublicMention,
} from '../../shared/public-mentions/index.ts';
/** Reference positions follow edits outside a mention; editing its label removes the link. */
export class MentionDraft {
  text = '';
  private spans: MentionSpan[] = [];
  constructor(value: string) {
    this.reset(value);
  }
  reset(value: string): void {
    this.text = '';
    this.spans = [];
    let end = 0;
    for (const span of mentionSpans(value)) {
      this.text += value.slice(end, span.start);
      const start = this.text.length;
      this.text += '@' + span.label;
      this.spans.push({ ...span, start, end: this.text.length });
      end = span.end;
    }
    this.text += value.slice(end);
  }
  update(next: string): void {
    if (next === this.text) return;
    let start = 0,
      suffix = 0;
    while (
      start < this.text.length &&
      start < next.length &&
      this.text[start] === next[start]
    )
      start++;
    while (
      suffix < this.text.length - start &&
      suffix < next.length - start &&
      this.text.at(-1 - suffix) === next.at(-1 - suffix)
    )
      suffix++;
    const end = this.text.length - suffix,
      delta = next.length - this.text.length;
    this.spans = this.spans.flatMap((span) => {
      if (span.end === start && /[\p{L}\p{N}_]/u.test(next[start] ?? ''))
        return [];
      if (span.end <= start) return [span];
      if (span.start >= end)
        return [{ ...span, start: span.start + delta, end: span.end + delta }];
      return [];
    });
    this.text = next;
  }
  select(start: number, end: number, target: PublicMention): number {
    const label = '@' + target.label;
    this.update(this.text.slice(0, start) + label + ' ' + this.text.slice(end));
    this.spans.push({ ...target, start, end: start + label.length });
    this.spans.sort((a, b) => a.start - b.start);
    return start + label.length + 1;
  }
  query(caret: number): { start: number; end: number; text: string } | null {
    if (this.spans.some((span) => caret >= span.start && caret <= span.end + 1))
      return null;
    const match = /(?:^|\s)@([^@\n]{2,100})$/u.exec(this.text.slice(0, caret));
    const query = match?.[1];
    if (query === undefined || query.trimEnd() !== query) return null;
    return { start: caret - query.length - 1, end: caret, text: query };
  }
  value(): string {
    let result = '',
      end = 0;
    for (const span of this.spans) {
      result += this.text.slice(end, span.start) + mentionToken(span);
      end = span.end;
    }
    return result + this.text.slice(end);
  }
}
