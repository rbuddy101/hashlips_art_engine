const fs = require('fs');
const path = require('path');

const basePath = process.cwd();
const layersDir = `${basePath}/layers`;
const outputFile = `${basePath}/layers_data.json`;

const rarityDelimiter = '#';

function getLayerData(dir) {
  const layerData = {};

  fs.readdirSync(dir).forEach(layerFolder => {
    const layerPath = path.join(dir, layerFolder);
    if (fs.statSync(layerPath).isDirectory()) {
      layerData[layerFolder] = [];

      fs.readdirSync(layerPath).forEach(file => {
        if (file.endsWith('.png')) {
          const name = file.replace('.png', '');
          const [trait, weight] = name.split(rarityDelimiter);
          const rarity = parseInt(weight) || 30; // Default to 30 if no weight is specified
          
          // Create new file name with rarity
          const newFileName = `${trait}.png`;
          
          // Rename the file
          fs.renameSync(path.join(layerPath, file), path.join(layerPath, newFileName));
          
          layerData[layerFolder].push({
            name: trait,
            fileName: newFileName,
            rarity: rarity
          });
        }
      });
    }
  });

  return layerData;
}

function saveLayersToJson() {
  const layerData = getLayerData(layersDir);
  
  fs.writeFileSync(outputFile, JSON.stringify(layerData, null, 2));
  console.log(`Layer data saved to ${outputFile}`);
  console.log('File names updated with rarity values');
}

saveLayersToJson();