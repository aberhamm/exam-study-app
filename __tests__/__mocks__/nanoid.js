// Mock nanoid module for Jest tests

function nanoid() {
  return 'test-nanoid-' + Math.random().toString(36).substring(2, 15);
}

module.exports = {
  nanoid,
};
