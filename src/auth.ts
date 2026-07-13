import { createRemoteJWKSet, jwtVerify } from 'jose'

// Per-isolate JWKS cache. createRemoteJWKSet caches keys internally and
// re-fetches on kid rotation/miss, so this must be created once at module
// scope and reused across requests -- NOT recreated per request.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
let jwksTeamDomain: string | undefined

function getJwks(teamDomain: string) {
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksTeamDomain = teamDomain
  }
  return jwks
}

/**
 * Verifies the Cloudflare Access JWT on an admin request.
 *
 * Reads the `Cf-Access-Jwt-Assertion` request header (NOT the `CF_Authorization`
 * cookie) and validates it against the team's JWKS. Any failure -- missing
 * header, bad signature, wrong issuer/audience, expired token -- resolves to
 * `false`. Callers must treat `false` as an unconditional 403; this function
 * never throws.
 */
export async function isValidAccessRequest(
  request: Request,
  teamDomain: string,
  aud: string,
): Promise<boolean> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return false

  try {
    await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
    })
    return true
  } catch {
    return false
  }
}
