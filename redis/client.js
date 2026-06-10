const Redis = require('ioredis');
require('dotenv').config();

const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: null,
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
