import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export async function buildPatientQrPdf({ targetUrl }) {
  const qrBuffer = await QRCode.toBuffer("http://localhost:5173", {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Patient Check-In", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text("Scan this QR code to be helped.", { align: "center" });
    doc.moveDown(1.2);

    const qrSize = 260;
    const qrX = (doc.page.width - qrSize) / 2;
    doc.image(qrBuffer, qrX, doc.y, {
      width: qrSize,
      height: qrSize
    });

    doc.moveDown(13);
    doc.fontSize(9).text(targetUrl, { align: "center" });

    doc.end();
  });
}
