import crypto from 'crypto';

export function generatePlayerId() {
  return crypto.randomUUID();
}
