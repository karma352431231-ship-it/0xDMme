import type { Database } from '../database/index.ts';
import { WorkConsumers } from '../work-scheduler/index.ts';
import { AttachmentService } from '../attachments/index.ts';
import { GroupMediaService } from '../groups/index.ts';
import { StatusService } from '../status/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
import type { RepresentativeService } from '../representatives/index.ts';

export class ContentMaintenance {
  private readonly consumers: WorkConsumers;
  private readonly statuses: StatusService;
  constructor(
    db: Database,
    objects: ObjectStore,
    representatives: RepresentativeService,
    options: { fallbackMs?: number; keepAlive?: boolean } = {},
  ) {
    const attachments = new AttachmentService(db.attachments, null, objects);
    const social = new AttachmentService(db.socialMedia, null, {
      attachment: (id) => objects.socialAttachment(id),
      readAttachment: (id) => objects.readSocialAttachment(id),
      discardAttachment: (id) => objects.discardSocialAttachment(id),
    });
    const groups = new GroupMediaService(
      db.groupMedia,
      db.groupRetention,
      objects,
    );
    this.statuses = new StatusService(db.statuses, db.statusMedia, objects);
    this.consumers = new WorkConsumers(
      [
        {
          topic: 'backups',
          work: async () => {
            for (const item of await db.backups.garbage()) {
              await objects.discardPersonal(item.object_hash);
              await db.backups.collected(item.account_id, item.id);
            }
          },
          next: () => db.backups.nextCollection(),
        },
        {
          topic: 'attachments',
          work: () => attachments.clean(),
          next: () => db.attachments.nextCollection(),
        },
        {
          topic: 'social-media',
          work: () => social.clean(),
          next: () => db.socialMedia.nextCollection(),
        },
        {
          topic: 'group-media',
          work: () => groups.clean(),
          next: async () => {
            const dates = await Promise.all([
              db.groupMedia.nextCollection(),
              db.groupRetention.nextCollection(),
            ]);
            const next = Math.min(...dates.map((at) => at ?? Infinity));
            return Number.isFinite(next) ? next : null;
          },
        },
        {
          topic: 'group-daily',
          work: () => db.groupDaily.clean(),
          next: () => db.groupDaily.nextCollection(),
        },
        {
          topic: 'status',
          work: () => this.statuses.clean(),
          next: () => db.statuses.nextCollection(),
        },
        {
          topic: 'representatives',
          work: () => representatives.maintain(),
          next: () => db.representatives.nextCheck(),
        },
      ],
      db.workSignals,
      options,
    );
  }
  start(): void {
    this.consumers.start();
  }
  async close(): Promise<void> {
    try {
      await this.consumers.close();
    } finally {
      await this.statuses.close();
    }
  }
}
