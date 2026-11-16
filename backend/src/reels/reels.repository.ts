import { Injectable } from '@nestjs/common';
import type { CaptionLength, HashtagLevel, Tone } from '../common/constants';
import { PrismaService } from '../database/prisma.service';
import { JOB_STATUSES, type AnimationLevel, type BackgroundStyle, type MusicTrack, type TextStyle, type ReelLanguage, type ReelScene, type ReelStage, type ReelLook, type ReelStatus, type ReelTemplate } from './reels.constants';

const REEL_FIELDS = [
  'id',
  'businessId',
  'productId',
  'mediaAssetId',
  'sourceImageUrl',
  'extraImageUrls',
  'language',
  'template',
  'look',
  'backgroundStyle',
  'animationLevel',
  'textStyle',
  'music',
  'renderReport',
  'instruction',
  'tone',
  'captionLength',
  'hashtagLevel',
  'productName',
  'price',
  'businessName',
  'offerText',
  'script',
  'scenes',
  'caption',
  'hashtags',
  'status',
  'stage',
  'error',
  'voiceUrl',
  'videoUrl',
  'thumbnailUrl',
  'durationSeconds',
  'voiceStale',
  'videoStale',
  'publishAmbiguous',
  'instagramMediaId',
  'permalink',
  'publishedAt',
  'approvedAt',
  'createdAt',
  'updatedAt',
] as const;

export interface ReelRecord {
  id: string;
  businessId: string;
  productId: string | null;
  mediaAssetId: string | null;
  sourceImageUrl: string;
  /** Up to four more photos for the middle scenes. */
  extraImageUrls: string[] | null;
  language: ReelLanguage;
  template: ReelTemplate;
  look: ReelLook;
  backgroundStyle: BackgroundStyle;
  animationLevel: AnimationLevel;
  textStyle: TextStyle;
  music: MusicTrack;
  renderReport: unknown;
  instruction: string | null;
  tone: Tone;
  captionLength: CaptionLength;
  hashtagLevel: HashtagLevel;
  productName: string;
  price: string | null;
  businessName: string;
  offerText: string | null;
  script: string | null;
  scenes: ReelScene[] | null;
  caption: string | null;
  hashtags: string[] | null;
  status: ReelStatus;
  stage: ReelStage;
  error: string | null;
  voiceUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  voiceStale: boolean;
  videoStale: boolean;
  publishAmbiguous: boolean;
  instagramMediaId: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReelCreate = Pick<ReelRecord, 'businessId' | 'sourceImageUrl' | 'language' | 'template' | 'productName' | 'businessName'> &
  Partial<Pick<ReelRecord, 'productId' | 'mediaAssetId' | 'extraImageUrls' | 'look' | 'backgroundStyle' | 'animationLevel' | 'textStyle' | 'music' | 'durationSeconds' | 'instruction' | 'tone' | 'captionLength' | 'hashtagLevel' | 'price' | 'offerText'>>;

export type ReelPatch = Partial<Omit<ReelRecord, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>>;

@Injectable()
export class ReelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get reels() {
    return this.prisma.db.orm.public.Reel;
  }

  create(id: string, data: ReelCreate): Promise<ReelRecord> {
    return this.reels.select(...REEL_FIELDS).create({ id, ...data } as never) as unknown as Promise<ReelRecord>;
  }

  findById(id: string): Promise<ReelRecord | null> {
    return this.reels.select(...REEL_FIELDS).where({ id }).first() as unknown as Promise<ReelRecord | null>;
  }

  list(businessId: string, take: number, offset: number): Promise<ReelRecord[]> {
    return this.reels
      .select(...REEL_FIELDS)
      .where({ businessId })
      .orderBy((r) => r.createdAt.desc())
      .limit(take)
      .offset(offset)
      .all() as unknown as Promise<ReelRecord[]>;
  }

  /**
   * Writes `patch` only if the reel is still in `from`. Returns the new row, or null when it was not
   * (someone else moved it first, or it was cancelled). This is what makes status changes atomic.
   */
  async updateIf(id: string, from: ReelStatus | undefined, patch: ReelPatch): Promise<ReelRecord | null> {
    const row = from
      ? await this.reels.where({ id, status: from }).select(...REEL_FIELDS).update(patch as never)
      : await this.reels.where({ id }).select(...REEL_FIELDS).update(patch as never);
    return (row as unknown as ReelRecord | null) ?? null;
  }

  async idsInJobStatuses(): Promise<Array<{ id: string; status: ReelStatus }>> {
    return (await this.reels.select('id', 'status').where((r) => r.status.in([...JOB_STATUSES, 'PUBLISHING'] as never) as never).all()) as unknown as Array<{ id: string; status: ReelStatus }>;
  }
}
