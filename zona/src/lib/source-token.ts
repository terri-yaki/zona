import * as Crypto from 'expo-crypto';

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function createSourceCredential() {
  const token = `zona_live_${base64Url(await Crypto.getRandomBytesAsync(32))}`;
  const tokenHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    token,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { token, tokenHash, keyPrefix: token.slice(0, 18) };
}
