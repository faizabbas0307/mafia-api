const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const uri = process.env.MONGO_URI;
const API_KEY = process.env.API_KEY || "myapikey1234";

let db;

// MongoDB connection
async function connectDB() {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        db = client.db("gamedb");
        console.log("MongoDB connected");
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    }
}

connectDB();


// API Key middleware
app.use((req, res, next) => {

    const key = req.headers["api-key"];

    if (process.env.NODE_ENV === "production") {
        if (!key || key !== API_KEY) {
            return res.status(401).json({ error: "Unauthorized" });
        }
    }

    next();
});


// Convert string IDs to ObjectId
function convertIds(obj) {

    if (!obj || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) return obj.map(convertIds);

    const newObj = {};

    for (const [k, v] of Object.entries(obj)) {

        if (
            typeof v === "string" &&
            v.length === 24 &&
            /^[0-9a-fA-F]{24}$/.test(v) &&
            k.includes("_id")
        ) {
            newObj[k] = new ObjectId(v);
        } else {
            newObj[k] = convertIds(v);
        }
    }

    return newObj;
}


// Health check
app.get("/", (req, res) => {
    res.json({ status: "API running" });
});


// Universal MongoDB Action API
app.post("/action/:action", async (req, res) => {

    try {

        const action = req.params.action;
        const { collection, filter, document, update, pipeline } = req.body;

        if (!collection) {
            return res.status(400).json({ error: "Collection required" });
        }

        const coll = db.collection(collection);

        const f = convertIds(filter || {});
        const doc = convertIds(document);
        const upd = convertIds(update);

        let result;

        switch (action) {

            case "find":
                const docs = await coll.find(f).toArray();
                result = { documents: docs };
                break;

            case "findOne":
                const single = await coll.findOne(f);
                result = { document: single };
                break;

            case "insertOne":
                const ins = await coll.insertOne(doc);
                result = { insertedId: ins.insertedId };
                break;

            case "updateOne":
                const u1 = await coll.updateOne(f, upd);
                result = {
                    matchedCount: u1.matchedCount,
                    modifiedCount: u1.modifiedCount
                };
                break;

            case "updateMany":
                const um = await coll.updateMany(f, upd);
                result = {
                    matchedCount: um.matchedCount,
                    modifiedCount: um.modifiedCount
                };
                break;

            case "deleteOne":
                const d1 = await coll.deleteOne(f);
                result = { deletedCount: d1.deletedCount };
                break;

            case "deleteMany":
                const dm = await coll.deleteMany(f);
                result = { deletedCount: dm.deletedCount };
                break;

            case "aggregate":
                const agg = await coll.aggregate(pipeline || []).toArray();
                result = agg;
                break;

            default:
                return res.status(400).json({ error: "Invalid action" });
        }

        res.json(result);

    } catch (err) {

        console.error("API Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// Start server
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

