const fs = require('fs');
const path = require('path');

const layersDir = path.join(process.cwd(), 'layers');

function renameFiles(dir) {
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      renameFiles(fullPath);
    } else if (stat.isFile() && item.includes('-')) {
      const newName = item.replace(/-/g, ' ');
      const newPath = path.join(dir, newName);
      fs.renameSync(fullPath, newPath);
      console.log(`Renamed: ${fullPath} -> ${newPath}`);
    }
  });
}

console.log('Starting file renaming process...');
renameFiles(layersDir);
console.log('File renaming process completed.');