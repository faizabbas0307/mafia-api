const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
    await client.connect();
    db = client.db("gamedb");
    console.log("MongoDB connected");
}

connectDB();

// API Key middleware
const API_KEY = process.env.API_KEY || "myapikey1234"; // Change in production

app.use((req, res, next) => {
    // The PHP app will send 'api-key' header
    const key = req.headers['api-key'];
    if (key !== API_KEY && process.env.NODE_ENV === 'production') {
        // Optional: enable authentication for production
        // return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

// Helper: recursively cast strings to ObjectId and Unix MS to Date if applicable
function castValues(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(castValues);
    const newObj = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.length === 24 && /^[0-9a-fA-F]{24}$/.test(v) && k.includes('_id')) {
            newObj[k] = new ObjectId(v);
        } else if (typeof v === 'object' && v !== null && Object.keys(v).length === 1 && v['$date']) {
            // Support legacy MongoDB BSON date wrapper or specific timestamp format
            newObj[k] = new Date(v['$date']);
        } else if (k === 'created_at' || k === 'last_activity') {
            // Treat specific keys as dates if they are numeric timestamps
            if (typeof v === 'number') {
                newObj[k] = new Date(v);
            } else {
                newObj[k] = castValues(v);
            }
        } else {
            newObj[k] = castValues(v);
        }
    }
    return newObj;
}

// User endpoints requested
app.get("/user/:id", async (req, res) => {
    const user = await db.collection("users").findOne({ id: req.params.id });
    res.json(user);
});

app.post("/user", async (req, res) => {
    const result = await db.collection("users").insertOne(req.body);
    res.json(result);
});

// Universal Action Proxy
app.post("/action/:action", async (req, res) => {
    try {
        const { action } = req.params;
        const { collection, filter: rawFilter, document: rawDoc, update: rawUpdate } = req.body;

        if (!collection) return res.status(400).json({ error: "Collection required" });

        const coll = db.collection(collection);
        const filter = castValues(rawFilter || {});
        const document = castValues(rawDoc);
        const update = castValues(rawUpdate);

        let result = {};
        switch (action) {
            case "find":
                // Handles multiple results
                const docs = await coll.find(filter).toArray();
                result = { documents: docs };
                break;
            case "findOne":
                const doc = await coll.findOne(filter);
                result = { document: doc };
                break;
            case "insertOne":
                const ins = await coll.insertOne(document);
                result = { insertedId: ins.insertedId };
                break;
            case "updateOne":
                const upd = await coll.updateOne(filter, update);
                result = { matchedCount: upd.matchedCount, modifiedCount: upd.modifiedCount };
                break;
            case "updateMany":
                const upm = await coll.updateMany(filter, update);
                result = { matchedCount: upm.matchedCount, modifiedCount: upm.modifiedCount };
                break;
            case "deleteOne":
                const del = await coll.deleteOne(filter);
                result = { deletedCount: del.deletedCount };
                break;
            case "deleteMany":
                const delm = await coll.deleteMany(filter);
                result = { deletedCount: delm.deletedCount };
                break;
            case "aggregate":
                const pipeline = castValues(req.body.pipeline || []);
                const agg = await coll.aggregate(pipeline).toArray();
                // Send back as raw array to match what MongoDataApiClient returns when we bypass the wrapper
                result = agg;
                break;
            default:
                return res.status(400).json({ error: "Invalid action" });
        }
        res.json(result);
    } catch (err) {
        console.error(`Error on /action/${req.params.action}:`, err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("API running on port " + PORT);
});

