import { InteractionEvent, InteractionType } from '@automanual/shared';
import * as fs from 'fs';
import * as path from 'path';

export class EventLogger {
  private events: InteractionEvent[] = [];
  private startTime: number = Date.now();

  reset() {
    this.events = [];
    this.startTime = Date.now();
  }

  logEvent(data: {
    type: InteractionType;
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
  }): InteractionEvent {
    const timestamp = Date.now() - this.startTime;
    const event: InteractionEvent = {
      id: `evt-${this.events.length + 1}-${Date.now().toString(36)}`,
      type: data.type,
      timestamp,
      url: data.url,
      selector: data.selector,
      elementText: data.elementText,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      inputValue: data.inputValue,
      screenshotPath: data.screenshotPath,
      workflowId: data.workflowId,
    };

    this.events.push(event);
    return event;
  }

  getEvents(): InteractionEvent[] {
    return [...this.events];
  }

  getDurationSeconds(): number {
    if (this.events.length === 0) return 0;
    const last = this.events[this.events.length - 1];
    return Math.max(1, Math.round(last.timestamp / 1000));
  }

  saveToFile(outputPath: string): string {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(this.events, null, 2), 'utf8');
    return outputPath;
  }
}
