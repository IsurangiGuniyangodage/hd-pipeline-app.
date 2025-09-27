const request = require('supertest');
const app = require('../app');

describe('sum', () => {
  test('adds numbers via /sum', async () => {
    const res = await request(app).get('/sum?a=2&b=3');
    expect(res.status).toBe(200);
    expect(res.body.result).toBe(5);
  });

  test('400 on non-numbers', async () => {
    const res = await request(app).get('/sum?a=hi&b=3');
    expect(res.status).toBe(400);
  });

  test('/health ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
