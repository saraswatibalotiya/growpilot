/** Error returned by (or while calling) the Instagram / Meta Graph API. The raw message is for logs only. */
export class MetaApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  /** Token is expired, revoked or otherwise invalid -> the user must reconnect. */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102 || this.httpStatus === 401;
  }

  get isRateLimit(): boolean {
    return [4, 17, 32, 613].includes(this.code ?? -1);
  }

  get isPermissionError(): boolean {
    return [10, 200, 283].includes(this.code ?? -1);
  }
}
