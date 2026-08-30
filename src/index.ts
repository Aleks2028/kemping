import "dotenv/config";
import "./config";
import "./models/database";
import "./app";

const port = process.env.PORT ?? 3000;
console.log(`Kemping server starting on port ${port}`);
