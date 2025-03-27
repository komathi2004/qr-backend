const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true, unique: true },
  randomNumber: { type: String, required: true },
  image: { type: String, required: true } // This ensures image is stored
});

module.exports = mongoose.model("User", userSchema);
