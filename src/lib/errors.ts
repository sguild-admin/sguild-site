export class SyncEndpointError extends Error {
  readonly status: number;
  readonly exposeMessage: boolean;
  readonly rawPayload?: string;

  constructor(
    message: string,
    status: number,
    options?: { exposeMessage?: boolean; rawPayload?: string },
  ) {
    super(message);
    this.name = "SyncEndpointError";
    this.status = status;
    this.exposeMessage = options?.exposeMessage ?? true;
    this.rawPayload = options?.rawPayload;
  }
}
