export class NichijouError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "NichijouError";
  }
}

export class MemberNotFoundError extends NichijouError {
  constructor(memberId: string) {
    super(`Member not found: ${memberId}`, "MEMBER_NOT_FOUND");
    this.name = "MemberNotFoundError";
  }
}

export class FamilyNotFoundError extends NichijouError {
  constructor(familyId: string) {
    super(`Family not found: ${familyId}`, "FAMILY_NOT_FOUND");
    this.name = "FamilyNotFoundError";
  }
}

export class ChannelError extends NichijouError {
  constructor(message: string) {
    super(message, "CHANNEL_ERROR");
    this.name = "ChannelError";
  }
}

export class LLMError extends NichijouError {
  constructor(message: string) {
    super(message, "LLM_ERROR");
    this.name = "LLMError";
  }
}
