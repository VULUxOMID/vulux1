// src/utils/totp.ts
// Custom TOTP implementation for React Native avoiding Node's crypto dependencies
const CryptoJS = require('./crypto-js');

const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(base32Message: string): number[] {
    const message = base32Message.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (let i = 0; i < message.length; i++) {
        const index = RFC4648_ALPHABET.indexOf(message[i]);
        if (index === -1) continue;
        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return output;
}

export function generateTOTP(secret: string, window = 0): string {
    const decodedSecret = base32Decode(secret);

    // Create WordArray for the secret
    const secretWords = [];
    for (let i = 0; i < decodedSecret.length; i += 4) {
        secretWords.push(
            (decodedSecret[i] << 24) |
            ((decodedSecret[i + 1] || 0) << 16) |
            ((decodedSecret[i + 2] || 0) << 8) |
            (decodedSecret[i + 3] || 0)
        );
    }
    const secretWordArray = (CryptoJS.lib.WordArray as any).create(secretWords, decodedSecret.length);

    // Get time counter
    const epoch = Math.floor(Date.now() / 1000);
    const time = Math.floor(epoch / 30) + window;

    // Counter needs to be 8-byte buffer (64-bit int). 
    // In JS we split it into two 32-bit values.
    const timeBuffer = [
        Math.floor(time / Math.pow(2, 32)),
        time & 0xffffffff
    ];
    const timeWordArray = (CryptoJS.lib.WordArray as any).create(timeBuffer, 8);

    // HMAC-SHA1
    const hmac = CryptoJS.HmacSHA1(timeWordArray, secretWordArray);
    const hmacWords = hmac.words;

    // Convert WordArray to byte array to do dynamic truncation safely
    const hmacBytes: number[] = [];
    for (let i = 0; i < hmac.sigBytes; i++) {
        hmacBytes.push((hmacWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
    }

    const codeOffset = hmacBytes[19] & 0xf;
    const binary =
        ((hmacBytes[codeOffset] & 0x7f) << 24) |
        ((hmacBytes[codeOffset + 1] & 0xff) << 16) |
        ((hmacBytes[codeOffset + 2] & 0xff) << 8) |
        (hmacBytes[codeOffset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

export function generateSecret(length = 16): string {
    const chars = RFC4648_ALPHABET;
    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

export function keyuri(user: string, issuer: string, secret: string): string {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

export function verifyTOTP(token: string, secret: string): boolean {
    if (!token || token.length !== 6) return false;

    // Check current, previous, and next window to account for clock skew
    return token === generateTOTP(secret, 0) ||
        token === generateTOTP(secret, -1) ||
        token === generateTOTP(secret, 1);
}
