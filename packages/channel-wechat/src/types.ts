export interface WeChatCredentials {
  token: string;
  accountId: string;
  baseUrl?: string;
  /** iLink user ID of the person who scanned the QR code */
  wechatUserId?: string;
}

export interface MemberConnection {
  /** Internal connection ID */
  connectionId: string;
  /** Bound family member ID, null if unbound */
  memberId: string | null;
  /** WeChat iLink user ID (the person who scanned) */
  wechatUserId: string;
  status: "connected" | "disconnected" | "expired";
  connectedAt?: string;
  lastError?: string;
}

export interface WeChatAccount {
  connectionId: string;
  memberId: string | null;
  credentials: WeChatCredentials;
}
