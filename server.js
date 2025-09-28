// server.js
const app = require('./app');
const mongoose = require('mongoose');

const port = process.env.PORT || 3000;
const mongoUrl =
  process.env.MONGO_URL || 'mongodb://localhost:27017/hdapp?authSource=admin';

// Connect to MongoDB and start HTTP server ONLY after a successful DB connect
mongoose
  .connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');

    const server = app.listen(port, () =>
      console.log(`🚀 Server up on http://localhost:${port}`)
    );

    // Graceful shutdown (useful in Docker)
    const shutdown = (sig) => () => {
      console.log(`\n${sig} received, shutting down...`);
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log('🔌 Mongo connection closed.');
          process.exit(0);
        });
      });
    };
    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  });
