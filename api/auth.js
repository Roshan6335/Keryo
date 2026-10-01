// api/auth.js — Shared Authentication & Security Helper
'use strict';

import crypto from 'crypto';

let jwksCache = null;
let jwksFetchTime = 0;

export function setCorsHeaders(res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Google-Token');
}

async function fetchGoogleJWKS() {
    const now = Date.now();
    if (jwksCache && (now - jwksFetchTime < 3600000)) {
        return jwksCache;
    }
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) throw new Error('Failed to fetch Google JWKS');
    jwksCache = await res.json();
    jwksFetchTime = now;
    return jwksCache;
}

export async function verifyGoogleToken(token) {
    if (!token) throw new Error('No authentication token provided');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid authentication token format');

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    if (header.alg !== 'RS256') {
        throw new Error('Invalid signature algorithm');
    }

    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
        throw new Error('Invalid token issuer');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || '96652804843-a2ceqr4nuhqp4jj4jgged25ipaf3nhvd.apps.googleusercontent.com';
    if (payload.aud !== clientId) {
        throw new Error('Invalid token audience');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
        throw new Error('Token has expired');
    }

    const jwks = await fetchGoogleJWKS();
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) throw new Error('Matching key ID not found in Google JWKS');

    const publicKey = crypto.createPublicKey({
        format: 'jwk',
        key: {
            kty: 'RSA',
            n: key.n,
            e: key.e,
            alg: 'RS256',
            use: 'sig'
        }
    });

    const verifier = crypto.createVerify('SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const isVerified = verifier.verify(publicKey, Buffer.from(signatureB64, 'base64url'));

    if (!isVerified) throw new Error('Invalid token signature');

    return payload;
}
