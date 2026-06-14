const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Upstash (and any rediss:// endpoint) requires TLS
const tlsOptions = redisUrl.startsWith('rediss://') ? { tls: {} } : {};

const client = new Redis(redisUrl, {
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: null,
  ...tlsOptions,
});

client.on('connect', () => {
  console.log('[redis] connected');
});

client.on('error', (err) => {
  console.error('[redis] error:', err.message);
});

client.on('reconnecting', () => {
  console.warn('[redis] reconnecting…');
});

module.exports = client;
