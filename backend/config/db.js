const mongoose = require("mongoose");

// Vercel runs each request as a serverless function. Without caching, every
// invocation would open a brand-new MongoDB connection -- fine for one
// visitor, but under real traffic it burns through MongoDB's connection
// limit fast and requests start failing/timing out.
// This caches the connection (and the in-flight connect promise) on the
// global object so it's reused across invocations in the same warm instance.
let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    // Don't crash the whole serverless function -- throw instead so the
    // route that needed the DB can return a proper error response.
    throw new Error("MONGODB_URI is missing. Set it in your environment variables.");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      })
      .then((mongooseInstance) => {
        console.log(`MongoDB connected: ${mongooseInstance.connection.host}`);
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next request tries again instead of being stuck on a
    // failed promise forever.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = connectDB;
