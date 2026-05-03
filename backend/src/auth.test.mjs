import test from "node:test";
import assert from "node:assert/strict";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

import { createJwtVerifyOptions, verifyViewerUserId } from "./auth.js";

const ISSUER = "https://issuer.vulu.test";
const AUDIENCE = "vulu-backend";
const SUBJECT = "user_test_123";

async function buildKeySet() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  return {
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    privateKey,
  };
}

async function signJwt(privateKey, options = {}) {
  const jwt = new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(SUBJECT)
    .setIssuer(ISSUER)
    .setIssuedAt();

  if (Object.hasOwn(options, "audience")) {
    const audience = options.audience;
    if (Array.isArray(audience)) {
      for (const value of audience) {
        jwt.setAudience(value);
      }
    } else if (typeof audience === "string") {
      jwt.setAudience(audience);
    }
  } else {
    jwt.setAudience(AUDIENCE);
  }

  if (typeof options.expirationTime === "string") {
    jwt.setExpirationTime(options.expirationTime);
  } else {
    jwt.setExpirationTime("2h");
  }

  return jwt.sign(privateKey);
}

test("verifyViewerUserId accepts token with valid issuer/audience/signature/expiry", async () => {
  const { jwks, privateKey } = await buildKeySet();
  const token = await signJwt(privateKey);
  const jwtVerifyOptions = createJwtVerifyOptions({
    issuer: ISSUER,
    audienceList: [AUDIENCE],
  });

  const userId = await verifyViewerUserId({ token, jwks, jwtVerifyOptions });
  assert.equal(userId, SUBJECT);
});

test("verifyViewerUserId rejects token missing aud claim", async () => {
  const { jwks, privateKey } = await buildKeySet();
  const token = await signJwt(privateKey, { audience: null });
  const jwtVerifyOptions = createJwtVerifyOptions({
    issuer: ISSUER,
    audienceList: [AUDIENCE],
  });

  await assert.rejects(
    verifyViewerUserId({ token, jwks, jwtVerifyOptions }),
    /aud/i,
  );
});

test("verifyViewerUserId rejects token with wrong aud claim", async () => {
  const { jwks, privateKey } = await buildKeySet();
  const token = await signJwt(privateKey, { audience: "wrong-audience" });
  const jwtVerifyOptions = createJwtVerifyOptions({
    issuer: ISSUER,
    audienceList: [AUDIENCE],
  });

  await assert.rejects(
    verifyViewerUserId({ token, jwks, jwtVerifyOptions }),
    /aud/i,
  );
});

test("verifyViewerUserId rejects expired token", async () => {
  const { jwks, privateKey } = await buildKeySet();
  const token = await signJwt(privateKey, { expirationTime: "1 second ago" });
  const jwtVerifyOptions = createJwtVerifyOptions({
    issuer: ISSUER,
    audienceList: [AUDIENCE],
  });

  await assert.rejects(
    verifyViewerUserId({ token, jwks, jwtVerifyOptions }),
    /exp|expired/i,
  );
});

test("createJwtVerifyOptions rejects empty audience configuration", () => {
  assert.throws(
    () => createJwtVerifyOptions({ issuer: ISSUER, audienceList: [] }),
    /audience is not configured/i,
  );
});

test("createJwtVerifyOptions supports issuer-only verification when audience is optional", async () => {
  const { jwks, privateKey } = await buildKeySet();
  const token = await signJwt(privateKey, { audience: null });
  const jwtVerifyOptions = createJwtVerifyOptions({
    issuer: ISSUER,
    audienceList: [],
    audienceRequired: false,
  });

  const userId = await verifyViewerUserId({ token, jwks, jwtVerifyOptions });
  assert.equal(userId, SUBJECT);
});
