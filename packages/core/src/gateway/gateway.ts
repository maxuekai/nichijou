import type { InboundMessage, FamilyMember } from "@nichijou/shared";
import type { Channel } from "./channel.js";
import type { FamilyManager } from "../family/family-manager.js";

export type MessageHandler = (member: FamilyMember, msg: InboundMessage) => Promise<void>;

/**
 * Callback for messages from WeChat connections not yet bound to a member.
 * `send` lets the handler reply directly back to the unbound user.
 */
export type UnboundMessageHandler = (
  channelId: string,
  connectionId: string,
  text: string,
  send: (reply: string) => Promise<void>,
) => Promise<void>;

export class Gateway {
  private channels = new Map<string, Channel>();
  private familyManager: FamilyManager;
  private messageHandler?: MessageHandler;
  private unboundHandler?: UnboundMessageHandler;

  constructor(familyManager: FamilyManager) {
    this.familyManager = familyManager;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onUnboundMessage(handler: UnboundMessageHandler): void {
    this.unboundHandler = handler;
  }

  registerChannel(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  async startAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.start(this);
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
  }

  async handleInbound(msg: InboundMessage): Promise<void> {
    const member = this.familyManager.getMember(msg.memberId);
    if (!member) return;
    if (this.messageHandler) {
      await this.messageHandler(member, msg);
    }
  }

  async handleUnboundInbound(
    channelId: string,
    connectionId: string,
    text: string,
    send: (reply: string) => Promise<void>,
  ): Promise<void> {
    if (this.unboundHandler) {
      await this.unboundHandler(channelId, connectionId, text, send);
    }
  }

  async sendToMember(memberId: string, text: string): Promise<void> {
    const member = this.familyManager.getMember(memberId);
    if (!member) return;
    const channel = this.channels.get(member.primaryChannel);
    if (channel) {
      await channel.send(memberId, text);
    }
  }

  getChannel(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  getAllChannelStatuses(): Record<string, ReturnType<Channel["getStatus"]>> {
    const statuses: Record<string, ReturnType<Channel["getStatus"]>> = {};
    for (const [id, channel] of this.channels) {
      statuses[id] = channel.getStatus();
    }
    return statuses;
  }
}
