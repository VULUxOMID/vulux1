import { jwtVerify } from "jose";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function createJwtVerifyOptions({ issuer, audienceList, audienceRequired = true }) {
  const normalizedIssuer = normalizeString(issuer);
  const normalizedAudienceList = Array.isArray(audienceList)
    ? audienceList.map((value) => normalizeString(value)).filter(Boolean)
    : [];

  if (audienceRequired && normalizedAudienceList.length === 0) {
    throw Object.assign(new Error("Auth JWT audience is not configured."), { statusCode: 503 });
  }

  return {
    ...(normalizedIssuer ? { issuer: normalizedIssuer } : {}),
    ...(normalizedAudienceList.length > 0
      ? {
          audience:
            normalizedAudienceList.length === 1
              ? normalizedAudienceList[0]
              : normalizedAudienceList,
        }
      : {}),
  };
}

export async function verifyViewerUserId({ token, jwks, jwtVerifyOptions }) {
  const verification = await jwtVerify(token, jwks, jwtVerifyOptions);
  const subject = normalizeString(verification.payload.sub);
  if (!subject) {
    throw new Error("JWT subject is missing.");
  }
  return subject;
}
