const { MongoClient } = require("mongodb");
const uri = "mongodb://0.0.0.0:27017";
const databaseName = "CPEN_321_DATABASE";

const client = new MongoClient(uri);
const database = client.db(databaseName);

/**
 * Purpose: Attempts to connect to the database.
 * @param None
 * @returns {boolean} True if successful, otherwise false.
 *
 * ChatGPT usage: No
 */
async function connect() {
  try {
    await client.connect();
    console.log("Successfully connected to the database");
    return true;
  } catch (err) {
    console.log("Connection to database failed: " + err);
    await client.close();
    return false;
  }
}

/**
 * Purpose: Disconnects from the database.
 * @param None
 * @returns {boolean} True if successful, otherwise false.
 *
 * ChatGPT usage: No
 */
async function disconnect() {
  await client.close();
  console.log("Successfully disconnected from the database");
  return true;
}

/**
 * Purpose: Get User Collection from Database
 * @param None
 * @returns {Collection} The users collection from the database.
 *
 * ChatGPT usage: No
 */
function getUsersCollection() {
  return database.collection("users");
}

module.exports = { uri, databaseName, connect, disconnect, getUsersCollection };
