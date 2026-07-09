'use strict';

const crypto = require('node:crypto');

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = { newId };
