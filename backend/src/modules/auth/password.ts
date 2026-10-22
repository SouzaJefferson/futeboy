import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hash] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  const stored = Buffer.from(hash, 'hex');
  return key.length === stored.length && timingSafeEqual(key, stored);
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
