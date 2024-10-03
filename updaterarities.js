const fs = require('fs');
const path = require('path');

const basePath = process.cwd();
const layersDataPath = path.join(basePath, 'layers_data.json');
const layersDir = path.join(basePath, 'layers');

// Read the layers_data.json file
const layersData = JSON.parse(fs.readFileSync(layersDataPath, 'utf8'));

// Function to update filenames with rarity
function updateFilenames(layerData, layerName) {
  const layerPath = path.join(layersDir, layerName);
  
  layerData.forEach(item => {
    const oldPath = path.join(layerPath, item.fileName);
    const newFileName = `${item.name}#${item.rarity}.png`;
    const newPath = path.join(layerPath, newFileName);

    // Rename the file
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`Updated: ${item.fileName} -> ${newFileName}`);
      
      // Update the fileName in the layersData object
      item.fileName = newFileName;
    } else {
      console.log(`File not found: ${item.fileName}`);
    }
  });
}

// Update filenames for each layer
Object.entries(layersData).forEach(([layerName, layerData]) => {
  updateFilenames(layerData, layerName);
});

// Write the updated data back to layers_data.json
fs.writeFileSync(layersDataPath, JSON.stringify(layersData, null, 2));

console.log('Filenames updated successfully!');