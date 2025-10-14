// Mock MongoDB module for Jest tests

const { ObjectId } = require('./bson');

class MongoClient {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }

  async connect() {
    return this;
  }

  async close() {
    return;
  }

  db() {
    return {
      collection: jest.fn(),
    };
  }
}

module.exports = {
  MongoClient,
  ObjectId,
  Db: class Db {},
  Collection: class Collection {},
};
