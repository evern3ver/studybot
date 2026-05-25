const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: String,
  done: { type: Boolean, default: false },
  deadline: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  role: { type: String, enum: ['student', 'destytojas'], default: 'student' },
  groupCodes: { type: [String], default: [] },
  consentGiven: { type: Boolean, default: false },
  tasks: [taskSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);