const mongoose = require('mongoose');

const groupTaskSchema = new mongoose.Schema({
  name: String,
  deadline: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const groupSchema = new mongoose.Schema({
  groupCode: { type: String, unique: true },
  groupName: String,
  adminId: String,
  tasks: [groupTaskSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', groupSchema);