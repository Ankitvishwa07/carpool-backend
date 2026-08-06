const { createClient } = require('redis');

let client;

async function getRedisClient() {
  if (client && client.isOpen) return client;

  client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  client.on('error', (err) => console.error('[redis] Client error:', err.message));

  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

module.exports = { getRedisClient };