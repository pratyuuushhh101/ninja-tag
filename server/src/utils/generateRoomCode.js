import crypto from 'crypto';
import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from '../../../shared/protocol/constants.js';

export function generateRoomCode(existingCodes, maxRetries = 100) {
  let retries = 0;
  
  while (retries < maxRetries) {
    let code = '';
    const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
    
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const index = bytes[i] % ROOM_CODE_CHARSET.length;
      code += ROOM_CODE_CHARSET[index];
    }
    
    if (!existingCodes.has(code)) {
      return code;
    }
    
    retries++;
  }
  
  throw new Error('Failed to generate a unique room code after max retries.');
}
