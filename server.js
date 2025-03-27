require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path"); // ✅ Keep only this one!
const fs = require("fs");
const User = require("./models/User");

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// Folder where QR codes are stored
const QR_CODE_FOLDER = path.join(__dirname, "qr_codes");

// 🟢 API to add a user and associate an existing QR code image
app.post("/add-user", async (req, res) => {
    try {
        console.log("Received request body:", req.body);
        const { email, employeeId } = req.body;

        // Validate inputs
        if (!email || !employeeId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists with this email" });
        }

        // Generate a secure random number
        const randomNumber = crypto.randomBytes(16).toString("hex");

        // Assign a dummy image
        const dummyImage = `${randomNumber}.png`; // You will replace this manually later

        const user = new User({ email, employeeId, randomNumber, image: dummyImage });
        await user.save();

        res.json({ message: "User stored successfully", randomNumber });
    } catch (error) {
        console.error("Error storing user:", error);
        res.status(500).json({ error: "Error storing user", details: error.message });
    }
});

// 🟢 API to get QR code image by randomNumber
app.get("/get-qr/:randomNumber", async (req, res) => {
    try {
        const { randomNumber } = req.params;
        console.log("🔍 Looking for user with randomNumber:", randomNumber);

        const user = await User.findOne({ randomNumber });

        if (!user) {
            console.log("❌ User not found for randomNumber:", randomNumber);
            return res.status(404).json({ error: "User not found for this random number" });
        }

        const imagePath = path.join(QR_CODE_FOLDER, user.image);
        console.log("📂 Expected image path:", imagePath);

        // Check if file exists before sending
        if (!fs.existsSync(imagePath)) {
            console.log("❌ Image not found at:", imagePath);
            return res.status(404).json({ error: "QR code image not found for this random number" });
        }

        console.log("✅ Image found! Sending file:", imagePath);
        res.sendFile(imagePath, (err) => {
            if (err) {
                console.error("❌ Error sending file:", err);
                res.status(500).json({ error: "Error retrieving QR code image" });
            } else {
                console.log("✅ Image sent successfully!");
            }
        });
    } catch (error) {
        console.error("❌ Error retrieving QR code image:", error);
        res.status(500).json({ error: "Error retrieving QR code image" });
    }
});


app.post("/login", async (req, res) => {
    try {
        console.log("Login request body:", req.body);
        const { email, employeeId } = req.body;

        // Validate inputs
        if (!email || !employeeId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Find user by email and employeeId
        const user = await User.findOne({ email, employeeId });

        if (!user) {
            console.log("❌ User not found for email and employeeId:", email, employeeId);
            return res.status(404).json({ error: "Invalid credentials" });
        }

        // Construct the full path to the QR code image
        const imagePath = path.join(QR_CODE_FOLDER, user.image);
        console.log("📂 Expected image path:", imagePath);

        // Check if file exists before sending
        if (!fs.existsSync(imagePath)) {
            console.log("❌ Image not found at:", imagePath);
            return res.status(404).json({ error: "QR code image not found for this user" });
        }

        // Send the image file directly
        res.sendFile(imagePath, (err) => {
            if (err) {
                console.error("❌ Error sending file:", err);
                res.status(500).json({ error: "Error retrieving QR code image" });
            } else {
                console.log("✅ Image sent successfully!");
            }
        });

    } catch (error) {
        console.error("❌ Error during login:", error);
        res.status(500).json({ error: "Error during login", details: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));





