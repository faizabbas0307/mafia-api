const express = require("express");
const { MongoClient } = require("mongodb");
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

app.get("/user/:id", async (req,res)=>{
   const user = await db.collection("users").findOne({id:req.params.id});
   res.json(user);
});

app.post("/user", async (req,res)=>{
   const result = await db.collection("users").insertOne(req.body);
   res.json(result);
});

app.listen(3000, ()=>{
   console.log("API running");
});