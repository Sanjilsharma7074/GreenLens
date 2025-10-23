require("dotenv").config();
const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json({ limit: "10mb" }));

// Serve static frontend (HTML, CSS, JS) from public folder
app.use(express.static(path.join(__dirname, "public")));

// Multer memory storage (Vercel read-only filesystem)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------- ROUTES ----------------

// Root route: serve index.html if exists
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err)
      res.send("Plant Analysis API is live. Use /analyze or /download routes.");
  });
});

// Analyze route
app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const imageData = req.file.buffer.toString("base64");
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      "Analyze this plant image and provide detailed analysis of its species, health, and care recommendations. Plain text only.",
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageData,
        },
      },
    ]);

    const plantInfo = result.response.text();

    res.json({
      result: plantInfo,
      image: `data:${req.file.mimetype};base64,${imageData}`,
    });
  } catch (err) {
    console.error("Error analyzing image:", err);
    res.status(500).json({ error: "Error analyzing image" });
  }
});

// Download PDF route
app.post("/download", async (req, res) => {
  try {
    const { result, image } = req.body;

    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="plant_report.pdf"'
      );
      res.send(pdfBuffer);
    });

    doc.fontSize(24).text("Plant Analysis Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(12).text(result || "No data available");

    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.addPage();
      doc.image(buffer, { fit: [500, 400], align: "center", valign: "center" });
    }

    doc.end();
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).json({ error: "Error generating PDF report" });
  }
});

// Export app for Vercel
module.exports = app;
