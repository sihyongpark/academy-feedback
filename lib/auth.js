import bcrypt from 'bcryptjs';

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
export const generateTempPassword = () => Math.random().toString(36).slice(-8);
