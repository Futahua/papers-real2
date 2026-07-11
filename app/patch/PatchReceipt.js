'use strict';
const crypto = require('node:crypto');
function createReceipt(input) { return Object.freeze({ receiptId:`pr_${crypto.randomUUID()}`, ...input }); }
module.exports = { createReceipt };
