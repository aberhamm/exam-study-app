// Mock BSON module for Jest tests
// This avoids ESM import issues with the real bson module

class ObjectId {
  constructor(id) {
    if (id) {
      if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
        this._id = id;
      } else if (id instanceof ObjectId) {
        this._id = id._id;
      } else {
        this._id = '507f1f77bcf86cd799439011'; // default valid ObjectId
      }
    } else {
      // Generate a random-looking ObjectId
      this._id = Array.from({ length: 24 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
    }
  }

  toString() {
    return this._id;
  }

  toHexString() {
    return this._id;
  }

  static isValid(id) {
    if (!id) return false;
    if (typeof id === 'string') {
      return id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
    }
    if (id instanceof ObjectId) {
      return true;
    }
    return false;
  }
}

module.exports = {
  ObjectId,
  BSON: {},
  BSONError: class BSONError extends Error {},
  BSONType: {},
};
