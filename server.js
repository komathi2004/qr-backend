require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const User = require("./models/User");
const fileUpload = require("express-fileupload");

// Firebase configuration
const { initializeApp } = require("firebase/app");
const { getAnalytics } = require("firebase/analytics");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } = require("firebase/firestore");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8Xg__TRjlVXbpNp7y8o_ZGnWPftGY3UA",
  authDomain: "tn-auth.firebaseapp.com",
  projectId: "tn-auth",
  storageBucket: "tn-auth.firebasestorage.app",
  messagingSenderId: "27973316069",
  appId: "1:27973316069:web:3f189852358c64814ad30c",
  measurementId: "G-CJ4QDEC60W"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
// Note: Analytics typically only works in browser environments
// const analytics = getAnalytics(firebaseApp);
const storage = getStorage(firebaseApp);
const db = getFirestore(firebaseApp);

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// Folder where QR codes are stored
const QR_CODE_FOLDER = path.join(__dirname, "qr_codes");

// Ensure QR code folder exists
if (!fs.existsSync(QR_CODE_FOLDER)) {
  fs.mkdirSync(QR_CODE_FOLDER, { recursive: true });
}

// Helper function to format current date and time
const getCurrentDateTime = () => {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
};

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

// 🟢 API to upload QR code to Firebase Storage
app.post("/upload-qr", async (req, res) => {
    try {
        if (!req.files || !req.files.qrCode) {
            return res.status(400).json({ error: "No QR code file uploaded" });
        }

        const { randomNumber } = req.body;
        if (!randomNumber) {
            return res.status(400).json({ error: "Random number is required" });
        }

        // Find the user with the provided random number
        const user = await User.findOne({ randomNumber });
        if (!user) {
            return res.status(404).json({ error: "User not found for this random number" });
        }

        const qrFile = req.files.qrCode;
        const fileExtension = path.extname(qrFile.name);
        const fileName = `${randomNumber}${fileExtension}`;
        
        // Upload to Firebase Storage
        const storageRef = ref(storage, `qrcodes/${fileName}`);
        
        // Convert buffer to Uint8Array for Firebase
        const fileBuffer = new Uint8Array(qrFile.data);
        
        // Upload the file
        const snapshot = await uploadBytes(storageRef, fileBuffer);
        
        // Get the download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        // Update user with the Firebase storage URL
        user.imageUrl = downloadURL;
        user.image = fileName;
        await user.save();
        
        res.json({ 
            message: "QR code uploaded successfully",
            imageUrl: downloadURL 
        });
    } catch (error) {
        console.error("Error uploading QR code:", error);
        res.status(500).json({ error: "Error uploading QR code", details: error.message });
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

        // If we have a Firebase URL, redirect to it
        if (user.imageUrl) {
            console.log("✅ Redirecting to Firebase URL:", user.imageUrl);
            return res.redirect(user.imageUrl);
        }

        // Fall back to local file if Firebase URL isn't available
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

// 🟢 API to record QR code scan in Firebase
app.post("/record-scan", async (req, res) => {
    try {
        const { qrData, deviceInfo, location, userName } = req.body;
        
        if (!qrData) {
            return res.status(400).json({ error: "QR data is required" });
        }
        
        const scanDateTime = getCurrentDateTime();
        
        // Add scan record to Firestore
        const scanRecord = {
            qrData,
            deviceInfo: deviceInfo || "Unknown device",
            location: location || "Location unavailable",
            userName: userName || "User",
            scanDateTime,
            status: "Completed",
            timestamp: serverTimestamp(),
            actions: []
        };
        
        const docRef = await addDoc(collection(db, "scans"), scanRecord);
        console.log("✅ Scan recorded with ID:", docRef.id);
        
        // Find user by randomNumber (qrData)
        const user = await User.findOne({ randomNumber: qrData });
        if (user) {
            // You could update some user stats here if needed
            console.log(`✅ Scan recorded for user: ${user.email}`);
        }
        
        res.json({ 
            success: true, 
            message: "Scan recorded successfully",
            scanId: docRef.id,
            scanDateTime
        });
    } catch (error) {
        console.error("❌ Error recording scan:", error);
        res.status(500).json({ error: "Error recording scan", details: error.message });
    }
});

// 🟢 API to update scan status
app.post("/update-scan/:scanId", async (req, res) => {
    try {
        const { scanId } = req.params;
        const { status, action } = req.body;
        
        const scanRef = doc(db, "scans", scanId);
        const scanSnap = await getDoc(scanRef);
        
        if (!scanSnap.exists()) {
            return res.status(404).json({ error: "Scan record not found" });
        }
        
        const updateData = {};
        if (status) {
            updateData.status = status;
        }
        
        if (action) {
            const scanData = scanSnap.data();
            const actions = scanData.actions || [];
            actions.push({
                type: action,
                timestamp: getCurrentDateTime()
            });
            updateData.actions = actions;
        }
        
        await updateDoc(scanRef, updateData);
        
        res.json({ 
            success: true, 
            message: "Scan updated successfully"
        });
    } catch (error) {
        console.error("❌ Error updating scan:", error);
        res.status(500).json({ error: "Error updating scan", details: error.message });
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

        // If we have a Firebase URL, return it
        if (user.imageUrl) {
            console.log("✅ Returning Firebase URL:", user.imageUrl);
            return res.json({ 
                success: true, 
                imageUrl: user.imageUrl,
                user: {
                    email: user.email,
                    employeeId: user.employeeId,
                    randomNumber: user.randomNumber
                }
            });
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
//changed something
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));