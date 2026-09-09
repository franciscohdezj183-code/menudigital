import bcrypt from 'bcryptjs';
export const PASSWORD_COST = 12;
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function validPasswordSize(value) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0');
}
export function validOwnerPassword(value) {
  return validPasswordSize(value) && [...value].length >= 8 && /\p{L}/u.test(value) && /[0-9]/.test(value);
}
export const hashPassword = password => bcrypt.hash(password, PASSWORD_COST);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
