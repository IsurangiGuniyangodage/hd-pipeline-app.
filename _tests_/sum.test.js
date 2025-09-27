const request = require('supertest');
const app = require('../app');

test('adds numbers via /sum', async () => {
  const res = await request(app).get('/sum?a=2&b=3');
  expect(res.status).toBe(200);
  expect(res.body.sum).toBe(5);
});
