const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'saas_mobile_app');

function findFiles(dir, extList, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      // exclude node_modules and .git
      if (file !== 'node_modules' && file !== '.git') {
        findFiles(filePath, extList, fileList);
      }
    } else {
      if (extList.some(ext => file.endsWith(ext))) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
}

const allFiles = findFiles(directoryPath, ['.ts', '.tsx']);
let changedFiles = 0;

allFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let hasChanges = false;

  // Replace standard imports
  if (content.includes("import AsyncStorage from '@react-native-async-storage/async-storage';")) {
    // If it already imports something from '@/utils/storage', we might need to handle it, but simple replace is fine
    // Since we import mmkvAsyncStorage as AsyncStorage, it perfectly substitutes.
    content = content.replace(
      "import AsyncStorage from '@react-native-async-storage/async-storage';",
      "import { mmkvAsyncStorage as AsyncStorage } from '@/utils/storage';"
    );
    hasChanges = true;
  }

  // Handle utils/supabase/client.ts specifically
  if (content.includes("require('@react-native-async-storage/async-storage').default")) {
    content = content.replace(
      "require('@react-native-async-storage/async-storage').default",
      "require('@/utils/storage').mmkvAsyncStorage"
    );
    hasChanges = true;
  }

  if (hasChanges) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
    changedFiles++;
  }
});

console.log(`Total files updated: ${changedFiles}`);
