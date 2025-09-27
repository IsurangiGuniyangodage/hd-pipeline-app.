const request = require('supertest');
const app = require('../app');

const API_KEY = process.env.API_KEY || 'dev-key';

describe('Items CRUD', () => {
  let created;

  test('GET /items starts empty', async () => {
    const res = await request(app).get('/items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /items requires auth', async () => {
    const res = await request(app).post('/items').send({ name: 'One' });
    expect(res.status).toBe(401);
  });

  test('POST /items creates with auth', async () => {
    const res = await request(app)
      .post('/items')
      .set('x-api-key', API_KEY)
      .send({ name: 'One' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    created = res.body;
  });

  test('GET /items/:id returns created', async () => {
    const res = await request(app).get(`/items/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('One');
  });

  test('PUT /items/:id updates with auth', async () => {
    const res = await request(app)
      .put(`/items/${created.id}`)
      .set('x-api-key', API_KEY)
      .send({ name: 'One (edited)' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('One (edited)');
  });

  test('DELETE /items/:id deletes with auth', async () => {
    const res = await request(app)
      .delete(`/items/${created.id}`)
      .set('x-api-key', API_KEY);
    expect(res.status).toBe(204);
  });

  test('GET /items/:id after delete -> 404', async () => {
    const res = await request(app).get(`/items/${created.id}`);
    expect(res.status).toBe(404);
  });
});
