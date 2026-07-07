const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'assets/images/autopilot-logo-new.png');
const outputPath = path.join(__dirname, 'assets/images/autopilot-logo-adaptive.png');

async function padIcon() {
  try {
    const metadata = await sharp(inputPath).metadata();
    const w = metadata.width;
    const h = metadata.height;
    
    const padX = Math.round(w * 0.35);
    const padY = Math.round(h * 0.35);
    
    await sharp(inputPath)
      .extend({
        top: padY,
        bottom: padY,
        left: padX,
        right: padX,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .toFile(outputPath);
      
    console.log('Successfully padded icon and saved to', outputPath);
  } catch (err) {
    console.error('Error padding icon:', err);
  }
}

padIcon();
