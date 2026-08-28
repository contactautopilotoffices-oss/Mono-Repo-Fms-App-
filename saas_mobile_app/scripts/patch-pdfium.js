const fs = require('fs');
const path = require('path');

const gradleFilePath = path.resolve(__dirname, '../node_modules/react-native-pdf/android/build.gradle');

if (fs.existsSync(gradleFilePath)) {
  let content = fs.readFileSync(gradleFilePath, 'utf8');
  if (content.includes("io.legere:pdfiumandroid:1.0.24")) {
    content = content.replace(
      "io.legere:pdfiumandroid:1.0.24",
      "io.legere:pdfiumandroid:1.0.34"
    );
    fs.writeFileSync(gradleFilePath, content, 'utf8');
    console.log('[patch-pdfium] Successfully patched react-native-pdf to use io.legere:pdfiumandroid:1.0.34 (16 KB compatible).');
  } else if (content.includes("io.legere:pdfiumandroid:1.0.34")) {
    console.log('[patch-pdfium] react-native-pdf is already patched with 1.0.34.');
  }
}
