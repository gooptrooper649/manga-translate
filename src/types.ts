export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  category: 'standard_bubble' | 'thought_cloud' | 'onomatopoeia' | 'unframed_caption' | string;
}

export interface TranslatedRegion {
  id: number;
  bbox: BoundingBox;
  originalText: string;
  translatedText: string;
}

export interface MangaPage {
  id: string;
  filename: string;
  originalDataUrl: string;
  translatedDataUrl?: string;
  annotatedDataUrl?: string;
  width: number;
  height: number;
  regions: TranslatedRegion[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  tokensUsed?: number;
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'deepseek';
  maskedKey: string;
  isActive: boolean;
  createdAt: string;
}

export interface KeyStats {
  keyId: string;
  keyName: string;
  provider: string;
  totalRequests: number;
  totalTokens: number;
  rateLimitHits: number;
  isRateLimited: boolean;
  cooldownUntil: string | null;
}

export interface RoutingEvent {
  id: string;
  timestamp: string;
  keyName: string;
  action: 'request_ok' | 'rate_limited' | 'fallback' | 'key_switch';
  detail: string;
  tokensUsed: number;
}
