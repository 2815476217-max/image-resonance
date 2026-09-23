export const dynamic = 'force-dynamic';

function deploymentCommit() {
  return process.env.CLOUDBASE_GIT_COMMIT
    || process.env.GIT_COMMIT
    || process.env.COMMIT_SHA
    || process.env.SOURCE_VERSION
    || 'not-provided-by-runtime';
}

export function GET() {
  return Response.json({
    deploymentCommit: deploymentCommit(),
    environment: process.env.NODE_ENV || 'unknown',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    serviceStatus: 'ok',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
