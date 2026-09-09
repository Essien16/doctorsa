export interface PasswordHasher {
  compare(plainText: string, hash: string): Promise<boolean>;
}