const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now()): string {
  let time = now;
  const timeChars = Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = alphabet[time % 32];
    time = Math.floor(time / 32);
  }

  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  const randomChars = Array.from(random.slice(0, 16), (byte) => alphabet[byte % 32]);
  return `${timeChars.join('')}${randomChars.join('')}`;
}
