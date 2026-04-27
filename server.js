require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const ensureSystemRoles = require('./src/utils/ensureSystemRoles');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5000;

// Drop the non-sparse employeeId_1 index so Mongoose recreates it with sparse:true.
// Required once after the User schema gained sparse:true on employeeId.
const fixEmployeeIdIndex = async () => {
  try {
    const col = mongoose.connection.collection('users');
    const indexes = await col.indexes();
    const bad = indexes.find(
      (i) => i.name === 'employeeId_1' && !i.sparse
    );
    if (bad) {
      await col.dropIndex('employeeId_1');
      console.log('[migration] Dropped non-sparse employeeId_1 index — will be recreated as sparse');
    }
  } catch (e) {
    // Index may not exist yet on a fresh DB — safe to ignore
  }
};

const startServer = async () => {
  await connectDB();
  await fixEmployeeIdIndex();
  await ensureSystemRoles();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running in ${process.env.NODE_ENV} mode`);
    console.log(`📡 Listening on http://0.0.0.0:${PORT}`);
    console.log(`🌐 API Base: http://192.168.1.35:${PORT}/api/v1`);
    console.log(`📁 Uploads: http://192.168.1.35:${PORT}/uploads\n`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Forcing exit after 10s');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    shutdown('UnhandledRejection');
  });
};

startServer();
