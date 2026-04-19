// 电影基础信息
export interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  year: number;
  rating: number;
  genres: string[];
  directors: string[];
  actors: string[];
  poster: string;
  summary: string;
  doubanUrl: string;
}

// 电影详情（豆瓣详情 / 本地库元数据）
export interface MovieDetails extends Movie {
  writers?: string[];
  runtime?: string;
  countries?: string[];
  languages?: string[];
  aka?: string[];
  imdbId?: string;
  releaseDate?: string;
}

// 下载资源信息
export interface Resource {
  magnetUrl: string;
  title: string;
  size: number;
  seeders: number;
  leechers: number;
  quality: string;
  format: string;
  language: string;
  source: string;
  uploadDate: Date;
  healthScore: number;
}

// 下载任务
export interface DownloadTask {
  id: string;
  movieId: string;
  movieTitle: string;
  magnetUrl: string;
  status: 'queued' | 'downloading' | 'completed' | 'paused' | 'cancelled' | 'error';
  progress: number;
  speed: number;
  eta: number;
  totalSize: number;
  downloadedSize: number;
  downloadPath: string;
  seeders: number;
  peers: number;
  createdAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  error?: string;
  qbittorrentHash?: string;
}

// 本地库条目
export interface LibraryItem {
  filePath: string;
  movieId?: string;
  title: string;
  size: number;
  format: string;
  quality: string;
  addedAt: Date;
  metadata?: MovieDetails;
}

// 其他工具参数类型...
export interface MovieSearchParams {
  query: string;
  limit?: number;
  year?: number;
  genre?: string;
}

export interface MovieRecommendParams {
  category?: string;
  genre?: string;
  limit?: number;
  min_rating?: number;
}
