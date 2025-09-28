const app = require("./app");
const mongoose = require("mongoose");

const port = process.env.PORT || 3000;
const mongoUrl =
  process.env.MONGO_URL || "mongodb://localhost:27017/hdapp?authSource=admin";

// Connect to MongoDB
mongoose
  .connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");

    // Start server only after DB connection
    app.listen(port, () => console.log(`🚀 Server up on http://localhost:${port}`));
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB", err);
    process.exit(1);
  });
