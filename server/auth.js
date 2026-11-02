import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const token = () => randomBytes(32).toString('hex');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export const publicUser = ({ password, profile_photo, ...user }) => ({...user,photo_url:profile_photo?`/api/profile/photo?v=${user.photo_version}`:null});
