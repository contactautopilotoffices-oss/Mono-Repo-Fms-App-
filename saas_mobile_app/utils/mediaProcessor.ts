import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { Skia } from '@shopify/react-native-skia';

import * as ImageManipulator from 'expo-image-manipulator';

// Load the font lazily so we don't block app startup
let cachedFont: any = null;
async function getSkiaFont() {
  if (cachedFont) return cachedFont;
  
  try {
    const asset = Asset.fromModule(require('../assets/fonts/Poppins-Regular.ttf'));
    await asset.downloadAsync();
    
    // In React Native, fetch works for local file:// URIs
    const response = await fetch(asset.localUri!);
    const buffer = await response.arrayBuffer();
    
    const data = Skia.Data.fromBytes(new Uint8Array(buffer));
    const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (!typeface) throw new Error('Failed to create typeface');
    
    cachedFont = Skia.Font(typeface, 24); // Size 24 for timestamp
    return cachedFont;
  } catch (err) {
    console.warn('[MediaProcessor] Failed to load font for timestamp:', err);
    return null;
  }
}

/**
 * Compresses and stamps an image with the current timestamp (or a provided one),
 * exactly matching the web app's style and < 1MB target.
 */
export async function processAndStampImage(uri: string, timestamp?: string): Promise<string> {
  const timeStr = timestamp || new Date().toLocaleString('en-GB', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit', second: '2-digit', 
    hour12: false 
  }).replace(',', '');

  try {
    // 1. Initial resize via ImageManipulator to save memory before Skia processing
    // We target max 1200px width or height.
    const initialManip = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    const response = await fetch(initialManip.uri);
    const buffer = await response.arrayBuffer();
    const data = Skia.Data.fromBytes(new Uint8Array(buffer));
    const image = Skia.Image.MakeImageFromEncoded(data);
    
    if (!image) throw new Error('Skia failed to decode image');

    const width = image.width();
    const height = image.height();

    const surface = Skia.Surface.Make(width, height);
    if (!surface) throw new Error('Skia failed to create surface');
    
    const canvas = surface.getCanvas();
    
    // Draw original image
    canvas.drawImage(image, 0, 0, Skia.Paint());

    // Draw Timestamp Overlay (bottom right)
    const font = await getSkiaFont();
    if (font) {
      const textWidth = font.getTextWidth(timeStr);
      const paddingX = 16;
      const paddingY = 8;
      
      const rectX = width - textWidth - paddingX * 2 - 10;
      const rectY = height - font.getSize() - paddingY * 2 - 10;
      
      const bgPaint = Skia.Paint();
      bgPaint.setColor(Skia.Color('rgba(0,0,0,0.6)'));
      
      canvas.drawRRect(
        Skia.RRectXY(
          Skia.XYWHRect(rectX, rectY, textWidth + paddingX * 2, font.getSize() + paddingY * 2),
          8, 8
        ),
        bgPaint
      );
      
      const textPaint = Skia.Paint();
      textPaint.setColor(Skia.Color('white'));
      canvas.drawText(timeStr, rectX + paddingX, rectY + font.getSize() + paddingY - 2, textPaint, font);
    }

    const stampedImage = surface.makeImageSnapshot();
    const base64Data = stampedImage.encodeToBase64(Skia.ImageFormat.WEBP, 80);
    
    const outUri = `${FileSystem.cacheDirectory}stamped_${Date.now()}.webp`;
    await FileSystem.writeAsStringAsync(outUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
    
    // Cleanup Skia resources
    image.dispose();
    surface.dispose();
    
    return outUri;
  } catch (err) {
    console.error('[MediaProcessor] Image processing failed:', err);
    // Fallback: just compress normally if Skia fails
    const fallback = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
    );
    return fallback.uri;
  }
}

/**
 * Compresses a video using react-native-compressor to target < 2MB.
 */
export async function processVideo(uri: string): Promise<string> {
  try {
    let Video: any;
    try {
      // Lazy load to prevent Expo Go from crashing on startup
      Video = require('react-native-compressor').Video;
    } catch (e) {
      console.warn('[MediaProcessor] react-native-compressor is not available (likely running in Expo Go). Skipping video compression.');
      return uri;
    }

    const compressedUri = await Video.compress(uri, {
      compressionMethod: 'auto',
    });
    return compressedUri;
  } catch (err) {
    console.error('[MediaProcessor] Video compression failed:', err);
    return uri; // fallback to original if it fails
  }
}

/**
 * Simple image compression for upload - targets < 2MB (well under Supabase 5MB limit)
 * Used for visitor photos and other uploads
 */
export async function compressImageForUpload(uri: string): Promise<string> {
  try {
    // Start with aggressive compression: 800px width, 50% quality WebP
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (err) {
    console.error('[MediaProcessor] Image compression failed:', err);
    // Fallback: return original URI if compression fails
    return uri;
  }
}
