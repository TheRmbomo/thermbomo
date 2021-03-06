const mongoose = require('mongoose')
const Schema = mongoose.Schema

const UserActivity = new Schema({
  html: String,
  user: {
    type: String,
    ref: 'User'
  }
})

module.exports = mongoose.model('UserActivity', UserActivity, 'UserActivity')
