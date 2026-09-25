/** Redis keys for cached analytics. Issue/comment writes delete these. */
export const projectAnalyticsKey = (projectId: string) => `analytics:project:${projectId}`;
export const ANALYTICS_TTL_SECONDS = 60;
