export interface WebhookSignatureService {
  sign(payload: string): string;

  verify(payload: string, signature: string): boolean;
}